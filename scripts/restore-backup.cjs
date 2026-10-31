// Restore a downloaded AmiraASTAR SQLite backup after stopping the local server.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || '');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const destination = path.join(dataDir, 'amiraastar.sqlite');

if (!process.argv[2] || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
  console.error('Usage: node scripts/restore-backup.cjs <path-to-amiraastar-backup.sqlite>');
  process.exit(2);
}
if (path.resolve(source).toLowerCase() === path.resolve(destination).toLowerCase()) {
  console.error('The backup file must be separate from the active database file.');
  process.exit(2);
}

function validate(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').get();
    if (!check || check.integrity_check !== 'ok') throw new Error('SQLite integrity check failed.');
    const row = db.prepare('SELECT json FROM app_state WHERE id = 1').get();
    if (!row || !JSON.parse(row.json).users) throw new Error('This file is not an AmiraASTAR database backup.');
  } finally { db.close(); }
}

fs.mkdirSync(dataDir, { recursive: true });
validate(source);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const staged = `${destination}.restore-${process.pid}`;
const previous = `${destination}.before-restore-${stamp}`;
let movedCurrent = false;
const movedSidecars = [];
function removeStagedArtifacts() {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${staged}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }
  if (fs.existsSync(staged)) fs.rmSync(staged);
}
try {
  fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL);
  validate(staged);
  // Opening a WAL-mode database for validation can create sidecars. The staged
  // backup is fully validated and closed, so discard them before installing it.
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${staged}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }
  if (fs.existsSync(destination)) { fs.renameSync(destination, previous); movedCurrent = true; }
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${destination}${suffix}`;
    const previousSidecar = `${previous}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.renameSync(sidecar, previousSidecar);
      movedSidecars.push({ sidecar, previousSidecar });
    }
  }
  fs.renameSync(staged, destination);
} catch (error) {
  const rollbackErrors = [];
  try { removeStagedArtifacts(); }
  catch (cleanupError) { console.error(`Could not remove staged restore files: ${cleanupError.message}`); }
  for (const { sidecar, previousSidecar } of movedSidecars.reverse()) {
    try {
      if (fs.existsSync(previousSidecar) && !fs.existsSync(sidecar)) fs.renameSync(previousSidecar, sidecar);
    } catch (rollbackError) { rollbackErrors.push(rollbackError); }
  }
  try {
    if (movedCurrent && !fs.existsSync(destination) && fs.existsSync(previous)) fs.renameSync(previous, destination);
  } catch (rollbackError) { rollbackErrors.push(rollbackError); }
  if (rollbackErrors.length) {
    console.error('Restore failed and rollback was incomplete. Keep the service stopped and inspect the database and sidecar files before restarting.');
    for (const rollbackError of rollbackErrors) console.error(rollbackError);
    process.exit(3);
  }
  throw error;
}
console.log(`Restored ${destination}`);
if (movedCurrent) console.log(`Previous database preserved at ${previous}`);
