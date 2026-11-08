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

test('required macOS native status owns UTF8 metadata after later calls and closure', {
  skip: process.platform === 'darwin' ? false : 'macOS metadata runtime coverage only',
}, () => {
  const name = `node193-${process.pid}-${Date.now()}-\u65e5\u672c\u{1f680}`;
  assert.ok(Buffer.byteLength(name, 'utf8') <= 63);
  // This existing helper creates a real sender; backend failures must fail here.
  const sender = native.createTestSenderNative(name);
  let receiver;
  try {
    receiver = new Receiver(name, { applicationName: 'node193-reader' });
    const status = receiver.status();
    assert.deepEqual(Object.keys(status).sort(), ['closed', 'connected']);
    assert.equal(status.closed, false);
    assert.ok(status.connected);
    const info = status.connected;
    assert.deepEqual(Object.keys(info).sort(), [
      'name', 'applicationName', 'id', 'backend', 'width', 'height', 'format',
      'semanticFormat', 'estimatedFps', 'frameCounter', 'lastUpdateTimeNs',
      'nativeFormatKind', 'nativeFormatValue', 'nativeFormatModifier',
    ].sort());
    assert.equal(info.name, name);
    assert.equal(info.applicationName, 'node-nozzle-test');
    assert.equal(typeof info.id, 'string');
    assert.ok(info.id.length > 0);
    assert.equal(info.backend, 2); // NOZZLE_BACKEND_METAL
    for (const field of ['width', 'height', 'format', 'semanticFormat',
      'estimatedFps', 'nativeFormatKind', 'nativeFormatValue']) {
      assert.equal(typeof info[field], 'number', field);
    }
    for (const field of ['frameCounter', 'lastUpdateTimeNs', 'nativeFormatModifier']) {
      assert.equal(typeof info[field], 'bigint', field);
    }
    const retained = { ...info };
    assert.deepEqual(receiver.status(), status);
    receiver.close();
    native.destroyTestSenderNative(sender);

    assert.deepEqual(status, { closed: false, connected: retained });
    assert.equal(info.name, name);
    assert.equal(info.applicationName, 'node-nozzle-test');
    assert.deepEqual(receiver.status(), { closed: true, connected: null });
    // closed above is local destruction, not an observed native disconnect.
  } finally {
    try {
      if (receiver) receiver.close();
    } finally {
      native.destroyTestSenderNative(sender);
    }
  }
});
