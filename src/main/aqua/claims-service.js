/**
 * Identity claims: the flow between the Aqua service, the wallet and the
 * local encrypted store.
 *
 * A claim starts life on the service, which builds the tree from the SDK's
 * claim template with the active wallet as `signer_did`. The service then
 * prepares the EIP-191 pre-image for the claim's signature revision; the
 * wallet signs it on the sidebar's approval screen (the only path that can
 * sign anything, main-side confirmation token included); the service
 * finalizes the signature. Freedom downloads the resulting artifact, has
 * the tree verified, and keeps the copy in the encrypted store. The service
 * keeps its copy too.
 *
 * Email and phone claims are gated by a one-time code the service sends
 * out of band; once such a claim is signed the service issues its own
 * attestation tree, which is downloaded and stored beside the claim. A name
 * claim has no out-of-band step and stays self-signed until someone attests
 * it. Nothing here ever labels a self-signed claim as verified.
 */
const crypto = require('crypto');
const { readAquaChains } = require('./zip-reader');
const { CLAIM_TYPES } = require('./claims-store');

// Matches the SDK's phone_claim template pattern (E.164).
const E164 = /^\+[1-9]\d{1,14}$/;
// Matches the SDK's email_claim template pattern.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// A registrable hostname: labels of letters, digits and hyphens, a dotted TLD.
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const NAME_MAX = 256;

class ClaimInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ClaimInputError';
    this.code = 'INVALID_INPUT';
    this.field = field;
  }
}

function text(value, field, { required = false, max = NAME_MAX } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ClaimInputError(`${field} is required`, field);
    return undefined;
  }
  if (typeof value !== 'string') throw new ClaimInputError(`${field} must be text`, field);
  const trimmed = value.trim();
  if (!trimmed && required) throw new ClaimInputError(`${field} is required`, field);
  if (trimmed.length > max) throw new ClaimInputError(`${field} is too long`, field);
  return trimmed || undefined;
}

/**
 * Check a claim's fields the way the SDK template will, so a mistake is
 * reported before anything is sent. Returns the body for the service.
 */
function validateClaimInput(type, fields = {}) {
  switch (type) {
    case 'name': {
      return {
        given_name: text(fields.given_name, 'given_name', { required: true }),
        family_name: text(fields.family_name, 'family_name', { required: true }),
        middle_name: text(fields.middle_name, 'middle_name'),
        nickname: text(fields.nickname, 'nickname'),
      };
    }
    case 'email': {
      const email = text(fields.email, 'email', { required: true });
      if (!EMAIL.test(email)) throw new ClaimInputError('Enter a valid email address', 'email');
      return {
        email,
        verification_token: text(fields.verification_token, 'verification_token', { required: true, max: 1024 }),
        display_name: text(fields.display_name, 'display_name'),
      };
    }
    case 'phone': {
      const phone = text(fields.phone_number, 'phone_number', { required: true, max: 20 });
      if (!E164.test(phone)) {
        throw new ClaimInputError('Phone number must be in international E.164 form, like +254712345678', 'phone_number');
      }
      return {
        phone_number: phone,
        verification_token: text(fields.verification_token, 'verification_token', { required: true, max: 1024 }),
        display_name: text(fields.display_name, 'display_name'),
      };
    }
    case 'domain': {
      const domain = text(fields.domain, 'domain', { required: true, max: 253 })?.toLowerCase();
      if (!DOMAIN.test(domain)) throw new ClaimInputError('Enter a domain name, like example.com', 'domain');
      return { domain };
    }
    default:
      throw new ClaimInputError(`Unknown claim type: ${type}`, 'type');
  }
}

