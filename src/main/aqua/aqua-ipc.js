/**
 * IPC for Aqua identity claims (freedom://identity).
 *
 * Wires the service client, the encrypted store and the claims service to
 * the profile's vault and wallets, and bridges the one thing the service
 * cannot do on its own: a wallet signature. Main never signs here. When a
 * claim or a service sign-in needs one, main sends `aqua:sign-request` to
 * the chrome window; the sidebar shows the message on its approval screen
 * and, on Confirm, signs through the wallet's existing confirmation-token
 * path and answers on `aqua:sign-response`. The identity page itself only
 * ever reaches the `aqua:claims:*` handlers, which the sender policy tiers
 * as INTERNAL.
 */
const crypto = require('crypto');
const fs = require('fs');
const { ipcMain, BrowserWindow, dialog } = require('electron');
const IPC = require('../../shared/ipc-channels');
const { success, failure } = require('../ipc-contract');
const identityManager = require('../identity-manager');
const { loadSettings } = require('../settings-store');
const { broadcastToAllWebContents } = require('../lib/broadcast-to-all-webcontents');
const { createAquaClient, DEFAULT_NODE_URL, AquaServiceError } = require('./aqua-client');
const { createClaimsStore, ClaimsStoreLocked } = require('./claims-store');
const { createClaimsService, ClaimInputError } = require('./claims-service');
const disclosure = require('./disclosure');
const wasm = require('./aqua-wasm');

// A signature request waits for the user; a hardware wallet prompt can
// take a while. Past this the request fails and the screen is withdrawn.
const SIGN_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
// A pasted disclosure request waits on the same consent screen.
const DISCLOSURE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

function configuredNodeUrl() {
  return process.env.FREEDOM_AQUA_NODE_URL || loadSettings()?.aquaNodeUrl || DEFAULT_NODE_URL;
}

function targetWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function addressOfDid(did) {
  const match = /^did:pkh:eip155:\d+:(0x[0-9a-fA-F]{40})$/.exec(String(did || '').trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Build the dependency graph once per node URL. Exported for tests, which
 * pass their own electron-free pieces.
 */
function createAquaDeps({
  nodeUrl = configuredNodeUrl(),
  dataDir = identityManager.getIdentityDataDir(),
  identity = identityManager,
  sendToChrome = (channel, payload) => {
    const win = targetWindow();
    if (!win || win.isDestroyed()) throw new Error('No window to show the signing request in');
    win.webContents.send(channel, payload);
  },
  signTimeoutMs = SIGN_REQUEST_TIMEOUT_MS,
  log = console,
} = {}) {
  const pendingSignatures = new Map();

  async function wallets() {
    return (await identity.getDerivedWallets()) || [];
  }

  async function getActiveWallet() {
    const index = identity.getActiveWalletIndex();
    const wallet = (await wallets()).find((w) => w.index === index);
    if (!wallet?.address) return null;
    return { index: wallet.index, address: wallet.address, type: wallet.type || 'mnemonic' };
  }

  async function isOwnDid(did) {
    const address = addressOfDid(did);
    if (!address) return false;
    return (await wallets()).some((w) => w.address && w.address.toLowerCase() === address);
  }

  async function getSeed() {
    const module = identity.loadIdentityModule();
    const mnemonic = module.getMnemonic();
    return mnemonic ? module.getSeed(mnemonic) : null;
  }

  /** Ask the chrome for a wallet signature; resolves with the signature hex. */
  async function requestSignature({ address, purpose, message, display }) {
    const wallet = (await wallets()).find((w) => w.address && w.address.toLowerCase() === address.toLowerCase());
    if (!wallet) throw new Error('The signing wallet is no longer in this profile');
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingSignatures.delete(requestId);
        reject(new Error('The signing request timed out'));
      }, signTimeoutMs);
      pendingSignatures.set(requestId, { resolve, reject, timer });
      try {
        sendToChrome(IPC.AQUA_SIGN_REQUEST, {
          requestId,
          walletIndex: wallet.index,
          address: wallet.address,
          purpose,
          message,
          display,
          nodeUrl,
        });
      } catch (err) {
        clearTimeout(timer);
        pendingSignatures.delete(requestId);
        reject(err);
      }
    });
  }

  function settleSignature({ requestId, signature, error } = {}) {
    const pending = pendingSignatures.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingSignatures.delete(requestId);
    if (typeof signature === 'string' && /^0x[0-9a-fA-F]{130}$/.test(signature)) {
      pending.resolve(signature);
    } else {
      pending.reject(new Error(error?.message || error || 'The signature request was rejected'));
    }
    return true;
  }

  // ── Disclosure ───────────────────────────────────────────────────────
  // `prepare` and `build` serve the chrome's consent screen; `manual` is a
  // pasted request from freedom://identity, parked here while the chrome
  // shows the same screen and answers on the manual-response channel.
  const pendingDisclosures = new Map();

  async function prepareDisclosure({ request, address }) {
    const parsed = disclosure.parseDisclosureRequest(request);
    const claims = await service.listClaims();
    return { request: parsed, entries: disclosure.matchClaims(parsed, claims, address) };
  }

  async function buildDisclosure({ request, selections, address }) {
    const parsed = disclosure.parseDisclosureRequest(request);
    const claims = await service.listClaims();
    return disclosure.buildResponse({
      request: parsed,
      selections,
      claims,
      subjectAddress: address,
      applyDisclosure: (tree, policy) => wasm.applyDisclosure(tree, policy),
    });
  }

  async function manualDisclosure(requestText) {
    const parsed = disclosure.parseDisclosureRequest(requestText);
    const wallet = await getActiveWallet();
    if (!wallet?.address) throw new Error('Set up a wallet before answering a disclosure request');
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingDisclosures.delete(requestId);
        reject(new Error('The disclosure request timed out'));
      }, signTimeoutMs === SIGN_REQUEST_TIMEOUT_MS ? DISCLOSURE_REQUEST_TIMEOUT_MS : signTimeoutMs);
      pendingDisclosures.set(requestId, { resolve, reject, timer });
      try {
        sendToChrome(IPC.AQUA_DISCLOSURE_REQUEST, {
          requestId,
          address: wallet.address,
          walletIndex: wallet.index,
          requester: { origin: null, label: 'Pasted request' },
          request: { aqua: parsed.version, need: parsed.entries.filter((e) => e.required).map(entryToWire), optional: parsed.entries.filter((e) => !e.required).map(entryToWire), purpose: parsed.purpose, nonce: parsed.nonce },
        });
      } catch (err) {
        clearTimeout(timer);
        pendingDisclosures.delete(requestId);
        reject(err);
      }
    });
  }

  function settleDisclosure({ requestId, response, error } = {}) {
    const pending = pendingDisclosures.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingDisclosures.delete(requestId);
    if (response && typeof response === 'object') pending.resolve(response);
    else pending.reject(new Error(error?.message || error || 'The disclosure request was rejected'));
    return true;
  }

  // ── Unlock ───────────────────────────────────────────────────────────
  // The page cannot unlock the vault itself; the sidebar's unlock screen
  // can. Park the page's request until the chrome answers.
  const pendingUnlocks = new Map();

  function requestUnlock() {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingUnlocks.delete(requestId);
        reject(new Error('The unlock request timed out'));
      }, signTimeoutMs);
      pendingUnlocks.set(requestId, { resolve, reject, timer });
      try {
        sendToChrome(IPC.AQUA_UNLOCK_REQUEST, { requestId });
      } catch (err) {
        clearTimeout(timer);
        pendingUnlocks.delete(requestId);
        reject(err);
      }
    });
  }

  function settleUnlock({ requestId, unlocked, error } = {}) {
    const pending = pendingUnlocks.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingUnlocks.delete(requestId);
    if (unlocked === true) pending.resolve(true);
    else pending.reject(new Error(error?.message || error || 'The wallet was not unlocked'));
    return true;
  }

  const client = createAquaClient({
    baseUrl: nodeUrl,
    signMessage: (address, message) => requestSignature({ address, purpose: 'login', message, display: message }),
  });
  const store = createClaimsStore({ dataDir, getSeed, isOwnDid });
  const service = createClaimsService({
    store,
    client,
    getActiveWallet,
    signer: { sign: requestSignature },
    log,
  });

  return {
    nodeUrl,
    client,
    store,
    service,
    getActiveWallet,
    settleSignature,
    pendingSignatures,
    prepareDisclosure,
    buildDisclosure,
    manualDisclosure,
    settleDisclosure,
    pendingDisclosures,
    requestUnlock,
    settleUnlock,
    pendingUnlocks,
  };
}

