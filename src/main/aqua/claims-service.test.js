const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClaimsService, validateClaimInput, ClaimInputError } = require('./claims-service');
const { createClaimsStore } = require('./claims-store');
const { writeAquaArtifact } = require('../../../test/helpers/zip-writer');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'name-claim.aqua.json'), 'utf8'));
const ADDRESS = '0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8';
const DID = `did:pkh:eip155:1:${ADDRESS}`;
const TIP = Object.entries(FIXTURE.revisions).find(([, r]) => r.payloads)[0];
const SEED = crypto.createHash('sha512').update('seed').digest();

// A service-issued attestation tree, as the service would return it for an
// email claim: one typed object naming the attester and its words.
const ATTESTATION_TIP = '0x1620' + 'ab'.repeat(32);
const ATTESTATION_TREE = {
  revisions: {
    [ATTESTATION_TIP]: {
      revision_type: '0x1620' + 'cd'.repeat(32),
      method: 'tree',
      payloads: { signer_did: 'did:pkh:eip155:1:0x7c52cdefe1c9b99e16d2baa52a18e894382738a0', context: 'The Aqua Server attests that a code sent to a@b.c was entered' },
    },
  },
  file_index: {},
};

function setup({ wallet = { index: 0, address: ADDRESS, type: 'mnemonic' }, attestationTip = null, verifyResult } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-svc-'));
  const store = createClaimsStore({ dataDir, getSeed: async () => SEED, isOwnDid: async (did) => did.toLowerCase() === DID.toLowerCase() });
  const client = {
    baseUrl: 'https://aqua.test',
    createNameClaim: jest.fn(async () => ({ success: true, tip: TIP, claim_type: 'name_claim' })),
    createEmailClaim: jest.fn(async () => ({ success: true, tip: TIP, claim_type: 'email_claim' })),
    createPhoneClaim: jest.fn(async () => ({ success: true, tip: TIP })),
    createDnsClaim: jest.fn(async () => ({ success: true, tip: TIP, domain: 'example.com', verification_status: 'pending' })),
    prepareSign: jest.fn(async () => ({ message_hex: '0x7b7d', message_utf8: '{}', signer_did: DID })),
    completeSign: jest.fn(async () => ({ success: true, new_tip: TIP, attestation_tip: attestationTip })),
    downloadTree: jest.fn(async (_address, tip) =>
      tip === ATTESTATION_TIP
        ? writeAquaArtifact({ attestation: ATTESTATION_TREE })
        : writeAquaArtifact({ name_claim_Probe_Freedom: FIXTURE })),
    verifyTree: jest.fn(async () => verifyResult || { success: true, is_valid: true, status: 'OK', logs: [] }),
    sendCode: jest.fn(async () => ({ success: true, message: 'sent' })),
    verifyCode: jest.fn(async () => ({ success: true, message: 'ok', verification_token: 'vt-1' })),
    dnsInstructions: jest.fn(async () => ({ record_name: '_aqua.example.com', record_value: 'aqua=x' })),
    verifyDns: jest.fn(async () => ({ success: true, verification_status: 'verified' })),
  };
  const signer = { sign: jest.fn(async () => '0x' + 'ee'.repeat(65)) };
  const service = createClaimsService({
    store,
    client,
    signer,
    getActiveWallet: async () => wallet,
    now: () => new Date('2026-10-22T12:00:00Z'),
    log: { error: () => {} },
  });
  return { service, store, client, signer };
}

