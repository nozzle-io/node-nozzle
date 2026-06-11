'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const nozzle = require('..');

test('native binding loads and returns diagnostics', () => {
  const diagnostics = nozzle.diagnostics();
  assert.equal(diagnostics.binding, 'napi');
  assert.equal(diagnostics.napiBaseline, 8);
  assert.equal(typeof diagnostics.openglAvailable, 'boolean');
});

test('native binding load failure is deterministic', () => {
  const result = spawnSync(process.execPath, ['-e', "try { require('./'); process.exit(2); } catch (error) { console.log(error.code); process.exit(error.code === 'NOZZLE_NODE_LOAD_FAILED' ? 0 : 3); }"], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NOZZLE_NODE_BINDING_PATH: path.join(__dirname, 'missing.node'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /NOZZLE_NODE_LOAD_FAILED/);
});
