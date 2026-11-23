// Main-process side of the Aqua SDK worker (`aqua-worker.js`): one lazily
// spawned worker thread that owns the vendored WASM module. Every call here
// is a message round trip; nothing from the SDK runs on the main thread.
const path = require('path');
const { createTaskWorkerHost } = require('../task-worker-host');

// Verification of a few-revision claim tree is milliseconds; the bound is
// for a hostile tree handed to the verifier side, not for the happy path.
const REQUEST_TIMEOUT_MS = 20_000;

let host = null;

function worker() {
  if (!host) {
    host = createTaskWorkerHost({
      name: 'AquaWasm',
      workerPath: path.join(__dirname, 'aqua-worker.js'),
      timeoutMs: REQUEST_TIMEOUT_MS,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    });
  }
  return host;
}

const sdkVersion = () => worker().run('version', {});
const verifyTree = (tree, { fileObjects } = {}) => worker().run('verifyTree', { tree, fileObjects });
const verifyTreeWithLinked = (tree, linkedTrees, { fileObjects } = {}) =>
  worker().run('verifyTreeWithLinked', { tree, linkedTrees, fileObjects });
const applyDisclosure = (tree, policy) => worker().run('applyDisclosure', { tree, policy });
const fullPolicy = (tree) => worker().run('fullPolicy', { tree });
const pseudonymousPolicy = (tree) => worker().run('pseudonymousPolicy', { tree });

/** Terminate the worker (app quitting, tests). The next call respawns it. */
function shutdown() {
  if (!host) return;
  const h = host;
  host = null;
  h.stop();
}

module.exports = {
  REQUEST_TIMEOUT_MS,
  sdkVersion,
  verifyTree,
  verifyTreeWithLinked,
  applyDisclosure,
  fullPolicy,
  pseudonymousPolicy,
  shutdown,
};
