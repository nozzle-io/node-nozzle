# node-nozzle

Node.js helper/control bindings for [nozzle](https://github.com/nozzle-io/nozzle).

This package is intentionally scoped to Node-side control APIs: source discovery,
receiver lifecycle, and diagnostics. Plain Node does not own an Electron,
WebGL, WebGPU, Metal, D3D, or Vulkan texture context.

No npm publication has been performed for this initial implementation.

## Support table

| Area | Status |
| --- | --- |
| Node baseline | Node 20+ with N-API baseline 8 |
| macOS build/test | Implemented in CI |
| Linux build/test | Implemented in CI |
| Windows build/test | Implemented in CI with MSVC via `scripts/build-native.js`; runtime sender creation may still skip if the host backend is unavailable. |
| Source discovery | Implemented through `nozzle_enumerate_senders(...)` |
| Receiver lifecycle/status | Implemented through `nozzle_receiver_create(...)`, `nozzle_receiver_get_connected_info(...)`, and `nozzle_receiver_destroy(...)` |
| CPU frame access | CPU frame access is not exposed in this initial package. It needs explicit copy-cost, format, and stride documentation before becoming API. |
| Electron/WebGL/WebGPU GPU textures | No Electron/WebGL/WebGPU texture sharing is claimed. Electron texture work belongs in a separate implementation spike. |
| npm publication | Not published; requires a separate maintainer decision. |

## Install/build from source

```bash
git clone --recursive https://github.com/nozzle-io/node-nozzle.git
cd node-nozzle
npm run build
npm test
npm run check:package
```

Linux requires the same native development libraries as nozzle's Linux backend:
`libdrm`, `gbm`, `EGL`, and `GL` development packages. Windows builds require an MSVC developer environment; GitHub Actions configures it with `ilammy/msvc-dev-cmd@v1`.

## API

```js
const { Receiver, diagnostics, listSources } = require('node-nozzle');

console.log(diagnostics());
console.log(listSources());

const receiver = new Receiver('sender-name', { applicationName: 'my-node-app' });
console.log(receiver.status());
receiver.close();
```

### `listSources()`

Returns an array of discovered nozzle senders:

```ts
interface SenderInfo {
  name: string;
  applicationName: string;
  id: string;
  backend: number;
}
```

### `Receiver`

`new Receiver(sourceName, options)` creates a native nozzle receiver handle.
Call `close()` when done. `close()` is idempotent and the native finalizer also
cleans up if the JS object is garbage-collected.

`receiver.status()` returns:

```ts
interface ReceiverStatus {
  closed: boolean;
  connected: ConnectedSenderInfo | null;
  lastError?: string;
}
```

Creating a receiver for a missing sender throws `NozzleError` with a deterministic native `code`, such as `NOZZLE_ERROR_SENDER_NOT_FOUND`. Once a receiver exists, `status()` reports connection state without claiming a frame path that has not been proven.

## Error behavior

Native nozzle errors are converted into JavaScript `NozzleError` instances at the
JS boundary with deterministic `code` and `nativeCode` properties. The nozzle core
is still built without C++ exceptions.

Native binding load failure is converted into `NozzleLoadError` with
`code === 'NOZZLE_NODE_LOAD_FAILED'`.

## Non-goals for this package

- No Electron renderer integration.
- No WebGL/WebGPU texture handle access.
- No zero-copy GPU texture claim.
- No CPU frame API until format, copy cost, and stride behavior are documented and tested.
- No npm publication from this initial repository.
