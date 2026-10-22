/**
 * Selective disclosure of identity claims.
 *
 * A site (through `aqua_requestDisclosure` on the injected provider) or a
 * person (pasting the same JSON on freedom://identity) asks for some claim
 * types; the user ticks what to release on the sidebar's "Share identity"
 * screen; main builds one `DisclosurePolicy` per released claim, has the
 * SDK apply it in the worker, and assembles the response. Nothing here
 * decides trust: the request is validated, the user's ticks are honoured,
 * the SDK redacts. The chrome's screen is the only path to `buildResponse`.
 *
 * Request (`docs/aqua-disclosure.md`):
 *   { "aqua": 1, "need": ["email", { "type": "name", "fields": ["given_name"] }],
 *     "optional": ["domain"], "purpose": "…", "nonce": "…" }
 * Response:
 *   { "aqua": 1, "nonce", "subject", "claims": [{ "type", "fields", "claim": SelectiveTree,
 *     "attestations": [Tree…] }], "missing": ["domain"] }
 */
const { CLAIM_TYPES } = require('./claims-store');

const FORMAT_VERSION = 1;
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_PURPOSE = 400;
const MAX_NONCE = 128;
const MAX_ENTRIES = 8;

// The payload fields each claim type may carry, from the SDK templates.
// `signer_did` is the subject and is always disclosed.
const PAYLOAD_FIELDS = {
  name: ['given_name', 'family_name', 'middle_name', 'name_prefix', 'name_suffix', 'nickname', 'preferred_username', 'valid_from', 'valid_until'],
  email: ['email', 'display_name', 'valid_from', 'valid_until'],
  phone: ['phone_number', 'display_name', 'valid_from', 'valid_until'],
  domain: ['domain_name', 'proof_url', 'provider', 'provider_id', 'display_name', 'valid_from', 'valid_until', 'metadata'],
};
// Leaves of a tree-method object revision that are never payload and never
// redacted: a verifier needs them to place and type the revision. The nonce
// stays sealed (the SDK redacts it unless asked), as do unselected payloads.
const ALWAYS_DISCLOSED = ['/previous_revision', '/revision_type', '/local_timestamp', '/version', '/method'];

class DisclosureRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DisclosureRequestError';
    this.code = 'INVALID_REQUEST';
  }
}

function entryOf(raw, required) {
  const type = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.type : undefined;
  if (!CLAIM_TYPES.includes(type)) throw new DisclosureRequestError(`Unknown claim type: ${String(type)}`);
  let fields = null;
  if (raw && typeof raw === 'object' && raw.fields !== undefined) {
    if (!Array.isArray(raw.fields) || raw.fields.length === 0) {
      throw new DisclosureRequestError(`fields for ${type} must be a non-empty array`);
    }
    for (const field of raw.fields) {
      if (!PAYLOAD_FIELDS[type].includes(field)) {
        throw new DisclosureRequestError(`Unknown field for ${type}: ${String(field)}`);
      }
    }
    fields = [...new Set(raw.fields)];
  }
  return { type, required, fields };
}

/**
 * Validate and normalize a request from a page or from pasted text.
 * Refuses anything that is not exactly the documented shape.
 */
function parseDisclosureRequest(input) {
  let request = input;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_REQUEST_BYTES) throw new DisclosureRequestError('Request too large');
    try {
      request = JSON.parse(input);
    } catch {
      throw new DisclosureRequestError('Request is not valid JSON');
    }
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new DisclosureRequestError('Request must be an object');
  }
  if (JSON.stringify(request).length > MAX_REQUEST_BYTES) throw new DisclosureRequestError('Request too large');
  if (request.aqua !== FORMAT_VERSION) throw new DisclosureRequestError(`Unsupported request version: ${String(request.aqua)}`);
  if (!Array.isArray(request.need) || request.need.length === 0) {
    throw new DisclosureRequestError('Request names nothing it needs');
  }
  const optional = request.optional === undefined ? [] : request.optional;
  if (!Array.isArray(optional)) throw new DisclosureRequestError('optional must be an array');
  if (request.need.length + optional.length > MAX_ENTRIES) throw new DisclosureRequestError('Request asks for too much');
  const entries = [...request.need.map((raw) => entryOf(raw, true)), ...optional.map((raw) => entryOf(raw, false))];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.type)) throw new DisclosureRequestError(`Claim type listed twice: ${entry.type}`);
    seen.add(entry.type);
  }
  const purpose = request.purpose === undefined ? '' : request.purpose;
  if (typeof purpose !== 'string' || purpose.length > MAX_PURPOSE) throw new DisclosureRequestError('purpose must be short text');
  const nonce = request.nonce === undefined ? '' : request.nonce;
  if (typeof nonce !== 'string' || nonce.length > MAX_NONCE) throw new DisclosureRequestError('nonce must be a short string');
  return { version: FORMAT_VERSION, entries, purpose: purpose.trim(), nonce };
}

function attestedCount(claim) {
  return (claim.attestations || []).filter((a) => a.tree && a.verification?.isValid).length;
}

/**
 * Pick the claim to offer for each requested type: the subject must be the
 * connected wallet; an attested claim beats a self-signed one, a newer one
 * beats an older one.
 */
