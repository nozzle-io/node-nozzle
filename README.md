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
| Receiver lifecycle/status | Implemented through `nozzle_receiver_create(...)`, `nozzle_receiver_get_connected_info_snapshot(...)`, and `nozzle_receiver_destroy(...)` |
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

Creating a receiver for a missing sender throws `NozzleError` with a deterministic native `code`, such as `NOZZLE_ERROR_SENDER_NOT_FOUND`.

`status()` copies a complete owned native snapshot. Inline identity strings use
capacity-bounded UTF-8 lengths and the existing N-API conversion; scalar Number
and BigInt fields and the JS object shape are unchanged. Returned objects remain
valid after later status calls and receiver/sender destruction. Discovery still
uses its separately owned enumeration array and is not changed by this path.

On a successful snapshot, `connected` contains metadata only when the native
connection flag is nonzero. A false flag returns `connected: null` without
inventing a `lastError`. Existing native-error branches retain their error
behavior. `closed` denotes local receiver destruction, not sender liveness.

The snapshot reports last-observed state, not a fresh liveness check. This
package exposes no frame acquisition method, so polling `status()` alone does
not guarantee prompt observation of sender exit or reconnect. This change does
not add a thread-safety or frame-access contract. The native addon now requires
the `nozzle_receiver_get_connected_info_snapshot` core export, provided by the
pinned core; there is no borrowed-getter fallback.

### Metadata Test Boundary

The existing Node 20/22 CI matrix builds the native addon on macOS, Windows and
Linux. A separate required macOS case in `test/discovery.test.js` uses the
existing real native sender helper, fails on missing backend support, and checks
UTF-8 sender identity and owned status values after later calls and both closes.
The helper's fixed ASCII application name is checked without extending its API.
Other platforms explicitly exclude this case; existing optional tests keep their
skip behavior. No GPU frame, pixel, or cross-process coverage is claimed.

The successful-snapshot/false-flag branch cannot be driven through the current
public receiver API without acquisition. It remains a static-review coverage
gap, not a claimed runtime reproduction. The test's `closed: true` assertion
exercises local handle destruction, not this native false-flag branch. The
metadata test checks Number/BigInt types and retained values, not high-counter
or fractional-FPS runtime evidence.

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
