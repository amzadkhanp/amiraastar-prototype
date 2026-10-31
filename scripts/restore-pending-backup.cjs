// Apply an uploaded production backup before the app opens its SQLite database.
// A restore is requested by placing a validated backup at DATA_DIR/restore.pending.sqlite
// and restarting the service. With no pending file, this script is a no-op.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const pending = path.join(dataDir, 'restore.pending.sqlite');
const restore = path.join(__dirname, 'restore-backup.cjs');

if (!fs.existsSync(pending)) process.exit(0);
if (!fs.lstatSync(pending).isFile()) {
  console.error(`Pending restore must be a regular file: ${pending}`);
  process.exit(1);
}

console.log(`Applying pending AmiraASTAR backup: ${pending}`);
const result = spawnSync(process.execPath, [restore, pending], {
  env: { ...process.env, DATA_DIR: dataDir },
  stdio: 'inherit'
});
if (result.error) {
  console.error(`Could not run the restore command: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  if (result.status === 3) {
    console.error('Restore rollback was incomplete. Keep the service stopped and inspect the database files before restarting.');
    process.exit(1);
  }
  // Keep the current database available if validation fails. Move the bad upload aside
  // so a later restart doesn't repeatedly attempt the same restore.
  const rejected = `${pending}.rejected-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.renameSync(pending, rejected);
  console.error(`Backup was rejected and preserved at ${rejected}; starting with the existing database.`);
  process.exit(0);
}

fs.rmSync(pending);
console.log('Pending backup applied successfully.');