describe('validateClaimInput', () => {
  test('name needs given and family names and drops empty optionals', () => {
    expect(validateClaimInput('name', { given_name: ' A ', family_name: 'B', nickname: '' })).toEqual({
      given_name: 'A', family_name: 'B', middle_name: undefined, nickname: undefined,
    });
    expect(() => validateClaimInput('name', { given_name: 'A' })).toThrow(ClaimInputError);
    expect(() => validateClaimInput('name', { given_name: 'x'.repeat(300), family_name: 'B' })).toThrow('too long');
  });

  test('phone numbers must match the template\'s E.164 pattern', () => {
    expect(validateClaimInput('phone', { phone_number: '+254712345678', verification_token: 't' }).phone_number).toBe('+254712345678');
    for (const bad of ['0712345678', '+0712', '+1 212 555 0100', '+' + '1'.repeat(16)]) {
      expect(() => validateClaimInput('phone', { phone_number: bad, verification_token: 't' })).toThrow('E.164');
    }
  });

  test('email and domain are checked and the domain is lower-cased', () => {
    expect(validateClaimInput('email', { email: 'a@b.co', verification_token: 't' }).email).toBe('a@b.co');
    expect(() => validateClaimInput('email', { email: 'nope', verification_token: 't' })).toThrow('valid email');
    expect(validateClaimInput('domain', { domain: 'Example.COM' })).toEqual({ domain: 'example.com' });
    expect(() => validateClaimInput('domain', { domain: 'http://example.com' })).toThrow('domain name');
    expect(() => validateClaimInput('domain', { domain: 'localhost' })).toThrow('domain name');
  });
});

describe('createClaim', () => {
  test('creates, signs through the wallet, downloads, verifies and stores a name claim as self-signed', async () => {
    const { service, store, client, signer } = setup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'Probe', family_name: 'Freedom' } });

    expect(client.createNameClaim).toHaveBeenCalledWith(ADDRESS, { given_name: 'Probe', family_name: 'Freedom' });
    expect(signer.sign).toHaveBeenCalledWith({ address: ADDRESS, purpose: 'claim', message: '0x7b7d', display: '{}' });
    expect(client.completeSign).toHaveBeenCalledWith(ADDRESS, TIP, { message_hex: '0x7b7d', signature: '0x' + 'ee'.repeat(65) });
    expect(client.verifyTree).toHaveBeenCalledWith(FIXTURE);

    // The service writes the payload's signer_did from its session address,
    // which is lower-case; the signature revision carries the EIP-55 form.
    expect(record.signerDid.toLowerCase()).toBe(DID.toLowerCase());
    expect(record).toMatchObject({
      type: 'name',
      address: ADDRESS,
      tip: TIP,
      payload: { given_name: 'Probe', family_name: 'Freedom' },
      verification: { isValid: true, status: 'OK', backend: 'service' },
      attestations: [],
      serverTips: { claim: TIP, attestation: null },
    });
    expect(record.genesis).toBe(Object.entries(FIXTURE.revisions).find(([, r]) => !r.previous_revision)[0]);
    expect(await store.list()).toHaveLength(1);
  });

  test('a service-issued attestation is downloaded and stored beside an email claim', async () => {
    const { service, client } = setup({ attestationTip: ATTESTATION_TIP });
    const record = await service.createClaim({ type: 'email', fields: { email: 'a@b.c', verification_token: 'vt-1' } });
    expect(client.createEmailClaim).toHaveBeenCalledWith(ADDRESS, { email: 'a@b.c', verification_token: 'vt-1' });
    expect(record.attestations).toHaveLength(1);
    expect(record.attestations[0]).toMatchObject({
      tip: ATTESTATION_TIP,
      attesterDid: 'did:pkh:eip155:1:0x7c52cdefe1c9b99e16d2baa52a18e894382738a0',
      context: expect.stringContaining('attests'),
      source: 'service',
      verification: { isValid: true },
    });
    expect(record.serverTips.attestation).toBe(ATTESTATION_TIP);
  });

  test('a wallet refusal stops before the service completes anything', async () => {
    const { service, store, client, signer } = setup();
    signer.sign.mockRejectedValueOnce(new Error('User rejected the request'));
    await expect(service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } })).rejects.toThrow('User rejected');
    expect(client.completeSign).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  test('invalid input never reaches the service', async () => {
    const { service, client } = setup();
    await expect(service.createClaim({ type: 'phone', fields: { phone_number: '0712', verification_token: 't' } })).rejects.toThrow('E.164');
    await expect(service.createClaim({ type: 'passport', fields: {} })).rejects.toThrow('Unknown claim type');
    expect(client.createPhoneClaim).not.toHaveBeenCalled();
  });

  test('a multi-owner account cannot create a claim', async () => {
    const { service, client } = setup({ wallet: { index: 7, address: ADDRESS, type: 'safe' } });
    await expect(service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } })).rejects.toThrow('multi-owner');
    expect(client.createNameClaim).not.toHaveBeenCalled();
  });

  test('a failed verification is recorded as invalid, never thrown away', async () => {
    const { service } = setup({ verifyResult: { success: true, is_valid: false, status: 'Signature leaf invalid', logs: [] } });
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } });
    expect(record.verification).toMatchObject({ isValid: false, status: 'Signature leaf invalid' });
  });

  test('AS-REQ-0013: a downloaded claim whose subject is another wallet is refused', async () => {
    const { service, client, store } = setup();
    const foreign = JSON.parse(JSON.stringify(FIXTURE));
    for (const rev of Object.values(foreign.revisions)) {
      if (rev.payloads) rev.payloads.signer_did = 'did:pkh:eip155:1:0x0000000000000000000000000000000000000001';
    }
    client.downloadTree.mockResolvedValueOnce(writeAquaArtifact({ claim: foreign }));
    await expect(service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } })).rejects.toThrow('wallet in this profile');
    expect(await store.list()).toEqual([]);
  });
});

