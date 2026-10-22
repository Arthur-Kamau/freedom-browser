const fs = require('fs');
const path = require('path');
const { OPS } = require('./aqua-worker');
const {
  parseDisclosureRequest, matchClaims, buildPolicy, buildResponse, DisclosureRequestError,
} = require('./disclosure');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'name-claim.aqua.json'), 'utf8'));
const PEER = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'peer-attestation.aqua.json'), 'utf8'));
const ADDRESS = '0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8';
const [OBJ_HASH] = Object.entries(FIXTURE.revisions).find(([, r]) => r.payloads);

const applyDisclosure = async (tree, policy) => OPS.applyDisclosure({ tree, policy });

function claim(overrides = {}) {
  return {
    id: 'c1', type: 'name', address: ADDRESS, signerDid: `did:pkh:eip155:1:${ADDRESS}`,
    payload: { ...FIXTURE.revisions[OBJ_HASH].payloads }, tree: FIXTURE, signedAt: '2026-10-22T12:00:00Z',
    verification: { isValid: true }, attestations: [], ...overrides,
  };
}

describe('parseDisclosureRequest', () => {
  test('accepts strings and objects, type strings and field objects', () => {
    const parsed = parseDisclosureRequest('{"aqua":1,"need":["email",{"type":"name","fields":["given_name","given_name"]}],"optional":["domain"],"purpose":" hi ","nonce":"n"}');
    expect(parsed).toEqual({
      version: 1, purpose: 'hi', nonce: 'n',
      entries: [
        { type: 'email', required: true, fields: null },
        { type: 'name', required: true, fields: ['given_name'] },
        { type: 'domain', required: false, fields: null },
      ],
    });
  });

  test('refuses what is not the documented shape', () => {
    const bad = [
      ['not json', 'valid JSON'],
      ['[]', 'must be an object'],
      ['{"aqua":2,"need":["email"]}', 'version'],
      ['{"aqua":1}', 'names nothing'],
      ['{"aqua":1,"need":["passport"]}', 'Unknown claim type'],
      ['{"aqua":1,"need":[{"type":"name","fields":["ssn"]}]}', 'Unknown field'],
      ['{"aqua":1,"need":[{"type":"name","fields":[]}]}', 'non-empty'],
      ['{"aqua":1,"need":["email"],"optional":["email"]}', 'listed twice'],
      ['{"aqua":1,"need":["email"],"purpose":5}', 'purpose'],
      ['{"aqua":1,"need":["email"],"nonce":"' + 'x'.repeat(200) + '"}', 'nonce'],
      ['{"aqua":1,"need":["email"],"optional":"domain"}', 'optional must be'],
    ];
    for (const [input, message] of bad) {
      expect(() => parseDisclosureRequest(input)).toThrow(message);
      expect(() => parseDisclosureRequest(input)).toThrow(DisclosureRequestError);
    }
    expect(() => parseDisclosureRequest('{"aqua":1,"need":["email"],"purpose":"' + 'x'.repeat(9000) + '"}')).toThrow('too large');
  });
});

describe('matchClaims', () => {
  test('offers the connected wallet\'s claims only, attested first, then newest', () => {
    const request = parseDisclosureRequest({ aqua: 1, need: ['name'], optional: ['email'] });
    const older = claim({ id: 'old', signedAt: '2026-01-01T00:00:00Z' });
    const attested = claim({ id: 'att', signedAt: '2025-01-01T00:00:00Z', attestations: [{ tree: PEER, verification: { isValid: true }, attesterDid: 'did:x' }] });
    const foreign = claim({ id: 'foreign', address: '0x0000000000000000000000000000000000000001' });
    const matched = matchClaims(request, [older, claim(), attested, foreign], ADDRESS.toLowerCase());
    expect(matched.map((m) => [m.type, m.required, m.claimId])).toEqual([['name', true, 'att'], ['email', false, null]]);
    expect(matched[0].summary).toMatchObject({ attested: 1, attesters: ['did:x'], verified: true, payload: expect.objectContaining({ given_name: 'Probe' }) });
    expect(matched[0].summary.payload.signer_did).toBeUndefined();
  });

  test('a field selection narrows the summary to those fields', () => {
    const request = parseDisclosureRequest({ aqua: 1, need: [{ type: 'name', fields: ['given_name'] }] });
    const [m] = matchClaims(request, [claim()], ADDRESS);
    expect(Object.keys(m.summary.payload)).toEqual(['given_name']);
  });
});

