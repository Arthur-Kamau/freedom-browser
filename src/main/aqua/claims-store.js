/**
 * Encrypted per-profile store for Aqua identity claims.
 *
 * Claims are the user's own signed statements (name, email, phone, domain),
 * so the file is sealed with a key derived from the vault's seed and is
 * readable only while the vault is unlocked. The key is derived on every
 * operation from the seed the caller supplies and never cached here, so a
 * lock takes effect on the next access without the store having to hear
 * about it. The vault itself encrypts only the mnemonic, which is why this
 * store does not reuse its file.
 *
 * File: `<identity data dir>/aqua-claims.json.enc`, a JSON envelope around an
 * AES-256-GCM sealed payload. Writes go through a temp file and rename so
 * a crash mid-write leaves the previous store intact.
 *
 * Ownership rule (carried from Aquafier's AS-REQ-0013, "a claim is about
 * its subject"): a claim record is accepted only when its `signer_did`
 * names one of this profile's own wallets, as judged by the `isOwnDid`
 * predicate the caller injects. Holding a copy of someone else's claim is
 * never enough to store it as one's own.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORE_FILE = 'aqua-claims.json.enc';
const ENVELOPE_VERSION = 1;
const STORE_VERSION = 1;
const HKDF_SALT = 'freedom-browser/aqua-claims/v1';
const HKDF_INFO = 'aes-256-gcm';
const CLAIM_TYPES = Object.freeze(['name', 'email', 'phone', 'domain']);

class ClaimsStoreLocked extends Error {
  constructor() {
    super('Unlock your vault to access identity claims');
    this.name = 'ClaimsStoreLocked';
    this.code = 'VAULT_LOCKED';
  }
}

function deriveKey(seed) {
  return Buffer.from(crypto.hkdfSync('sha256', seed, HKDF_SALT, HKDF_INFO, 32));
}

function seal(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version: ENVELOPE_VERSION,
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function open(key, envelope) {
  if (!envelope || envelope.version !== ENVELOPE_VERSION || envelope.cipher !== 'aes-256-gcm') {
    throw new Error('Unrecognized claims store format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

const TRUST_STATES = Object.freeze(['trusted', 'rejected']);

function emptyState() {
  return { version: STORE_VERSION, claims: [], issued: [], trust: [] };
}

/**
 * The form two DIDs are compared in. A `did:pkh` Ethereum address is hex, so
 * its case carries nothing (EIP-55 is display only); every other method is
 * compared exactly, because a `did:key` body is base58 and two case variants
 * are two keys.
 */
function didKey(did) {
  const trimmed = typeof did === 'string' ? did.trim() : '';
  return trimmed.startsWith('did:pkh:') ? trimmed.toLowerCase() : trimmed;
}

function canonicalDid(did) {
  return typeof did === 'string' ? did.trim().toLowerCase() : '';
}

/**
 * @param {object} options
 * @param {string} options.dataDir - the profile's identity data directory
 * @param {() => Promise<Buffer|null>} options.getSeed - the vault seed, or
 *   null while locked
 * @param {(did: string) => Promise<boolean>} options.isOwnDid - whether a
 *   `did:pkh:eip155` DID belongs to one of this profile's wallets
 */
