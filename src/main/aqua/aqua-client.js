/**
 * HTTP client for the Aqua identity service.
 *
 * One small interface in front of the service that builds and stores claim
 * trees (today an aquafier-rs instance, which also serves the shared
 * `/node/*` API), so the backend can be swapped without touching the UI.
 * Everything here is plain HTTP: the client never holds a key. Where a
 * signature is needed (the sign-in message, a claim's EIP-191 pre-image) it
 * asks the injected `signMessage` callback, which the claims service routes
 * through the wallet's own confirmation screen.
 *
 * Sessions: `GET /auth/nonce`, the wallet signs a SIWE (EIP-4361) message,
 * `POST /auth/siwe/verify` returns a session whose `nonce` rides every later
 * request as the `nonce` header. One session per wallet address, kept until
 * the service refuses it.
 */

const DEFAULT_NODE_URL = 'https://dev.aquafire.inblock.io';
const DEFAULT_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const SIWE_STATEMENT = 'Freedom Browser identity claims';
const CLAIM_TYPES = Object.freeze(['name', 'email', 'phone', 'dns']);

class AquaServiceError extends Error {
  constructor(message, { status, path, body } = {}) {
    super(message);
    this.name = 'AquaServiceError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function normalizeBaseUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid Aqua node URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Aqua node URL must be http(s): ${url}`);
  }
  return trimmed;
}

function hexOf(text) {
  return '0x' + Buffer.from(text, 'utf8').toString('hex');
}

/**
 * The SIWE message the wallet signs to open a session. Plain text, so the
 * signing screen shows the user exactly what they are agreeing to.
 */
