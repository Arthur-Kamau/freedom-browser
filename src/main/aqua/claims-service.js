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
  constructor(message, field, options) {
    super(message, options);
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

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const REVISION_HASH = /0x1620[0-9a-f]{64}/g;

/**
 * The claim a peer attestation names. The service's wallet-signed attestation
 * anchors to the attestation template, not to the claim (its only link to
 * the claim is the service's own index), so Freedom writes the claim's tip
 * into the attestation's `context` when it issues one, and reads it back
 * here. A structural link, when a service does anchor to the claim's
 * signature hash, is honoured first.
 */
function claimTipsNamedBy(attestationTree) {
  const named = new Set();
  for (const rev of Object.values(attestationTree.revisions || {})) {
    for (const link of rev.structural_links || []) {
      if (link && typeof link.hash === 'string') named.add(link.hash.toLowerCase());
    }
    const context = rev.payloads && typeof rev.payloads.context === 'string' ? rev.payloads.context : '';
    for (const match of context.matchAll(REVISION_HASH)) named.add(match[0].toLowerCase());
  }
  return named;
}

function attestationContext(words, claimTip) {
  return `${words.trim()} (attests claim ${claimTip})`;
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

  // An attestation anchors to the claim it attests (the service's own
  // attestations link to the claim's signature revision), so it verifies
  // only with the claim tree supplied as a linked tree.
  async function attestationRecord(address, tip, claimTree) {
    const tree = await fetchChain(address, tip);
    const payload = payloadOf(tree) || {};
    return {
      tip,
      tree,
      attesterDid: payload.signer_did || signerDidOf(tree) || null,
      context: typeof payload.context === 'string' ? payload.context : '',
      source: 'service',
      issuedAt: now().toISOString(),
      verification: claimTree ? await verifyLinked(tree, claimTree) : await verify(tree),
    };
  }

  let capabilities = null;
  async function serviceCapabilities() {
    if (!capabilities) capabilities = await client.capabilities();
    return capabilities;
  }

  function sourceOf(attesterDid, serviceDid) {
    if (!attesterDid || !serviceDid) return 'peer';
    return attesterDid.toLowerCase() === serviceDid.toLowerCase() ? 'service' : 'peer';
  }

  async function verifyLinked(tree, claimTree) {
    const checkedAt = now().toISOString();
    try {
      return summarizeVerification(await client.verifyTree(tree, { linkedTrees: [claimTree] }), 'service', checkedAt);
    } catch (err) {
      log.error('[AquaClaims] verification failed:', err?.message || err);
      return { isValid: false, status: `Verification unavailable: ${err?.message || err}`, backend: 'service', checkedAt };
    }
  }

  /** Parse an attestation tree handed over as JSON text or an object. */
  function parseAttestationTree(input) {
    let tree = input;
    if (typeof input === 'string') {
      try {
        tree = JSON.parse(input);
      } catch (err) {
        throw new ClaimInputError('That is not an Aqua tree (invalid JSON)', 'tree', { cause: err });
      }
    }
    if (tree && tree.aqua_tree && typeof tree.aqua_tree === 'object') tree = tree.aqua_tree;
    if (!tree || typeof tree !== 'object' || !tree.revisions || typeof tree.revisions !== 'object') {
      throw new ClaimInputError('That is not an Aqua tree (no revisions)', 'tree');
    }
    const payload = payloadOf(tree);
    if (!payload || typeof payload.context !== 'string' || typeof payload.signer_did !== 'string') {
      throw new ClaimInputError('That tree is not an attestation (no context and signer)', 'tree');
    }
    const [tip] = Object.entries(tree.revisions).find(([, rev]) => rev.payloads === payload);
    return { tree, payload, tip, attesterDid: signerDidOf(tree) || payload.signer_did };
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
      const caps = await serviceCapabilities().catch(() => ({ reachable: false, serviceDid: null, outOfBandVerification: false }));
      return {
        nodeUrl: client.baseUrl,
        service: caps,
        wallet: wallet
          ? { address: wallet.address, index: wallet.index, type: wallet.type, canSign: wallet.type !== 'safe' }
          : null,
        // Whether this wallet holds a session with the service: the page
        // shows nothing that would need one until it does.
        signedIn: Boolean(wallet && client.hasSession(wallet.address)),
      };
    },

    /** Sign in to the service as the active wallet: one wallet signature, confirmed in the sidebar. */
    async signIn() {
      const wallet = await activeWalletOrThrow();
      const session = await client.login(wallet.address);
      return { signedIn: true, did: session.did || null };
    },

    listClaims: () => store.list(),

    /**
     * Every claim record as one JSON document: the trees, the attestations
     * and the verification results, as the store holds them.
     */
    async exportAll() {
      const claims = await store.list();
      return JSON.stringify({ format: 'freedom-identity-claims', version: 1, exportedAt: now().toISOString(), nodeUrl: client.baseUrl, claims }, null, 2);
    },

    removeAllClaims: () => store.removeAll(),

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
          attestations.push(await attestationRecord(wallet.address, completed.attestation_tip, tree));
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
        if (!attestation.tree) continue;
        attestation.verification = await verifyLinked(attestation.tree, record.tree);
      }
      await store.upsert(record);
      return record;
    },

    removeClaim: (id) => store.remove(id),

    // ── Attestation: the owner's side ────────────────────────────────

    /** Share a claim with another account so it can attest it. */
    async shareForAttestation(id, recipient) {
      const address = text(recipient, 'recipient', { required: true, max: 42 });
      if (!ADDRESS.test(address)) throw new ClaimInputError('Enter the attester\'s wallet address (0x…)', 'recipient');
      const record = await store.get(id);
      if (!record) throw new Error('Claim not found');
      if (address.toLowerCase() === record.address.toLowerCase()) {
        throw new ClaimInputError('A claim cannot be shared with its own wallet', 'recipient');
      }
      const hash = `freedom-attest-${crypto.randomUUID()}`;
      await client.shareTree(record.address, {
        hash,
        recipient: address,
        genesis: record.genesis,
        tip: record.tip,
        fileName: (record.tree.file_index && record.tree.file_index[record.tip]) || `${record.type}_claim`,
      });
      record.shares = record.shares || [];
      record.shares.push({ hash, recipient: address, createdAt: now().toISOString() });
      await store.upsert(record);
      return record;
    },

    /**
     * Fetch the attestations the service has recorded against a claim. The
     * service lets only the attester download a peer attestation's tree, so
     * such an entry is stored as pending until the attester hands the tree
     * over and it is imported; the service's own attestations download.
     */
    async pullAttestations(id) {
      const record = await store.get(id);
      if (!record) throw new Error('Claim not found');
      const { serviceDid } = await serviceCapabilities();
      const listed = (await client.listAttestations(record.address, record.tip))?.attestations || [];
      for (const info of listed) {
        if (!info?.tip || record.attestations.some((a) => a.tip === info.tip)) continue;
        const entry = {
          tip: info.tip,
          tree: null,
          attesterDid: info.attester_did || null,
          context: typeof info.context === 'string' ? info.context : '',
          source: sourceOf(info.attester_did, serviceDid),
          issuedAt: info.created_at || now().toISOString(),
          pending: true,
          verification: { isValid: false, status: 'Tree held by the attester; import it to verify', backend: 'service', checkedAt: now().toISOString() },
        };
        try {
          entry.tree = await fetchChain(record.address, info.tip);
          entry.pending = false;
          entry.verification = await verifyLinked(entry.tree, record.tree);
        } catch (err) {
          log.error('[AquaClaims] attestation tree not downloadable:', err?.message || err);
        }
        record.attestations.push(entry);
      }
      await store.upsert(record);
      return record;
    },

    /**
     * Import an attestation tree the attester handed over (file or pasted
     * JSON). It must name this claim, by a structural link or by the claim
     * tip in its context; one for another claim is refused (AS-REQ-0013).
     */
    async importAttestation(id, input) {
      const record = await store.get(id);
      if (!record) throw new Error('Claim not found');
      const { tree, payload, tip, attesterDid } = parseAttestationTree(input);
      const named = claimTipsNamedBy(tree);
      const listedTips = new Set(record.attestations.map((a) => a.tip));
      const namesThisClaim =
        named.has(record.tip.toLowerCase()) ||
        (record.genesis && named.has(record.genesis.toLowerCase())) ||
        Object.keys(record.tree.revisions).some((hash) => named.has(hash.toLowerCase())) ||
        listedTips.has(tip);
      if (!namesThisClaim) {
        throw new ClaimInputError('This attestation does not name this claim', 'tree');
      }
      if (attesterDid && attesterDid.toLowerCase() === record.signerDid.toLowerCase()) {
        throw new ClaimInputError('A claim cannot be attested by its own subject', 'tree');
      }
      const { serviceDid } = await serviceCapabilities();
      const entry = {
        tip,
        tree,
        attesterDid,
        context: payload.context,
        source: sourceOf(attesterDid, serviceDid),
        issuedAt: now().toISOString(),
        pending: false,
        verification: await verifyLinked(tree, record.tree),
      };
      const index = record.attestations.findIndex((a) => a.tip === tip);
      if (index >= 0) record.attestations[index] = { ...record.attestations[index], ...entry };
      else record.attestations.push(entry);
      await store.upsert(record);
      return record;
    },

    // ── Attestation: the attester's side ─────────────────────────────

    /** Claims other accounts shared with this wallet for attestation. */
    async listSharedClaims() {
      const wallet = await activeWalletOrThrow();
      const contracts = (await client.listSharesReceived(wallet.address))?.contracts || [];
      const shared = [];
      for (const contract of contracts) {
        if (!contract?.hash) continue;
        let data;
        try {
          data = await client.sharedData(wallet.address, contract.hash);
        } catch (err) {
          log.error('[AquaClaims] shared data unavailable:', err?.message || err);
          continue;
        }
        for (const tree of data?.trees || []) {
          if (!tree?.tip || tree.unavailable) continue;
          shared.push({
            contractHash: contract.hash,
            sender: contract.sender || data?.contract?.sender || null,
            tip: tree.tip,
            fileName: tree.file_name || contract.file_name || '',
            payload: tree.payload || null,
            templateName: tree.template_name || null,
            revisionCount: tree.revision_count || 0,
            attestationCount: tree.attestation_count || 0,
            sharedAt: contract.created_at || null,
          });
        }
      }
      return shared;
    },

    /**
     * Attest a claim another account shared with this wallet: the service
     * prepares the attestation's pre-image, the wallet signs it, the service
     * finalizes it, and the attester keeps the only downloadable copy to
     * hand back to the owner.
     */
    async attestSharedClaim({ contractHash, tip, context }) {
      const wallet = await activeWalletOrThrow();
      const words = text(context, 'context', { required: true, max: 1200 });
      // AS-REQ-0020: only a claim the service shows as shared with this
      // account is attested; the service enforces the same rule on its side.
      const shared = (await this.listSharedClaims()).find((s) => s.contractHash === contractHash && s.tip === tip);
      if (!shared) throw new Error('That claim is not shared with this wallet');
      const subjectDid = shared.payload?.signer_did || null;
      if (subjectDid && subjectDid.toLowerCase() === `did:pkh:eip155:1:${wallet.address}`.toLowerCase()) {
        throw new Error('You cannot attest your own claim');
      }
      const fullContext = attestationContext(words, tip);
      const prepared = await client.attestPrepare(wallet.address, tip, { context: fullContext });
      const signature = await signer.sign({
        address: wallet.address,
        purpose: 'attestation',
        message: prepared.message_hex,
        display: prepared.message_utf8,
      });
      const completed = await client.attestComplete(wallet.address, tip, { message_hex: prepared.message_hex, signature });
      const attestationTip = completed?.attestation_tip;
      if (!attestationTip) throw new Error('The service recorded no attestation');
      const tree = await fetchChain(wallet.address, attestationTip);
      const issued = {
        id: crypto.randomUUID(),
        tip: attestationTip,
        claimTip: tip,
        contractHash,
        subjectDid,
        subjectPayload: shared.payload || null,
        templateName: shared.templateName || null,
        context: fullContext,
        attesterDid: signerDidOf(tree) || `did:pkh:eip155:1:${wallet.address}`,
        tree,
        createdAt: now().toISOString(),
        verification: await verify(tree),
      };
      await store.addIssued(issued);
      return issued;
    },

    listIssued: () => store.listIssued(),

    /** The attestation tree as text, for handing to the claim's owner. */
    async exportIssued(id) {
      const issued = (await store.listIssued()).find((entry) => entry.id === id);
      if (!issued) throw new Error('Attestation not found');
      return JSON.stringify(issued.tree, null, 2);
    },

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
        record.attestations.push(await attestationRecord(record.address, result.attestation_tip, record.tree));
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
  claimTipsNamedBy,
  attestationContext,
  chainWithTip,
  payloadOf,
  signerDidOf,
  genesisOf,
  E164,
  EMAIL,
  DOMAIN,
};
