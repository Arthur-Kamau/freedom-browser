const { createAquaClient, buildSiweMessage, normalizeBaseUrl, AquaServiceError } = require('./aqua-client');

const ADDRESS = '0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8';

// A fake service: records every request and answers from a route table.
function fakeService(routes) {
  const calls = [];
  const fetchImpl = jest.fn(async (url, init) => {
    const { pathname } = new URL(url);
    const key = `${init.method} ${pathname}`;
    calls.push({ key, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes[key];
    if (!route) return jsonResponse(404, { error: `no route ${key}` });
    return typeof route === 'function' ? route({ headers: init.headers, body: init.body }) : jsonResponse(200, route);
  });
  return { fetchImpl, calls };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
  };
}

function binaryResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'content-type' ? 'application/zip' : null) },
    arrayBuffer: async () => bytes,
    text: async () => bytes.toString(),
  };
}

const SESSION = { nonce: 'session-1', did: `did:pkh:eip155:1:${ADDRESS}`, expires_at: '2030-01-01T00:00:00Z' };

function makeClient(routes, overrides = {}) {
  const service = fakeService({
    'GET /auth/nonce': { nonce: 'n-1' },
    'POST /auth/siwe/verify': SESSION,
    ...routes,
  });
  const signMessage = jest.fn(async (address, message) => `0xsig(${address.slice(0, 6)}:${message.length})`);
  const client = createAquaClient({
    baseUrl: 'https://aqua.test/',
    fetchImpl: service.fetchImpl,
    signMessage,
    now: () => new Date('2026-10-22T10:00:00Z'),
    ...overrides,
  });
  return { client, service, signMessage };
}

describe('buildSiweMessage', () => {
  test('is the EIP-4361 text the service parses: host line, address, statement, then the fields', () => {
    const msg = buildSiweMessage({ baseUrl: 'https://aqua.test', address: ADDRESS, nonce: 'abc', issuedAt: '2026-10-22T10:00:00.000Z' });
    expect(msg.split('\n')).toEqual([
      'aqua.test wants you to sign in with your Ethereum account:',
      ADDRESS,
      '',
      'Freedom Browser identity claims',
      '',
      'URI: https://aqua.test',
      'Version: 1',
      'Chain ID: 1',
      'Nonce: abc',
      'Issued At: 2026-10-22T10:00:00.000Z',
    ]);
  });
});

describe('normalizeBaseUrl', () => {
  test('strips trailing slashes and refuses anything but http(s)', () => {
    expect(normalizeBaseUrl('https://aqua.test/')).toBe('https://aqua.test');
    expect(normalizeBaseUrl('http://127.0.0.1:3000//')).toBe('http://127.0.0.1:3000');
    expect(() => normalizeBaseUrl('ftp://aqua.test')).toThrow('must be http(s)');
    expect(() => normalizeBaseUrl('not a url')).toThrow('Invalid Aqua node URL');
  });
});