describe('codes, refresh, removal, domains', () => {
  test('sendCode normalizes the target and verifyCode returns the token', async () => {
    const { service, client } = setup();
    expect(await service.sendCode({ channel: 'phone', target: ' +254712345678 ' })).toEqual({ target: '+254712345678', message: 'sent' });
    expect(client.sendCode).toHaveBeenCalledWith(ADDRESS, { target: '+254712345678', channel: 'phone' });
    await expect(service.sendCode({ channel: 'phone', target: '0712' })).rejects.toThrow('E.164');
    expect(await service.verifyCode({ target: 'a@b.c', code: ' 123456 ' })).toEqual({ verificationToken: 'vt-1' });
    client.verifyCode.mockResolvedValueOnce({ success: false, message: 'wrong code' });
    await expect(service.verifyCode({ target: 'a@b.c', code: '000000' })).rejects.toThrow('wrong code');
  });

  test('refreshClaim re-verifies and removeClaim removes', async () => {
    const { service, client } = setup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } });
    client.verifyTree.mockResolvedValueOnce({ success: true, is_valid: false, status: 'Chain broken', logs: [] });
    const refreshed = await service.refreshClaim(record.id);
    expect(refreshed.verification.status).toBe('Chain broken');
    expect(await service.removeClaim(record.id)).toBe(true);
    expect(await service.listClaims()).toEqual([]);
  });

  test('a domain claim keeps its verification status and picks up the DNS attestation', async () => {
    const { service, client } = setup();
    const record = await service.createClaim({ type: 'domain', fields: { domain: 'Example.com' } });
    expect(client.createDnsClaim).toHaveBeenCalledWith(ADDRESS, { domain: 'example.com' });
    expect(record.domainVerification).toBe('pending');
    expect(await service.dnsInstructions(record.id)).toMatchObject({ record_name: '_aqua.example.com' });
    client.verifyDns.mockResolvedValueOnce({ success: true, verification_status: 'verified', attestation_tip: ATTESTATION_TIP });
    const verified = await service.verifyDns(record.id);
    expect(verified.domainVerification).toBe('verified');
    expect(verified.attestations.map((a) => a.tip)).toEqual([ATTESTATION_TIP]);
  });

  test('status reports the service URL and whether the active wallet can sign', async () => {
    const { service } = setup({ wallet: { index: 3, address: ADDRESS, type: 'ledger' } });
    expect(await service.status()).toEqual({
      nodeUrl: 'https://aqua.test',
      service: { reachable: false, serviceDid: null, outOfBandVerification: false },
      wallet: { address: ADDRESS, index: 3, type: 'ledger', canSign: true },
    });
  });
});