function stripUndefined(body) {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

/** The chain in an artifact that holds `tip` as a revision. */
function chainWithTip(chains, tip) {
  const found = chains.find((chain) => Object.prototype.hasOwnProperty.call(chain.tree.revisions, tip));
  if (!found) throw new Error(`Downloaded artifact does not contain revision ${tip}`);
  return found.tree;
}

function genesisOf(tree) {
  const entry = Object.entries(tree.revisions).find(([, rev]) => !rev.previous_revision);
  return entry ? entry[0] : null;
}

/** The typed object revision's payload (the claim or attestation fields). */
function payloadOf(tree) {
  const typed = Object.values(tree.revisions).find((rev) => rev.payloads && typeof rev.payloads === 'object');
  return typed ? typed.payloads : null;
}

function signerDidOf(tree) {
  const sig = Object.values(tree.revisions).find((rev) => rev.signature && rev.signer);
  return sig ? sig.signer : null;
}

function summarizeVerification(result, backend, checkedAt) {
  return {
    isValid: result?.is_valid === true,
    status: typeof result?.status === 'string' ? result.status : result?.is_valid ? 'OK' : 'unknown',
    backend,
    checkedAt,
  };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./claims-store').createClaimsStore>} deps.store
 * @param {ReturnType<import('./aqua-client').createAquaClient>} deps.client
 * @param {() => Promise<{ index: number, address: string, type: string }|null>} deps.getActiveWallet
 * @param {{ sign: (req: { address: string, purpose: string, message: string, display: string }) => Promise<string> }} deps.signer
 * @param {() => Date} [deps.now]
 * @param {{ error: Function, info?: Function }} [deps.log]
 */
function createClaimsService({ store, client, getActiveWallet, signer, now = () => new Date(), log = console }) {
  async function activeWalletOrThrow() {
    const wallet = await getActiveWallet();
    if (!wallet?.address) throw new Error('Set up a wallet before creating identity claims');
    if (wallet.type === 'safe') {
      throw new Error('A multi-owner account signs as a smart contract and cannot sign an identity claim');
    }
    return wallet;
  }

  async function verify(tree) {
    const checkedAt = now().toISOString();
    try {
      return summarizeVerification(await client.verifyTree(tree), 'service', checkedAt);
    } catch (err) {
      log.error('[AquaClaims] verification failed:', err?.message || err);
      return { isValid: false, status: `Verification unavailable: ${err?.message || err}`, backend: 'service', checkedAt };
    }
  }

  async function fetchChain(address, tip) {
    const zip = await client.downloadTree(address, tip);
    return chainWithTip(readAquaChains(zip), tip);
  }

  async function attestationRecord(address, tip) {
    const tree = await fetchChain(address, tip);
    const payload = payloadOf(tree) || {};
    return {
      tip,
      tree,
      attesterDid: payload.signer_did || signerDidOf(tree) || null,
      context: typeof payload.context === 'string' ? payload.context : '',
      source: 'service',
      issuedAt: now().toISOString(),
      verification: await verify(tree),
    };
  }

  async function signClaim(wallet, tip) {
    const prepared = await client.prepareSign(wallet.address, tip);
    const signature = await signer.sign({
      address: wallet.address,
      purpose: 'claim',
      message: prepared.message_hex,
      display: prepared.message_utf8,
    });
    return client.completeSign(wallet.address, tip, { message_hex: prepared.message_hex, signature });
  }

  return {
    /** Everything the page needs to render, no secrets. */
    async status() {
      const wallet = await getActiveWallet().catch(() => null);
      return {
        nodeUrl: client.baseUrl,
        wallet: wallet
          ? { address: wallet.address, index: wallet.index, type: wallet.type, canSign: wallet.type !== 'safe' }
          : null,
      };
    },

    listClaims: () => store.list(),

    /** One-time code for an email or phone claim; the service sends it. */
    async sendCode({ channel, target }) {
      const wallet = await activeWalletOrThrow();
      if (channel !== 'email' && channel !== 'phone') throw new ClaimInputError('Unknown channel', 'channel');
      const body = channel === 'email' ? validateClaimInput('email', { email: target, verification_token: 'x' }) : validateClaimInput('phone', { phone_number: target, verification_token: 'x' });
      const normalized = channel === 'email' ? body.email : body.phone_number;
      const result = await client.sendCode(wallet.address, { target: normalized, channel });
      return { target: normalized, message: result?.message || 'Code sent' };
    },

    async verifyCode({ target, code }) {
      const wallet = await activeWalletOrThrow();
      const cleanCode = text(code, 'code', { required: true, max: 16 });
      const result = await client.verifyCode(wallet.address, { target: text(target, 'target', { required: true }), code: cleanCode });
      if (!result?.verification_token) throw new Error(result?.message || 'The code was not accepted');
      return { verificationToken: result.verification_token };
    },

    /**
     * Create, sign, download, verify and store a claim. Returns the record.
     * `type` is one of name | email | phone | domain.
     */
    async createClaim({ type, fields }) {
      if (!CLAIM_TYPES.includes(type)) throw new ClaimInputError(`Unknown claim type: ${type}`, 'type');
      const body = stripUndefined(validateClaimInput(type, fields));
      const wallet = await activeWalletOrThrow();

      const create = {
        name: client.createNameClaim,
        email: client.createEmailClaim,
        phone: client.createPhoneClaim,
        domain: client.createDnsClaim,
      }[type];
      const created = await create(wallet.address, body);
      if (!created?.tip) throw new Error('The service created no claim');
      const createdAt = now().toISOString();

      const completed = await signClaim(wallet, created.tip);
      const tip = completed?.new_tip || created.tip;
      const tree = await fetchChain(wallet.address, tip);
      const payload = payloadOf(tree) || {};
      const signerDid = payload.signer_did || signerDidOf(tree);
      if (!signerDid) throw new Error('Downloaded claim names no signer');

      const attestations = [];
      if (completed?.attestation_tip) {
        try {
          attestations.push(await attestationRecord(wallet.address, completed.attestation_tip));
        } catch (err) {
          log.error('[AquaClaims] attestation download failed:', err?.message || err);
        }
      }

      const record = {
        id: crypto.randomUUID(),
        type,
        signerDid,
        address: wallet.address,
        nodeUrl: client.baseUrl,
        tip,
        genesis: genesisOf(tree),
        payload,
        createdAt,
        signedAt: now().toISOString(),
        tree,
        verification: await verify(tree),
        attestations,
        serverTips: { claim: tip, attestation: completed?.attestation_tip || null },
        ...(type === 'domain' ? { domainVerification: created.verification_status || 'pending' } : {}),
      };
      await store.upsert(record);
      return record;
    },

    /** Re-run verification on the stored tree and its attestations. */
    async refreshClaim(id) {
      const record = await store.get(id);
      if (!record) throw new Error('Claim not found');
      record.verification = await verify(record.tree);
      for (const attestation of record.attestations) {
        attestation.verification = await verify(attestation.tree);
      }
      await store.upsert(record);
      return record;
    },

    removeClaim: (id) => store.remove(id),

    async dnsInstructions(id) {
      const record = await store.get(id);
      if (!record || record.type !== 'domain') throw new Error('Not a domain claim');
      return client.dnsInstructions(record.address, record.tip);
    },

    async verifyDns(id) {
      const record = await store.get(id);
      if (!record || record.type !== 'domain') throw new Error('Not a domain claim');
      const result = await client.verifyDns(record.address, record.tip);
      record.domainVerification = result?.verification_status || (result?.verified ? 'verified' : 'pending');
      if (result?.attestation_tip && !record.attestations.some((a) => a.tip === result.attestation_tip)) {
        record.attestations.push(await attestationRecord(record.address, result.attestation_tip));
        record.serverTips.attestation = result.attestation_tip;
      }
      await store.upsert(record);
      return record;
    },
  };
}

module.exports = {
  createClaimsService,
  validateClaimInput,
  ClaimInputError,
  chainWithTip,
  payloadOf,
  signerDidOf,
  genesisOf,
  E164,
  EMAIL,
  DOMAIN,
};