describe('createAquaClient sessions', () => {
  test('signs in once with the wallet, then sends the session nonce as a header', async () => {
    const { client, service, signMessage } = makeClient({
      'POST /api/claims/name/create': { success: true, tip: '0xtip', claim_type: 'name_claim' },
    });
    const created = await client.createNameClaim(ADDRESS, { given_name: 'A', family_name: 'B' });
    expect(created.tip).toBe('0xtip');
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage.mock.calls[0][1]).toContain('Nonce: n-1');
    const verify = service.calls.find((c) => c.key === 'POST /auth/siwe/verify');
    expect(verify.body).toEqual({ message: expect.stringContaining(ADDRESS), signature: expect.stringMatching(/^0xsig/) });
    const create = service.calls.find((c) => c.key === 'POST /api/claims/name/create');
    expect(create.headers.nonce).toBe('session-1');
    expect(create.body).toEqual({ given_name: 'A', family_name: 'B' });

    await client.createNameClaim(ADDRESS, { given_name: 'C', family_name: 'D' });
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(client.hasSession(ADDRESS.toLowerCase())).toBe(true);
  });

  test('a refused session is re-opened once and the call retried', async () => {
    let first = true;
    const { client, signMessage } = makeClient({
      'POST /api/claims/name/create': () => {
        if (first) {
          first = false;
          return jsonResponse(401, { error: 'Missing nonce header' });
        }
        return jsonResponse(200, { success: true, tip: '0xtip' });
      },
    });
    await client.login(ADDRESS);
    const created = await client.createNameClaim(ADDRESS, { given_name: 'A', family_name: 'B' });
    expect(created.tip).toBe('0xtip');
    expect(signMessage).toHaveBeenCalledTimes(2);
  });

  test('a service error surfaces its message, status and path, and is not retried', async () => {
    const { client, signMessage } = makeClient({
      'POST /api/claims/phone/create': () => jsonResponse(400, { error: 'phone_number must be E.164' }),
    });
    await expect(client.createPhoneClaim(ADDRESS, { phone_number: '123', verification_token: 't' })).rejects.toMatchObject({
      name: 'AquaServiceError',
      status: 400,
      path: '/api/claims/phone/create',
      message: 'phone_number must be E.164',
    });
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  test('a sign-in the wallet refuses never reaches the service', async () => {
    const { client, service } = makeClient({}, { signMessage: async () => { throw new Error('User rejected'); } });
    await expect(client.login(ADDRESS)).rejects.toThrow('User rejected');
    expect(service.calls.map((c) => c.key)).toEqual(['GET /auth/nonce']);
  });
});

describe('createAquaClient claim calls', () => {
  test('prepare and complete carry the wallet address the service binds the signature to', async () => {
    const { client, service } = makeClient({
      'POST /api/claims/0xtip/sign/prepare': { message_hex: '0x7b7d', message_utf8: '{}', signer_did: 'did:pkh:eip155:1:' + ADDRESS },
      'POST /api/claims/0xtip/sign/complete': { success: true, new_tip: '0xtip', attestation_tip: null },
    });
    const prep = await client.prepareSign(ADDRESS, '0xtip');
    expect(prep.message_hex).toBe('0x7b7d');
    await client.completeSign(ADDRESS, '0xtip', { message_hex: '0x7b7d', signature: '0xabc' });
    const complete = service.calls.find((c) => c.key === 'POST /api/claims/0xtip/sign/complete');
    expect(complete.body).toEqual({ message_hex: '0x7b7d', signature: '0xabc', wallet_address: ADDRESS });
    expect(service.calls.find((c) => c.key === 'POST /api/claims/0xtip/sign/prepare').body).toEqual({ wallet_address: ADDRESS });
  });

  test('downloadTree returns the raw artifact bytes', async () => {
    const zip = Buffer.from('PK...pretend');
    const { client } = makeClient({ 'GET /node/trees/0xtip/download': () => binaryResponse(zip) });
    const bytes = await client.downloadTree(ADDRESS, '0xtip');
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.equals(zip)).toBe(true);
  });

  test('verifyTree and verifySelectiveTree need no session and name their kind', async () => {
    const { client, service, signMessage } = makeClient({
      'POST /api/widget/verify': { success: true, is_valid: true, status: 'OK', logs: [] },
    });
    const tree = { revisions: {}, file_index: {} };
    expect((await client.verifyTree(tree)).is_valid).toBe(true);
    await client.verifySelectiveTree({ revisions: {}, file_index: {} });
    expect(signMessage).not.toHaveBeenCalled();
    const [a, b] = service.calls.filter((c) => c.key === 'POST /api/widget/verify');
    expect(a.body).toEqual({ kind: 'tree', main: tree, linked_trees: [] });
    expect(b.body.kind).toBe('selective');
    expect(a.headers.nonce).toBeUndefined();
  });

  test('send and verify code pass target and channel through', async () => {
    const { client, service } = makeClient({
      'POST /api/claims/send-code': { success: true, message: 'sent' },
      'POST /api/claims/verify-code': { success: true, message: 'ok', verification_token: 'vt' },
    });
    await client.sendCode(ADDRESS, { target: 'a@b.c', channel: 'email' });
    const verified = await client.verifyCode(ADDRESS, { target: 'a@b.c', code: '123456' });
    expect(verified.verification_token).toBe('vt');
    expect(service.calls.find((c) => c.key === 'POST /api/claims/send-code').body).toEqual({ target: 'a@b.c', channel: 'email' });
  });

  test('a network failure is an AquaServiceError naming the path', async () => {
    const client = createAquaClient({
      baseUrl: 'https://aqua.test',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
      signMessage: async () => '0x',
    });
    await expect(client.verifyTree({})).rejects.toBeInstanceOf(AquaServiceError);
    await expect(client.verifyTree({})).rejects.toThrow('ECONNREFUSED');
  });
});