function createClaimsStore({ dataDir, getSeed, isOwnDid }) {
  if (!dataDir) throw new Error('dataDir is required');
  if (typeof getSeed !== 'function') throw new Error('getSeed is required');
  if (typeof isOwnDid !== 'function') throw new Error('isOwnDid is required');
  const filePath = path.join(dataDir, STORE_FILE);

  async function keyOrThrow() {
    const seed = await getSeed();
    if (!seed) throw new ClaimsStoreLocked();
    return deriveKey(seed);
  }

  async function load() {
    const key = await keyOrThrow();
    if (!fs.existsSync(filePath)) return emptyState();
    const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const state = JSON.parse(open(key, envelope));
    if (!state || !Array.isArray(state.claims)) throw new Error('Corrupt claims store');
    if (!Array.isArray(state.issued)) state.issued = [];
    if (!Array.isArray(state.trust)) state.trust = [];
    return state;
  }

  async function save(state) {
    const key = await keyOrThrow();
    fs.mkdirSync(dataDir, { recursive: true });
    const envelope = seal(key, JSON.stringify(state));
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(envelope), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  function validateRecord(record) {
    if (!record || typeof record !== 'object') throw new Error('Claim record must be an object');
    if (typeof record.id !== 'string' || !record.id) throw new Error('Claim record needs an id');
    if (!CLAIM_TYPES.includes(record.type)) throw new Error(`Unknown claim type: ${record.type}`);
    if (typeof record.signerDid !== 'string' || !record.signerDid.startsWith('did:pkh:eip155:')) {
      throw new Error('Claim record needs a did:pkh:eip155 signer');
    }
    if (!record.tree || typeof record.tree !== 'object' || typeof record.tree.revisions !== 'object') {
      throw new Error('Claim record needs its Aqua tree');
    }
    if (!Array.isArray(record.attestations)) throw new Error('Claim record needs an attestations array');
  }

  return {
    filePath,
    exists: () => fs.existsSync(filePath),

    async list() {
      return (await load()).claims;
    },

    async get(id) {
      return (await load()).claims.find((claim) => claim.id === id) || null;
    },

    /** Insert or replace a claim record, refusing one that is not the user's own. */
    async upsert(record) {
      validateRecord(record);
      if (!(await isOwnDid(record.signerDid))) {
        throw new Error('A claim can only be stored for a wallet in this profile');
      }
      const state = await load();
      const index = state.claims.findIndex((claim) => claim.id === record.id);
      if (index >= 0) state.claims[index] = record;
      else state.claims.push(record);
      await save(state);
      return record;
    },

    async remove(id) {
      const state = await load();
      const before = state.claims.length;
      state.claims = state.claims.filter((claim) => claim.id !== id);
      if (state.claims.length === before) return false;
      await save(state);
      return true;
    },

    /** Drop every claim of the user's own; issued attestations stay. Returns how many went. */
    async removeAll() {
      const state = await load();
      const count = state.claims.length;
      if (count === 0) return 0;
      state.claims = [];
      await save(state);
      return count;
    },

    // ── Attestations this profile issued for other people's claims ─────
    // Kept apart from `claims`: an attestation is about someone else's
    // subject, so it must never be listed as one of the user's own claims
    // (AS-REQ-0013). The attester holds the only copy the service lets it
    // download, which is what it hands back to the claim's owner.
    async listIssued() {
      return (await load()).issued;
    },

    async addIssued(record) {
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) {
        throw new Error('Issued attestation needs an id');
      }
      if (!record.tree || typeof record.tree !== 'object' || typeof record.tree.revisions !== 'object') {
        throw new Error('Issued attestation needs its Aqua tree');
      }
      const state = await load();
      const index = state.issued.findIndex((entry) => entry.id === record.id);
      if (index >= 0) state.issued[index] = record;
      else state.issued.push(record);
      await save(state);
      return record;
    },

    // ── The trust list (the key ring) ───────────────────────────────────
    // Whose signature on a claim counts for this user: a yes or a no per
    // DID. It is the user's own judgement, so it lives with the vault and
    // is never sent anywhere. A DID that is not listed is neither.
    async listTrust() {
      return (await load()).trust;
    },

    /** Trust or reject a DID. `kind` (`service` or `person`) is kept from the first entry. */
    async setTrust(did, trustState, { kind = 'person', at = new Date().toISOString() } = {}) {
      const key = didKey(did);
      if (!key.startsWith('did:')) throw new Error('A trust entry needs a DID');
      if (!TRUST_STATES.includes(trustState)) throw new Error(`Unknown trust state: ${trustState}`);
      const state = await load();
      const known = state.trust.find((entry) => didKey(entry.did) === key);
      const entry = known || { did: did.trim(), kind: kind === 'service' ? 'service' : 'person' };
      entry.state = trustState;
      entry.updatedAt = at;
      if (!known) state.trust.push(entry);
      await save(state);
      return entry;
    },

    /**
     * Put DIDs on the list as trusted unless the list already says something
     * about them, so a rejection by the user is never overwritten. Returns
     * how many were added; nothing is written when none were.
     */
    async addTrusted(dids, { kind = 'person', at = new Date().toISOString() } = {}) {
      const wanted = [...new Set((dids || []).map(didKey).filter((key) => key.startsWith('did:')))];
      if (wanted.length === 0) return 0;
      const state = await load();
      const listed = new Set(state.trust.map((entry) => didKey(entry.did)));
      const fresh = wanted.filter((key) => !listed.has(key));
      if (fresh.length === 0) return 0;
      // Stored as first given, so an EIP-55 address keeps its display form.
      const original = new Map();
      for (const did of dids || []) {
        if (!original.has(didKey(did))) original.set(didKey(did), String(did).trim());
      }
      for (const key of fresh) {
        state.trust.push({
          did: original.get(key),
          kind: kind === 'service' ? 'service' : 'person',
          state: 'trusted',
          updatedAt: at,
        });
      }
      await save(state);
      return fresh.length;
    },

    async removeIssued(id) {
      const state = await load();
      const before = state.issued.length;
      state.issued = state.issued.filter((entry) => entry.id !== id);
      if (state.issued.length === before) return false;
      await save(state);
      return true;
    },
  };
}

module.exports = {
  createClaimsStore,
  ClaimsStoreLocked,
  STORE_FILE,
  CLAIM_TYPES,
  TRUST_STATES,
  canonicalDid,
  didKey,
};