describe('attestation: owner side', () => {
  const PEER = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'peer-attestation.aqua.json'), 'utf8'));
  const SHARED = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'shared-claim.aqua.json'), 'utf8'));
  const SHARED_TIP = Object.entries(SHARED.revisions).find(([, r]) => r.payloads)[0];
  const PEER_TIP = Object.entries(PEER.revisions).find(([, r]) => r.payloads)[0];
  const PEER_DID = 'did:pkh:eip155:1:0xc412d3047affd97dc51c5c52e2588ae4238cbf88';
  const SERVICE_DID = 'did:pkh:eip155:1:0x7c52cdefe1c9b99e16d2baa52a18e894382738a0';

  function withSharedClaim(extra = {}) {
    const ctx = setup(extra);
    ctx.client.downloadTree.mockImplementation(async (_a, tip) =>
      tip === ATTESTATION_TIP ? writeAquaArtifact({ attestation: ATTESTATION_TREE }) : writeAquaArtifact({ claim: SHARED }));
    ctx.client.completeSign.mockResolvedValue({ success: true, new_tip: SHARED_TIP, attestation_tip: null });
    ctx.client.createNameClaim.mockResolvedValue({ success: true, tip: SHARED_TIP });
    ctx.client.shareTree = jest.fn(async () => ({ success: true, hash: 'h' }));
    ctx.client.listAttestations = jest.fn(async () => ({ success: true, attestations: [], total: 0 }));
    ctx.client.capabilities = jest.fn(async () => ({ reachable: true, serviceDid: SERVICE_DID, outOfBandVerification: true }));
    return ctx;
  }
  // The shared-claim fixture belongs to another throwaway wallet; make the
  // store accept it as this profile's own.
  const OWN = 'did:pkh:eip155:1:0x9dc33190f554d86fa4433394a1c4989774262979';
  const ownStore = (dataDir) => createClaimsStore({ dataDir, getSeed: async () => SEED, isOwnDid: async (did) => did.toLowerCase() === OWN.toLowerCase() });

  function ownerSetup() {
    const ctx = withSharedClaim();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-owner-'));
    const store = ownStore(dataDir);
    const service = createClaimsService({ store, client: ctx.client, signer: ctx.signer, getActiveWallet: async () => ({ index: 0, address: '0x9dc33190f554d86fa4433394a1c4989774262979', type: 'mnemonic' }), now: () => new Date('2026-10-22T12:00:00Z'), log: { error: () => {} } });
    return { ...ctx, store, service };
  }

  test('shareForAttestation creates a latest-option contract and remembers it', async () => {
    const { service, client } = ownerSetup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'Share', family_name: 'Probe' } });
    const shared = await service.shareForAttestation(record.id, '0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88');
    expect(client.shareTree).toHaveBeenCalledWith(record.address, expect.objectContaining({ recipient: '0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88', genesis: record.genesis, tip: record.tip }));
    expect(shared.shares).toHaveLength(1);
    await expect(service.shareForAttestation(record.id, record.address)).rejects.toThrow('own wallet');
    await expect(service.shareForAttestation(record.id, 'bob')).rejects.toThrow('wallet address');
  });

  test('pullAttestations records a peer attestation as pending when its tree is not downloadable, and a service one in full', async () => {
    const { service, client } = ownerSetup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } });
    client.listAttestations.mockResolvedValueOnce({ success: true, attestations: [
      { tip: PEER_TIP, attester_did: PEER_DID, context: 'X: I know this person', created_at: '2026-10-22T12:10:34+00:00' },
      { tip: ATTESTATION_TIP, attester_did: SERVICE_DID, context: 'server words', created_at: '2026-10-22T12:11:00+00:00' },
    ] });
    client.downloadTree.mockImplementation(async (_a, tip) => {
      if (tip === PEER_TIP) throw new Error('404');
      if (tip === ATTESTATION_TIP) return writeAquaArtifact({ attestation: ATTESTATION_TREE });
      return writeAquaArtifact({ claim: SHARED });
    });
    const pulled = await service.pullAttestations(record.id);
    expect(pulled.attestations).toHaveLength(2);
    const peer = pulled.attestations.find((a) => a.tip === PEER_TIP);
    expect(peer).toMatchObject({ source: 'peer', pending: true, tree: null, attesterDid: PEER_DID, context: 'X: I know this person' });
    expect(peer.verification.isValid).toBe(false);
    const svc = pulled.attestations.find((a) => a.tip === ATTESTATION_TIP);
    expect(svc).toMatchObject({ source: 'service', pending: false, verification: { isValid: true } });
    // Pulling again adds nothing.
    client.listAttestations.mockResolvedValueOnce({ success: true, attestations: [{ tip: PEER_TIP, attester_did: PEER_DID, context: 'x' }] });
    expect((await service.pullAttestations(record.id)).attestations).toHaveLength(2);
  });

  test('importAttestation accepts the attester\'s tree when it names this claim and verifies it linked', async () => {
    const { service, client } = ownerSetup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } });
    const named = JSON.parse(JSON.stringify(PEER));
    named.revisions[PEER_TIP].payloads.context = `X: I know this person (attests claim ${record.tip})`;
    const imported = await service.importAttestation(record.id, JSON.stringify(named));
    expect(client.verifyTree).toHaveBeenLastCalledWith(named, { linkedTrees: [record.tree] });
    expect(imported.attestations).toHaveLength(1);
    expect(imported.attestations[0]).toMatchObject({ tip: PEER_TIP, attesterDid: PEER_DID, source: 'peer', pending: false, verification: { isValid: true } });
    // A pending entry from the service list is completed by the import.
    client.listAttestations.mockResolvedValueOnce({ success: true, attestations: [{ tip: PEER_TIP, attester_did: PEER_DID, context: 'x' }] });
    expect((await service.pullAttestations(record.id)).attestations).toHaveLength(1);
  });

  test('AS-REQ-0013: an attestation that names another claim, or the subject itself, is refused', async () => {
    const { service, store } = ownerSetup();
    const record = await service.createClaim({ type: 'name', fields: { given_name: 'A', family_name: 'B' } });
    await expect(service.importAttestation(record.id, JSON.stringify(PEER))).rejects.toThrow('does not name this claim');
    const self = JSON.parse(JSON.stringify(PEER));
    self.revisions[PEER_TIP].payloads.context = `me (attests claim ${record.tip})`;
    self.revisions[PEER_TIP].payloads.signer_did = record.signerDid;
    for (const rev of Object.values(self.revisions)) if (rev.signature) rev.signer = record.signerDid;
    await expect(service.importAttestation(record.id, self)).rejects.toThrow('own subject');
    await expect(service.importAttestation(record.id, 'nope')).rejects.toThrow('invalid JSON');
    await expect(service.importAttestation(record.id, { revisions: {} })).rejects.toThrow('not an attestation');
    expect((await store.get(record.id)).attestations).toEqual([]);
  });
});