describe('createAquaClient attestation calls', () => {
  test('shareTree builds a latest-option contract for one recipient', async () => {
    const { client, service } = makeClient({ 'POST /api/share/contracts': { success: true, hash: 'h1' } });
    await client.shareTree(ADDRESS, { hash: 'h1', recipient: '0xabc', genesis: '0xg', tip: '0xt', fileName: 'claim' });
    expect(service.calls.find((c) => c.key === 'POST /api/share/contracts').body).toEqual({
      hash: 'h1', recipients: ['0xabc'], option: 'latest', items: [{ genesis_hash: '0xg', latest: '0xt', file_name: 'claim' }],
    });
  });

  test('shares received are listed for the caller, and a contract\'s data is read by hash', async () => {
    const { client, service } = makeClient({
      'GET /api/share/contracts': { success: true, contracts: [{ hash: 'h1' }], total: 1 },
      'GET /api/share/data/h1': { success: true, contract: { hash: 'h1' }, trees: [] },
    });
    expect((await client.listSharesReceived(ADDRESS)).contracts).toHaveLength(1);
    expect((await client.sharedData(ADDRESS, 'h1')).contract.hash).toBe('h1');
    const list = service.calls.find((c) => c.key === 'GET /api/share/contracts');
    expect(service.fetchImpl.mock.calls.find(([url]) => url.includes('/api/share/contracts?'))[0]).toContain(`receiver=${ADDRESS}`);
    expect(list.headers.nonce).toBe('session-1');
  });

  test('attest prepare and complete bind the attester address and context', async () => {
    const { client, service } = makeClient({
      'POST /api/claims/0xt/attest/prepare': { message_hex: '0x7b7d', message_utf8: '{}', signer_did: 'did:pkh:eip155:1:' + ADDRESS },
      'POST /api/claims/0xt/attest/complete': { success: true, attestation_tip: '0xa', claim_tip: '0xt' },
      'GET /api/claims/0xt/attestations': { success: true, attestations: [], total: 0 },
    });
    await client.attestPrepare(ADDRESS, '0xt', { context: 'I know them' });
    await client.attestComplete(ADDRESS, '0xt', { message_hex: '0x7b7d', signature: '0xs' });
    expect(service.calls.find((c) => c.key === 'POST /api/claims/0xt/attest/prepare').body).toEqual({ context: 'I know them' });
    expect(service.calls.find((c) => c.key === 'POST /api/claims/0xt/attest/complete').body).toEqual({ message_hex: '0x7b7d', signature: '0xs', wallet_address: ADDRESS });
    expect((await client.listAttestations(ADDRESS, '0xt')).attestations).toEqual([]);
  });

  test('capabilities reports a bare node as reachable without out-of-band verification', async () => {
    const full = makeClient({ 'GET /node/identity': { did: 'did:pkh:eip155:1:0xnode' }, 'GET /api/claims/twilio-status': { enabled: true } });
    expect(await full.client.capabilities()).toEqual({ reachable: true, serviceDid: 'did:pkh:eip155:1:0xnode', outOfBandVerification: true });
    const bare = makeClient({ 'GET /node/identity': { did: 'did:pkh:eip155:1:0xnode' } });
    expect(await bare.client.capabilities()).toEqual({ reachable: true, serviceDid: 'did:pkh:eip155:1:0xnode', outOfBandVerification: false });
    const down = createAquaClient({ baseUrl: 'https://aqua.test', fetchImpl: async () => { throw new Error('down'); }, signMessage: async () => '0x' });
    expect(await down.capabilities()).toEqual({ reachable: false, serviceDid: null, outOfBandVerification: false });
    expect(full.signMessage).not.toHaveBeenCalled();
  });
});