/** A normalized request entry back in the wire shape the screen shows. */
function entryToWire(entry) {
  return entry.fields ? { type: entry.type, fields: entry.fields } : entry.type;
}

function describeError(err) {
  if (err instanceof ClaimsStoreLocked || err?.code === 'VAULT_LOCKED') {
    return failure('VAULT_LOCKED', err.message);
  }
  if (err instanceof ClaimInputError) return failure('INVALID_INPUT', err.message, { field: err.field });
  if (err instanceof disclosure.DisclosureRequestError) return failure('INVALID_REQUEST', err.message);
  if (err instanceof AquaServiceError) {
    return failure('SERVICE', err.message, { status: err.status, path: err.path });
  }
  return failure('ERROR', err?.message || String(err));
}

/**
 * Does an Aqua identity service answer at `url`? The same probe the status
 * strip uses, against a throwaway client, so Settings can refuse an address
 * before it is saved. `compatible` means /node/identity answered with a DID.
 */
// The probe never signs; the client only insists on having a signer.
const neverSign = async () => {
  throw new Error('The service probe does not sign');
};

async function probeService(url, createClient = (baseUrl) => createAquaClient({ baseUrl, signMessage: neverSign })) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new ClaimInputError('Enter the service address as a full http or https URL', 'url');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ClaimInputError('The service address must start with http:// or https://', 'url');
  }
  const baseUrl = parsed.toString().replace(/\/+$/, '');
  const caps = await createClient(baseUrl).capabilities();
  return { url: baseUrl, ...caps, compatible: caps.reachable === true && Boolean(caps.serviceDid) };
}

