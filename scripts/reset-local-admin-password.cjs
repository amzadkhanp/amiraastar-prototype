// Offline local admin recovery. Run only while the AmiraASTAR server is stopped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const scrypt = promisify(crypto.scrypt);
const ROOT = path.resolve(__dirname, '..');

function loadLocalEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^("|')(.*)\1$/, '$2');
  }
}

async function main() {
  loadLocalEnv(path.join(ROOT, '.env'));
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
  const dbFile = path.join(dataDir, 'amiraastar.sqlite');
  const username = String(process.argv[2] || 'amiraadmin').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error('Usage: reset-local-admin-password.cjs [admin-username]');
  if (!fs.existsSync(dbFile)) throw new Error(`Database not found: ${dbFile}`);

  const db = new DatabaseSync(dbFile);
  let backup = '';
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (!integrity || integrity.integrity_check !== 'ok') throw new Error('Database integrity check failed. No password was changed.');
    const current = db.prepare('SELECT json, revision FROM app_state WHERE id=1').get();
    if (!current) throw new Error('AmiraASTAR app state is missing. No password was changed.');
    const state = JSON.parse(current.json);
    const admin = state.users.find(user => user.u === username && user.role === 'admin' && user.status === 'active');
    if (!admin) throw new Error(`No active admin account named ${username} was found. No password was changed.`);

    const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (checkpoint && Number(checkpoint.busy) !== 0) throw new Error('Database is busy. Stop the server and try again.');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    backup = path.join(dataDir, `amiraastar.sqlite.before-restore-adminreset-${stamp}.sqlite`);
    fs.copyFileSync(dbFile, backup, fs.constants.COPYFILE_EXCL);

    let temporaryPassword;
    do { temporaryPassword = `Aa7${crypto.randomBytes(24).toString('base64url')}`; }
    while (temporaryPassword.toLowerCase().includes(username));
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(temporaryPassword, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    admin.password = `scrypt$32768$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
    admin.mustChange = 1;
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    state.audit.unshift({ t: Date.now(), u: username, a: 'password-reset-issued', d: 'admin password reset locally; change required at next sign-in', bad: 0 });
    state.audit = state.audit.slice(0, 300);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE app_state SET json=?, revision=revision+1 WHERE id=1').run(JSON.stringify(state));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const verify = db.prepare('PRAGMA integrity_check').get();
    if (!verify || verify.integrity_check !== 'ok') throw new Error(`Post-reset integrity check failed. Restore from ${backup} before using the app.`);
    console.log(`Admin username: ${username}`);
    console.log(`Temporary password (shown once; change it at first sign-in): ${temporaryPassword}`);
    console.log(`Database backup: ${backup}`);
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(`Admin password reset failed: ${error.message}`);
  process.exitCode = 1;
});
