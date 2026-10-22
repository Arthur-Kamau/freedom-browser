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
const { ipcMain, BrowserWindow } = require('electron');
const IPC = require('../../shared/ipc-channels');
const { success, failure } = require('../ipc-contract');
const identityManager = require('../identity-manager');
const { loadSettings } = require('../settings-store');
const { broadcastToAllWebContents } = require('../lib/broadcast-to-all-webcontents');
const { createAquaClient, DEFAULT_NODE_URL, AquaServiceError } = require('./aqua-client');
const { createClaimsStore, ClaimsStoreLocked } = require('./claims-store');
const { createClaimsService, ClaimInputError } = require('./claims-service');

// A signature request waits for the user; a hardware wallet prompt can
// take a while. Past this the request fails and the screen is withdrawn.
const SIGN_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

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

  return { nodeUrl, client, store, service, getActiveWallet, settleSignature, pendingSignatures };
}

function describeError(err) {
  if (err instanceof ClaimsStoreLocked || err?.code === 'VAULT_LOCKED') {
    return failure('VAULT_LOCKED', err.message);
  }
  if (err instanceof ClaimInputError) return failure('INVALID_INPUT', err.message, { field: err.field });
  if (err instanceof AquaServiceError) {
    return failure('SERVICE', err.message, { status: err.status, path: err.path });
  }
  return failure('ERROR', err?.message || String(err));
}

function registerAquaIpc({ createDeps = createAquaDeps, log = console } = {}) {
  let deps = null;

  function current() {
    const nodeUrl = configuredNodeUrl();
    if (!deps || deps.nodeUrl !== nodeUrl) deps = createDeps({ nodeUrl, log });
    return deps;
  }

  const enabled = () => loadSettings()?.enableIdentityWallet !== false;

  function handle(channel, fn, { mutates = false } = {}) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!enabled()) return failure('DISABLED', 'Enable Identity & Wallet under Settings → Advanced first');
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
  handle(IPC.AQUA_CLAIMS_LIST, async (d) => ({ claims: await d.service.listClaims() }));
  handle(IPC.AQUA_CLAIMS_CREATE, async (d, request) => ({ claim: await d.service.createClaim(request || {}) }), { mutates: true });
  handle(IPC.AQUA_CLAIMS_REMOVE, async (d, id) => ({ removed: await d.service.removeClaim(id) }), { mutates: true });
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

  // The chrome's answer to a signing request. Only the chrome can reach
  // this channel (ipc-sender-policy: webviews are tiered, the chrome is not).
  ipcMain.on(IPC.AQUA_SIGN_RESPONSE, (_event, payload) => {
    if (!deps) return;
    deps.settleSignature(payload);
  });

  return { current };
}

module.exports = { registerAquaIpc, createAquaDeps, configuredNodeUrl, addressOfDid, SIGN_REQUEST_TIMEOUT_MS };