function registerAquaIpc({ createDeps = createAquaDeps, createProbeClient, log = console } = {}) {
  let deps = null;

  function current() {
    const nodeUrl = configuredNodeUrl();
    if (!deps || deps.nodeUrl !== nodeUrl) deps = createDeps({ nodeUrl, log });
    return deps;
  }

  const enabled = () => loadSettings()?.enableIdentityWallet !== false;

  function handle(channel, fn, { mutates = false } = {}) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!enabled()) return failure('DISABLED', 'Enable Identity & Wallet under Settings → Identity first');
      try {
        const result = await fn(current(), ...args);
        if (mutates) broadcastToAllWebContents(IPC.AQUA_CLAIMS_CHANGED, {});
        return success(result);
      } catch (err) {
        log.error(`[AquaIPC] ${channel} failed:`, err?.message || err);
        return describeError(err);
      }
    });
  }

  handle(IPC.AQUA_STATUS, async (d) => ({
    ...(await d.service.status()),
    vaultUnlocked: await identityManager.isVaultUnlocked(),
    hasVault: await identityManager.hasVault(),
  }));
  handle(IPC.AQUA_SERVICE_PROBE, (d, url) => probeService(url, createProbeClient));
  handle(IPC.AQUA_SERVICE_SIGN_IN, (d) => d.service.signIn());
  handle(IPC.AQUA_CLAIMS_LIST, async (d) => ({ claims: await d.service.listClaims() }));
  handle(IPC.AQUA_CLAIMS_CREATE, async (d, request) => ({ claim: await d.service.createClaim(request || {}) }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_REMOVE, async (d, id) => ({ removed: await d.service.removeClaim(id) }), { mutates: true });
  // The user picks where the file goes; nothing is written on cancel. The
  // JSON is built before the dialog so a locked store refuses first.
  handle(IPC.AQUA_CLAIMS_EXPORT_ALL, async (d) => {
    const json = await d.service.exportAll();
    const count = JSON.parse(json).claims.length;
    const result = await dialog.showSaveDialog(targetWindow() || undefined, {
      defaultPath: `freedom-identity-claims-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true, count };
    fs.writeFileSync(result.filePath, json, { mode: 0o600 });
    return { saved: true, path: result.filePath, count };
  });
  handle(IPC.AQUA_CLAIMS_REMOVE_ALL, async (d) => ({ removed: await d.service.removeAllClaims() }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_REFRESH, async (d, id) => ({ claim: await d.service.refreshClaim(id) }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_SEND_CODE, (d, request) => d.service.sendCode(request || {}));
  handle(IPC.AQUA_CLAIMS_VERIFY_CODE, (d, request) => d.service.verifyCode(request || {}));
  handle(IPC.AQUA_CLAIMS_DNS_INSTRUCTIONS, (d, id) => d.service.dnsInstructions(id));
  handle(IPC.AQUA_CLAIMS_VERIFY_DNS, async (d, id) => ({ claim: await d.service.verifyDns(id) }), { mutates: true });
  // Attestation, owner side: share a claim, pull what the service recorded,
  // import the tree an attester handed over.
  handle(IPC.AQUA_CLAIMS_SHARE, async (d, id, recipient) => ({ claim: await d.service.shareForAttestation(id, recipient) }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_PULL_ATTESTATIONS, async (d, id) => ({ claim: await d.service.pullAttestations(id) }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_IMPORT_ATTESTATION, async (d, id, tree) => ({ claim: await d.service.importAttestation(id, tree) }), { mutates: true });
  // Attestation, attester side: what was shared with this wallet, attest it,
  // and hand the result back.
  handle(IPC.AQUA_SHARED_LIST, async (d) => ({ shared: await d.service.listSharedClaims() }));
  handle(IPC.AQUA_SHARED_ATTEST, async (d, request) => ({ issued: await d.service.attestSharedClaim(request || {}) }), { mutates: true });
  handle(IPC.AQUA_ISSUED_LIST, async (d) => ({ issued: await d.service.listIssued() }));
  handle(IPC.AQUA_ISSUED_EXPORT, async (d, id) => ({ json: await d.service.exportIssued(id) }));

  // Disclosure. prepare and build are chrome-only (not tiered for webviews);
  // manual is the page's pasted request, answered by the chrome below.
  handle(IPC.AQUA_DISCLOSURE_PREPARE, (d, args) => d.prepareDisclosure(args || {}));
  handle(IPC.AQUA_DISCLOSURE_BUILD, async (d, args) => ({ response: await d.buildDisclosure(args || {}) }));
  handle(IPC.AQUA_DISCLOSURE_MANUAL, async (d, requestText) => ({ response: await d.manualDisclosure(requestText) }));
  // The page's Unlock button: opens the sidebar's unlock screen and, once
  // the vault is open, tells every page to re-read (the store is readable now).
  handle(IPC.AQUA_UNLOCK, async (d) => ({ unlocked: await d.requestUnlock() }), { mutates: true });

  // The chrome's answer to a signing request. Only the chrome can reach
  // this channel (ipc-sender-policy: webviews are tiered, the chrome is not).
  ipcMain.on(IPC.AQUA_SIGN_RESPONSE, (_event, payload) => {
    if (!deps) return;
    deps.settleSignature(payload);
  });
  ipcMain.on(IPC.AQUA_DISCLOSURE_MANUAL_RESPONSE, (_event, payload) => {
    if (!deps) return;
    deps.settleDisclosure(payload);
  });
  ipcMain.on(IPC.AQUA_UNLOCK_RESPONSE, (_event, payload) => {
    if (!deps) return;
    deps.settleUnlock(payload);
  });

  return { current };
}

module.exports = { registerAquaIpc, probeService, createAquaDeps, configuredNodeUrl, addressOfDid, SIGN_REQUEST_TIMEOUT_MS, DISCLOSURE_REQUEST_TIMEOUT_MS };
