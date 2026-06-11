'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Receiver, listSources } = require('..');
const native = require('../build/Release/nozzle_node.node');

test('listSources exercises native enumeration path', () => {
  const sources = listSources();
  assert.ok(Array.isArray(sources));
  for (const source of sources) {
    assert.equal(typeof source.name, 'string');
    assert.equal(typeof source.applicationName, 'string');
    assert.equal(typeof source.id, 'string');
    assert.equal(typeof source.backend, 'number');
  }
});


test('native test sender appears in listSources when sender runtime is available', (t) => {
  const name = `node-nozzle-enumeration-${process.pid}`;
  let sender;
  try {
    sender = native.createTestSenderNative(name);
  } catch (error) {
    if (error && (error.code === 'NOZZLE_ERROR_BACKEND_ERROR' || error.code === 'NOZZLE_ERROR_UNSUPPORTED_BACKEND')) {
      t.skip(`native sender runtime unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  try {
    const sources = listSources();
    assert.ok(sources.some((source) => source.name === name), `expected ${name} in ${JSON.stringify(sources)}`);
  } finally {
    native.destroyTestSenderNative(sender);
  }
});

test('receiver lifecycle cleanup is idempotent against a native test sender seam', (t) => {
  const name = `node-nozzle-test-${process.pid}`;
  let sender;
  try {
    sender = native.createTestSenderNative(name);
  } catch (error) {
    if (error && (error.code === 'NOZZLE_ERROR_BACKEND_ERROR' || error.code === 'NOZZLE_ERROR_UNSUPPORTED_BACKEND')) {
      t.skip(`native sender runtime unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  try {
    const receiver = new Receiver(name, { applicationName: 'node-nozzle-test' });
    const status = receiver.status();
    assert.equal(status.closed, false);
    receiver.close();
    receiver.close();
    assert.equal(receiver.closed, true);
    assert.deepEqual(receiver.status(), { closed: true, connected: null });
  } finally {
    native.destroyTestSenderNative(sender);
  }
});

test('receiver creation for a missing source reports a deterministic native error', () => {
  assert.throws(
    () => new Receiver(`node-nozzle-missing-${process.pid}`),
    (error) => error && error.code === 'NOZZLE_ERROR_SENDER_NOT_FOUND'
  );
});

test('receiver rejects empty source names deterministically', () => {
  assert.throws(() => new Receiver(''), /sourceName must be a non-empty string/);
});