function matchClaims(request, claims, subjectAddress) {
  const subject = String(subjectAddress || '').toLowerCase();
  const own = claims.filter((claim) => claim.address && claim.address.toLowerCase() === subject);
  return request.entries.map((entry) => {
    const candidates = own
      .filter((claim) => claim.type === entry.type)
      .sort((a, b) => attestedCount(b) - attestedCount(a) || String(b.signedAt || '').localeCompare(String(a.signedAt || '')));
    const claim = candidates[0] || null;
    return {
      type: entry.type,
      required: entry.required,
      fields: entry.fields,
      claimId: claim ? claim.id : null,
      summary: claim ? claimSummary(claim, entry.fields) : null,
    };
  });
}

/** What the consent screen shows for one claim: values, never trees. */
function claimSummary(claim, fields) {
  const payload = claim.payload || {};
  const shown = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'signer_did') continue;
    if (fields && !fields.includes(key)) continue;
    shown[key] = value;
  }
  return {
    id: claim.id,
    type: claim.type,
    signerDid: claim.signerDid,
    payload: shown,
    attested: attestedCount(claim),
    attesters: (claim.attestations || []).filter((a) => a.tree && a.verification?.isValid).map((a) => a.attesterDid),
    verified: claim.verification?.isValid === true,
  };
}

function objectRevisionOf(tree) {
  const entry = Object.entries(tree.revisions).find(([, rev]) => rev.payloads && typeof rev.payloads === 'object');
  if (!entry) throw new Error('Claim tree has no object revision');
  return entry;
}

/**
 * The policy for one released claim. With no field selection every
 * revision goes out whole. With one, the object revision is field-redacted
 * to the metadata leaves, the subject, and the selected payload fields;
 * signature revisions are scalar and always whole.
 */
function buildPolicy(tree, fields) {
  if (!fields) return { revisions: {} };
  const [hash, revision] = objectRevisionOf(tree);
  if (revision.method !== 'tree') {
    throw new Error('Field redaction needs a tree-method claim revision');
  }
  const payloadKeys = Object.keys(revision.payloads);
  const disclosed = ALWAYS_DISCLOSED.filter((path) => revision[path.slice(1)] !== undefined);
  disclosed.push('/payloads/signer_did');
  for (const key of payloadKeys) {
    if (fields.includes(key) && key !== 'signer_did') disclosed.push(`/payloads/${key}`);
  }
  return { revisions: { [hash]: { FieldRedacted: disclosed } } };
}

/**
 * Build the response for the claims the user ticked.
 *
 * @param {object} args
 * @param {ReturnType<typeof parseDisclosureRequest>} args.request
 * @param {Array<{ type: string, claimId: string, fields: string[]|null }>} args.selections
 *   what the user released; a required type left out is reported as missing
 * @param {object[]} args.claims - the stored claim records
 * @param {string} args.subjectAddress
 * @param {(tree: object, policy: object) => Promise<object>} args.applyDisclosure
 */
async function buildResponse({ request, selections, claims, subjectAddress, applyDisclosure }) {
  const subject = String(subjectAddress || '').toLowerCase();
  const released = [];
  const releasedTypes = new Set();
  for (const selection of selections || []) {
    const entry = request.entries.find((e) => e.type === selection.type);
    if (!entry) throw new DisclosureRequestError(`Not requested: ${String(selection.type)}`);
    const claim = claims.find((c) => c.id === selection.claimId);
    if (!claim || claim.type !== entry.type) throw new Error('Released claim not found');
    if (!claim.address || claim.address.toLowerCase() !== subject) {
      throw new Error('Released claim belongs to another wallet');
    }
    // The user may narrow the requester's field list, never widen it.
    let fields = selection.fields === undefined ? entry.fields : selection.fields;
    if (fields !== null) {
      if (!Array.isArray(fields) || fields.length === 0) throw new DisclosureRequestError('Release at least one field');
      if (entry.fields) fields = fields.filter((f) => entry.fields.includes(f));
      for (const field of fields) {
        if (!PAYLOAD_FIELDS[entry.type].includes(field)) throw new DisclosureRequestError(`Unknown field: ${String(field)}`);
      }
      if (fields.length === 0) throw new DisclosureRequestError('Release at least one field');
    }
    const selective = await applyDisclosure(claim.tree, buildPolicy(claim.tree, fields));
    released.push({
      type: claim.type,
      fields,
      claim: selective,
      attestations: (claim.attestations || []).filter((a) => a.tree).map((a) => a.tree),
    });
    releasedTypes.add(claim.type);
  }
  const missing = request.entries.filter((e) => e.required && !releasedTypes.has(e.type)).map((e) => e.type);
  return {
    aqua: FORMAT_VERSION,
    nonce: request.nonce,
    subject: `did:pkh:eip155:1:${subjectAddress}`,
    issuedAt: new Date().toISOString(),
    claims: released,
    missing,
  };
}

module.exports = {
  parseDisclosureRequest,
  matchClaims,
  claimSummary,
  buildPolicy,
  buildResponse,
  DisclosureRequestError,
  PAYLOAD_FIELDS,
  FORMAT_VERSION,
  MAX_REQUEST_BYTES,
};