function buildSiweMessage({ baseUrl, address, nonce, issuedAt }) {
  const host = new URL(baseUrl).host;
  return [
    `${host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    SIWE_STATEMENT,
    '',
    `URI: ${baseUrl}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

function errorMessageFrom(body, status) {
  if (body && typeof body === 'object') {
    const text = body.error || body.message || body.detail;
    if (typeof text === 'string' && text) return text;
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 200);
  return `Aqua service answered ${status}`;
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {(address: string, message: string) => Promise<string>} options.signMessage
 *   Signs `message` (UTF-8 text, or a `0x` hex string meaning raw bytes)
 *   with the wallet holding `address`; returns the 65-byte signature hex.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => Date} [options.now]
 */
function createAquaClient({ baseUrl = DEFAULT_NODE_URL, signMessage, fetchImpl, now } = {}) {
  if (typeof signMessage !== 'function') throw new Error('signMessage is required');
  const base = normalizeBaseUrl(baseUrl);
  const doFetch = fetchImpl || globalThis.fetch;
  const clock = now || (() => new Date());
  // address (lower-case) → { nonce, did, expiresAt }
  const sessions = new Map();

  async function request(method, path, { body, session, raw = false, timeoutMs } = {}) {
    const headers = { accept: raw ? '*/*' : 'application/json' };
    if (session) headers.nonce = session;
    let payload;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await doFetch(base + path, { method, headers, body: payload, signal: controller.signal });
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'timed out' : err?.message || 'network error';
      throw new AquaServiceError(`Aqua service request ${reason}`, { path });
    } finally {
      clearTimeout(timer);
    }
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (raw && response.ok) {
      data = Buffer.from(await response.arrayBuffer());
    } else if (contentType.includes('json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      throw new AquaServiceError(errorMessageFrom(data, response.status), {
        status: response.status,
        path,
        body: data,
      });
    }
    return data;
  }

  async function login(address) {
    const { nonce } = await request('GET', '/auth/nonce');
    const message = buildSiweMessage({ baseUrl: base, address, nonce, issuedAt: clock().toISOString() });
    const signature = await signMessage(address, message);
    const session = await request('POST', '/auth/siwe/verify', { body: { message, signature } });
    if (!session?.nonce) throw new AquaServiceError('Aqua service returned no session', { path: '/auth/siwe/verify' });
    const record = { nonce: session.nonce, did: session.did, expiresAt: session.expires_at };
    sessions.set(address.toLowerCase(), record);
    return record;
  }

  /**
   * Run `fn(sessionNonce)` as `address`, signing in first when there is no
   * session, and once more after a fresh sign-in when the service refuses
   * the one we hold.
   */
  async function withSession(address, fn) {
    const key = address.toLowerCase();
    let session = sessions.get(key) || (await login(address));
    try {
      return await fn(session.nonce);
    } catch (err) {
      if (!(err instanceof AquaServiceError) || err.status !== 401) throw err;
      sessions.delete(key);
      session = await login(address);
      return fn(session.nonce);
    }
  }

  const authed = (method, path, opts = {}) => (address, body) =>
    withSession(address, (session) => request(method, path, { ...opts, body, session }));

  return {
    baseUrl: base,
    hasSession: (address) => sessions.has(String(address).toLowerCase()),
    forgetSession: (address) => sessions.delete(String(address).toLowerCase()),
    login,

    // ── Out-of-band verification (email, phone) ───────────────────────
    sendCode: (address, { target, channel }) =>
      withSession(address, (s) => request('POST', '/api/claims/send-code', { body: { target, channel }, session: s })),
    verifyCode: (address, { target, code }) =>
      withSession(address, (s) => request('POST', '/api/claims/verify-code', { body: { target, code }, session: s })),

    // ── Claim creation (unsigned; the service builds the tree) ─────────
    createNameClaim: authed('POST', '/api/claims/name/create'),
    createEmailClaim: authed('POST', '/api/claims/email/create'),
    createPhoneClaim: authed('POST', '/api/claims/phone/create'),
    createDnsClaim: authed('POST', '/api/claims/dns/create'),
    dnsInstructions: (address, tip) =>
      withSession(address, (s) => request('GET', `/api/claims/dns/instructions/${tip}`, { session: s })),
    verifyDns: (address, tip) =>
      withSession(address, (s) => request('POST', `/api/claims/dns/verify/${tip}`, { session: s })),

    // ── Self-signing: the service prepares the pre-image, the wallet signs ─
    prepareSign: (address, tip) =>
      withSession(address, (s) =>
        request('POST', `/api/claims/${tip}/sign/prepare`, { body: { wallet_address: address }, session: s })),
    completeSign: (address, tip, { message_hex, signature }) =>
      withSession(address, (s) =>
        request('POST', `/api/claims/${tip}/sign/complete`, {
          body: { message_hex, signature, wallet_address: address },
          session: s,
        })),

    // ── Attestation (peer, through a share contract) ──────────────────
    /**
     * Share a claim with another account so it can attest it (the service's
     * AS-REQ-0020: an account attests only what it can read). `hash` is the
     * contract id the recipient reads it under.
     */
    shareTree: (address, { hash, recipient, genesis, tip, fileName }) =>
      withSession(address, (s) =>
        request('POST', '/api/share/contracts', {
          body: { hash, recipients: [recipient], option: 'latest', items: [{ genesis_hash: genesis, latest: tip, file_name: fileName }] },
          session: s,
        })),
    /** Share contracts addressed to `address` (claims others want attested). */
    listSharesReceived: (address) =>
      withSession(address, (s) =>
        request('GET', `/api/share/contracts?receiver=${encodeURIComponent(address)}`, { session: s })),
    /** A shared contract's trees as the service presents them: payload, revisions, template name. */
    sharedData: (address, hash) =>
      withSession(address, (s) => request('GET', `/api/share/data/${encodeURIComponent(hash)}`, { session: s })),
    attestPrepare: (address, tip, { context }) =>
      withSession(address, (s) => request('POST', `/api/claims/${tip}/attest/prepare`, { body: { context }, session: s })),
    attestComplete: (address, tip, { message_hex, signature }) =>
      withSession(address, (s) =>
        request('POST', `/api/claims/${tip}/attest/complete`, {
          body: { message_hex, signature, wallet_address: address },
          session: s,
        })),
    /** Attestations recorded against one of the caller's own claims (owner only). */
    listAttestations: (address, tip) =>
      withSession(address, (s) => request('GET', `/api/claims/${tip}/attestations`, { session: s })),

    // ── Service identity and capabilities (no session) ────────────────
    /** The service's own signing identity, which issues email, phone and DNS attestations. */
    nodeIdentity: () => request('GET', '/node/identity'),
    /**
     * What this service can do beyond storing trees. A bare aqua-node serves
     * `/node/*` but not the aquafier `/api/claims/*` family, so email and
     * phone verification are reported absent rather than failing later.
     */
    async capabilities() {
      let identity;
      try {
        identity = await request('GET', '/node/identity');
      } catch {
        identity = null;
      }
      // The status route is unauthenticated on aquafier; a bare node answers
      // 404 and an unreachable service answers nothing. Either way: absent.
      let outOfBand;
      try {
        const status = await request('GET', '/api/claims/twilio-status');
        outOfBand = Boolean(status) && typeof status === 'object';
      } catch {
        outOfBand = false;
      }
      return { reachable: identity !== null, serviceDid: identity?.did || null, outOfBandVerification: outOfBand };
    },

    // ── Trees ──────────────────────────────────────────────────────────
    /** The artifact ZIP for a tree: its chain, linked chains and assets. */
    downloadTree: (address, tip) =>
      withSession(address, (s) =>
        request('GET', `/node/trees/${tip}/download`, { session: s, raw: true, timeoutMs: DOWNLOAD_TIMEOUT_MS })),
    treeInfo: (address, tip) => withSession(address, (s) => request('GET', `/node/trees/${tip}`, { session: s })),

    // ── Stateless verification (no session) ───────────────────────────
    /** @returns {Promise<{ is_valid: boolean, status: string, logs: object[] }>} */
    verifyTree: (tree, { linkedTrees = [] } = {}) =>
      request('POST', '/api/widget/verify', { body: { kind: 'tree', main: tree, linked_trees: linkedTrees } }),
    verifySelectiveTree: (selective) =>
      request('POST', '/api/widget/verify', { body: { kind: 'selective', main: selective } }),
  };
}

module.exports = {
  createAquaClient,
  buildSiweMessage,
  normalizeBaseUrl,
  hexOf,
  AquaServiceError,
  DEFAULT_NODE_URL,
  CLAIM_TYPES,
  SIWE_STATEMENT,
};