describe('buildPolicy and buildResponse with the real SDK', () => {
  test('no field selection releases every revision whole, attestations alongside', async () => {
    const request = parseDisclosureRequest({ aqua: 1, need: ['name'], optional: ['email'], nonce: 'n1' });
    const c = claim({ attestations: [{ tree: PEER, verification: { isValid: true } }, { tree: null, pending: true }] });
    const response = await buildResponse({ request, selections: [{ type: 'name', claimId: 'c1' }], claims: [c], subjectAddress: ADDRESS, applyDisclosure });
    expect(response).toMatchObject({ aqua: 1, nonce: 'n1', subject: `did:pkh:eip155:1:${ADDRESS}`, missing: [] });
    expect(response.claims).toHaveLength(1);
    const [released] = response.claims;
    expect(released.type).toBe('name');
    expect(released.fields).toBeNull();
    expect(Object.values(released.claim.revisions).map((r) => r.disclosure)).toEqual(['Full', 'Full', 'Full']);
    expect(released.attestations).toEqual([PEER]);
  });

  test('a field selection redacts the other payload fields and keeps the metadata leaves', async () => {
    const request = parseDisclosureRequest({ aqua: 1, need: [{ type: 'name', fields: ['given_name', 'family_name'] }] });
    const response = await buildResponse({ request, selections: [{ type: 'name', claimId: 'c1', fields: ['given_name'] }], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure });
    const [released] = response.claims;
    expect(released.fields).toEqual(['given_name']);
    const redacted = released.claim.revisions[OBJ_HASH];
    expect(redacted.disclosure).toBe('Redacted');
    const disclosed = redacted.redacted.leaves.filter((l) => l.type === 'Disclosed').map((l) => l.path).sort();
    expect(disclosed).toEqual(['/local_timestamp', '/method', '/payloads/given_name', '/payloads/signer_did', '/previous_revision', '/revision_type', '/version']);
    const hidden = redacted.redacted.leaves.filter((l) => l.type === 'Redacted').map((l) => l.path);
    expect(hidden).toEqual(expect.arrayContaining(['/nonce', '/payloads/family_name', '/payloads/valid_from']));
    // The rest of the tree is whole.
    for (const [hash, rev] of Object.entries(released.claim.revisions)) {
      if (hash !== OBJ_HASH) expect(rev.disclosure).toBe('Full');
    }
  });

  test('the user may narrow the requested fields, never widen them', async () => {
    const request = parseDisclosureRequest({ aqua: 1, need: [{ type: 'name', fields: ['given_name'] }] });
    const response = await buildResponse({ request, selections: [{ type: 'name', claimId: 'c1', fields: ['given_name', 'family_name'] }], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure });
    expect(response.claims[0].fields).toEqual(['given_name']);
    await expect(buildResponse({ request, selections: [{ type: 'name', claimId: 'c1', fields: ['family_name'] }], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure })).rejects.toThrow('at least one field');
  });

  test('a required type left out is reported as missing; a claim of another wallet or type is never released', async () => {
    const request = parseDisclosureRequest({ aqua: 1, need: ['name', 'email'] });
    const response = await buildResponse({ request, selections: [], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure });
    expect(response.claims).toEqual([]);
    expect(response.missing).toEqual(['name', 'email']);
    await expect(buildResponse({ request, selections: [{ type: 'name', claimId: 'c1' }], claims: [claim({ address: '0x0000000000000000000000000000000000000001' })], subjectAddress: ADDRESS, applyDisclosure })).rejects.toThrow('another wallet');
    await expect(buildResponse({ request, selections: [{ type: 'domain', claimId: 'c1' }], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure })).rejects.toThrow('Not requested');
    await expect(buildResponse({ request, selections: [{ type: 'email', claimId: 'c1' }], claims: [claim()], subjectAddress: ADDRESS, applyDisclosure })).rejects.toThrow('not found');
  });

  test('buildPolicy refuses a scalar claim revision instead of pretending', () => {
    const scalar = JSON.parse(JSON.stringify(FIXTURE));
    scalar.revisions[OBJ_HASH].method = 'scalar';
    expect(() => buildPolicy(scalar, ['given_name'])).toThrow('tree-method');
    expect(buildPolicy(FIXTURE, null)).toEqual({ revisions: {} });
  });
});
