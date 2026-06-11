'use strict';

const path = require('node:path');

class NozzleLoadError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'NozzleLoadError';
    this.code = 'NOZZLE_NODE_LOAD_FAILED';
    this.cause = cause;
  }
}

class NozzleError extends Error {
  constructor(message, code, nativeCode) {
    super(message);
    this.name = 'NozzleError';
    this.code = code;
    this.nativeCode = nativeCode;
  }
}

function loadNativeBinding() {
  const bindingPath = process.env.NOZZLE_NODE_BINDING_PATH || path.join(__dirname, '..', '..', 'build', 'Release', 'nozzle_node.node');
  try {
    return require(bindingPath);
  } catch (cause) {
    throw new NozzleLoadError(`Failed to load node-nozzle native binding at ${bindingPath}`, cause);
  }
}

const native = loadNativeBinding();

function mapNativeError(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string' && typeof error.nativeCode === 'number') {
    return new NozzleError(error.message, error.code, error.nativeCode);
  }
  return error;
}

function callNative(fn) {
  try {
    return fn();
  } catch (error) {
    throw mapNativeError(error);
  }
}

class Receiver {
  constructor(sourceName, options = {}) {
    if (typeof sourceName !== 'string' || sourceName.length === 0) {
      throw new TypeError('Receiver sourceName must be a non-empty string');
    }
    this.sourceName = sourceName;
    this._handle = callNative(() => native.createReceiverNative(sourceName, options));
    this.closed = false;
  }

  status() {
    if (this.closed) {
      return { closed: true, connected: null };
    }
    return callNative(() => native.receiverStatusNative(this._handle));
  }

  close() {
    if (this.closed) {
      return;
    }
    callNative(() => native.destroyReceiverNative(this._handle));
    this.closed = true;
  }

  [Symbol.dispose]() {
    this.close();
  }
}

function listSources() {
  return callNative(() => native.listSourcesNative());
}

function diagnostics() {
  return callNative(() => native.diagnosticsNative());
}

module.exports = {
  Receiver,
  NozzleError,
  NozzleLoadError,
  diagnostics,
  listSources,
};