describe('attestation: attester side', () => {
  const PEER = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'peer-attestation.aqua.json'), 'utf8'));
  const PEER_TIP = Object.entries(PEER.revisions).find(([, r]) => r.payloads)[0];
  const CLAIM_TIP = '0x1620feeab1cefafc430b7fa51ade78bd68438ed5ef771f4dd8f34345931f3b144b27';
  const OWNER_DID = 'did:pkh:eip155:1:0x9dc33190f554d86fa4433394a1c4989774262979';

  function attesterSetup() {
    const ctx = setup({ wallet: { index: 0, address: '0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88', type: 'mnemonic' } });
    ctx.client.listSharesReceived = jest.fn(async () => ({ success: true, contracts: [{ hash: 'h1', sender: OWNER_DID, file_name: 'name_claim_Share_Probe', created_at: '2026-10-22T12:10:33Z' }] }));
    ctx.client.sharedData = jest.fn(async () => ({ success: true, contract: { hash: 'h1', sender: OWNER_DID }, trees: [
      { tip: CLAIM_TIP, file_name: 'name_claim_Share_Probe', revision_count: 3, payload: { signer_did: OWNER_DID, given_name: 'Share', family_name: 'Probe' }, template_name: 'name_claim', attestation_count: 0 },
      { tip: '0x1620' + 'ff'.repeat(32), unavailable: true, revisions: [] },
    ] }));
    ctx.client.attestPrepare = jest.fn(async () => ({ message_hex: '0x7b7d', message_utf8: '{"a":1}', signer_did: 'did:pkh:eip155:1:0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88' }));
    ctx.client.attestComplete = jest.fn(async () => ({ success: true, attestation_tip: PEER_TIP, claim_tip: CLAIM_TIP }));
    ctx.client.downloadTree.mockImplementation(async () => writeAquaArtifact({ attestation: PEER }));
    ctx.client.capabilities = jest.fn(async () => ({ reachable: true, serviceDid: 'did:x', outOfBandVerification: true }));
    return ctx;
  }

  test('listSharedClaims shows what was shared with this wallet, skipping unavailable trees', async () => {
    const { service } = attesterSetup();
    const shared = await service.listSharedClaims();
    expect(shared).toEqual([expect.objectContaining({ contractHash: 'h1', sender: OWNER_DID, tip: CLAIM_TIP, templateName: 'name_claim', payload: expect.objectContaining({ given_name: 'Share' }) })]);
  });

  test('attestSharedClaim signs through the wallet, names the claim in the context, and keeps the tree', async () => {
    const { service, client, signer, store } = attesterSetup();
    const issued = await service.attestSharedClaim({ contractHash: 'h1', tip: CLAIM_TIP, context: 'I know this person' });
    expect(client.attestPrepare).toHaveBeenCalledWith('0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88', CLAIM_TIP, { context: `I know this person (attests claim ${CLAIM_TIP})` });
    expect(signer.sign).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'attestation', message: '0x7b7d', display: '{"a":1}' }));
    expect(client.attestComplete).toHaveBeenCalledWith('0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88', CLAIM_TIP, { message_hex: '0x7b7d', signature: '0x' + 'ee'.repeat(65) });
    expect(issued).toMatchObject({ tip: PEER_TIP, claimTip: CLAIM_TIP, subjectDid: OWNER_DID, verification: { isValid: true } });
    expect(await store.listIssued()).toHaveLength(1);
    expect(await store.list()).toEqual([]);
    expect(JSON.parse(await service.exportIssued(issued.id))).toEqual(PEER);
  });

  test('AS-REQ-0020: a claim the service does not show as shared with this wallet is not attested', async () => {
    const { service, client, signer } = attesterSetup();
    await expect(service.attestSharedClaim({ contractHash: 'h1', tip: '0x1620' + 'ab'.repeat(32), context: 'x' })).rejects.toThrow('not shared with this wallet');
    await expect(service.attestSharedClaim({ contractHash: 'other', tip: CLAIM_TIP, context: 'x' })).rejects.toThrow('not shared with this wallet');
    expect(client.attestPrepare).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  test('a wallet refuses to attest its own claim and needs words', async () => {
    const { service, client } = attesterSetup();
    client.sharedData.mockResolvedValueOnce({ success: true, contract: {}, trees: [{ tip: CLAIM_TIP, payload: { signer_did: 'did:pkh:eip155:1:0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88' } }] });
    await expect(service.attestSharedClaim({ contractHash: 'h1', tip: CLAIM_TIP, context: 'me' })).rejects.toThrow('your own claim');
    await expect(service.attestSharedClaim({ contractHash: 'h1', tip: CLAIM_TIP, context: '  ' })).rejects.toThrow('context is required');
  });
});
