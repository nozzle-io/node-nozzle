'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const test_dir = path.join(root, 'test');
const test_files = fs.readdirSync(test_dir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join('test', name));

if (test_files.length === 0) {
  throw new Error('no test files found');
}

const result = spawnSync(process.execPath, ['--test', ...test_files], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) {
  throw result.error;
}
process.exit(result.status === null ? 1 : result.status);
