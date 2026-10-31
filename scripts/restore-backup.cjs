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
try {
  fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL);
  validate(staged);
  if (fs.existsSync(destination)) { fs.renameSync(destination, previous); movedCurrent = true; }
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${destination}${suffix}`;
    if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${previous}${suffix}`);
  }
  fs.renameSync(staged, destination);
  console.log(`Restored ${destination}`);
  if (movedCurrent) console.log(`Previous database preserved at ${previous}`);
} catch (error) {
  if (fs.existsSync(staged)) fs.rmSync(staged, { force: true });
  if (movedCurrent && !fs.existsSync(destination) && fs.existsSync(previous)) fs.renameSync(previous, destination);
  throw error;
}
