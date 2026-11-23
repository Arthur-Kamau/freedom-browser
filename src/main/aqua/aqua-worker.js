// Worker-thread side of the Aqua SDK (aqua-rs-sdk, vendored WASM build under
// ./vendor/). WASM never runs on Electron's main thread here: a trap in the
// main process is a SIGSEGV rather than a catchable error (see
// ens/colibri-runtime.js), and verification of an untrusted tree is CPU work
// that would freeze every window. The host (`aqua-wasm.js`) hands requests
// over one at a time through task-worker-host's `{ id, op, ... }` protocol.
const { isMainThread, parentPort } = require('node:worker_threads');

// Explicit bounds checks turn an out-of-bounds WASM access into a
// `RuntimeError` instead of a guard-page fault. V8 flags are process-wide and
// read when a module is compiled, so set it before the module loads.
require('node:v8').setFlagsFromString('--wasm-enforce-bounds-checks');

let sdk = null;
let aquafier = null;

function load() {
  if (!aquafier) {
    sdk = require('./vendor/aqua-rs-sdk/aqua_rs_sdk.js');
    aquafier = new sdk.AquafierWasm();
  }
  return aquafier;
}

function wrap(tree) {
  // The SDK's AquaTreeWrapper: the tree, optional file data, optional target.
  return JSON.stringify({ aqua_tree: tree });
}

const OPS = {
  version: () => {
    load();
    return { protocol: sdk.protocolVersion(), crate: sdk.crateVersion(), spec: sdk.specRef() };
  },
  verifyTree: ({ tree, fileObjects }) =>
    JSON.parse(load().verifyAquaTree(wrap(tree), fileObjects ? JSON.stringify(fileObjects) : '[]')),
  verifyTreeWithLinked: ({ tree, linkedTrees, fileObjects }) =>
    JSON.parse(
      load().verifyAquaTreeWithLinkedTrees(
        wrap(tree),
        JSON.stringify((linkedTrees || []).map((t) => ({ aqua_tree: t }))),
        fileObjects ? JSON.stringify(fileObjects) : '[]'
      )
    ),
  applyDisclosure: ({ tree, policy }) =>
    JSON.parse(load().applyDisclosure(wrap(tree), JSON.stringify(policy))),
  fullPolicy: ({ tree }) => JSON.parse(load().fullPolicy(wrap(tree))),
  pseudonymousPolicy: ({ tree }) => JSON.parse(load().pseudonymousPolicy(wrap(tree))),
};

if (!isMainThread && parentPort) {
  parentPort.on('message', (message) => {
    const op = OPS[message?.op];
    if (!op) return;
    try {
      parentPort.postMessage({ id: message.id, ok: true, result: op(message) });
    } catch (err) {
      // A wasm-bindgen error is a string JsValue; a panic surfaces as a
      // RuntimeError after console_error_panic_hook has logged the message.
      const text = typeof err === 'string' ? err : err?.message || String(err);
      parentPort.postMessage({ id: message.id, ok: false, error: text.slice(0, 500) });
    }
  });
}

module.exports = { OPS };
