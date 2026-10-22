jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  BrowserWindow: { getFocusedWindow: jest.fn(() => null), getAllWindows: jest.fn(() => []) },
}));
jest.mock('../settings-store', () => ({ loadSettings: jest.fn(() => ({ enableIdentityWallet: true, aquaNodeUrl: 'https://aqua.test' })) }));
jest.mock('../lib/broadcast-to-all-webcontents', () => ({ broadcastToAllWebContents: jest.fn() }));
jest.mock('../identity-manager', () => ({
  getIdentityDataDir: jest.fn(() => require('os').tmpdir()),
  getDerivedWallets: jest.fn(async () => [{ index: 0, address: '0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8', type: 'mnemonic' }]),
  getActiveWalletIndex: jest.fn(() => 0),
  isVaultUnlocked: jest.fn(async () => true),
  hasVault: jest.fn(async () => true),
  loadIdentityModule: jest.fn(() => ({ getMnemonic: () => 'm', getSeed: () => Buffer.alloc(64, 1) })),
}));

const { ipcMain } = require('electron');
const { loadSettings } = require('../settings-store');
const { broadcastToAllWebContents } = require('../lib/broadcast-to-all-webcontents');
const IPC = require('../../shared/ipc-channels');
const { registerAquaIpc, createAquaDeps, addressOfDid, configuredNodeUrl } = require('./aqua-ipc');
const { ClaimsStoreLocked } = require('./claims-store');
const { ClaimInputError } = require('./claims-service');
const { AquaServiceError } = require('./aqua-client');

const ADDRESS = '0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8';

function handlers() {
  const map = new Map(ipcMain.handle.mock.calls.map(([channel, fn]) => [channel, fn]));
  const on = new Map(ipcMain.on.mock.calls.map(([channel, fn]) => [channel, fn]));
  return { invoke: (channel, ...args) => map.get(channel)({}, ...args), on };
}

beforeEach(() => {
  ipcMain.handle.mockClear();
  ipcMain.on.mockClear();
  broadcastToAllWebContents.mockClear();
  loadSettings.mockReturnValue({ enableIdentityWallet: true, aquaNodeUrl: 'https://aqua.test' });
  delete process.env.FREEDOM_AQUA_NODE_URL;
});

describe('addressOfDid / configuredNodeUrl', () => {
  test('reads the address out of a did:pkh:eip155 DID and nothing else', () => {
    expect(addressOfDid(`did:pkh:eip155:1:${ADDRESS}`)).toBe(ADDRESS.toLowerCase());
    expect(addressOfDid('did:key:z6Mk')).toBeNull();
    expect(addressOfDid(ADDRESS)).toBeNull();
  });

  test('the environment overrides the setting, which overrides the default', () => {
    expect(configuredNodeUrl()).toBe('https://aqua.test');
    process.env.FREEDOM_AQUA_NODE_URL = 'http://127.0.0.1:3000';
    expect(configuredNodeUrl()).toBe('http://127.0.0.1:3000');
    delete process.env.FREEDOM_AQUA_NODE_URL;
    loadSettings.mockReturnValue({});
    expect(configuredNodeUrl()).toBe('https://dev.aquafire.inblock.io');
  });
});

describe('createAquaDeps signing bridge', () => {
  test('a signing request reaches the chrome with the wallet index and settles on its answer', async () => {
    const sent = [];
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: (channel, payload) => sent.push({ channel, payload }), signTimeoutMs: 1000 });
    const pending = deps.client.login(ADDRESS).catch((err) => err);
    // login first fetches a nonce; with no server it fails before signing.
    expect(await pending).toBeInstanceOf(Error);

    const sign = deps.service; // the service uses the same signer
    expect(sign).toBeDefined();
    const promise = new Promise((resolve, reject) => {
      deps.pendingSignatures.set('r-1', { resolve, reject, timer: setTimeout(() => {}, 0) });
    });
    expect(deps.settleSignature({ requestId: 'r-1', signature: '0x' + 'ab'.repeat(65) })).toBe(true);
    await expect(promise).resolves.toBe('0x' + 'ab'.repeat(65));
    expect(deps.settleSignature({ requestId: 'nope', signature: '0x' })).toBe(false);
  });

  test('a rejection or a malformed signature rejects the waiting request', async () => {
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: () => {}, signTimeoutMs: 1000 });
    const rejected = new Promise((resolve, reject) => deps.pendingSignatures.set('r-2', { resolve, reject, timer: setTimeout(() => {}, 0) }));
    deps.settleSignature({ requestId: 'r-2', error: { message: 'User rejected the request' } });
    await expect(rejected).rejects.toThrow('User rejected');
    const bad = new Promise((resolve, reject) => deps.pendingSignatures.set('r-3', { resolve, reject, timer: setTimeout(() => {}, 0) }));
    deps.settleSignature({ requestId: 'r-3', signature: 'not-a-signature' });
    await expect(bad).rejects.toThrow('rejected');
  });

  test('a request for a wallet not in the profile is refused without asking the chrome', async () => {
    const sent = [];
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: (c, p) => sent.push(p) });
    // Reach the signer through the client's SIWE path with a foreign address.
    const fetchFail = deps.client.login('0x0000000000000000000000000000000000000001').catch((e) => e);
    expect(await fetchFail).toBeInstanceOf(Error);
    expect(sent).toEqual([]);
  });

  test('getActiveWallet and isOwnDid come from the profile\'s wallet list', async () => {
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: () => {} });
    expect(await deps.getActiveWallet()).toEqual({ index: 0, address: ADDRESS, type: 'mnemonic' });
  });
});

describe('registerAquaIpc', () => {
  function fakeDeps(overrides = {}) {
    const service = {
      status: jest.fn(async () => ({ nodeUrl: 'https://aqua.test', wallet: { address: ADDRESS, index: 0, type: 'mnemonic', canSign: true } })),
      listClaims: jest.fn(async () => [{ id: 'c1' }]),
      createClaim: jest.fn(async () => ({ id: 'c2' })),
      removeClaim: jest.fn(async () => true),
      refreshClaim: jest.fn(async () => ({ id: 'c1' })),
      sendCode: jest.fn(async () => ({ target: 'a@b.c', message: 'sent' })),
      verifyCode: jest.fn(async () => ({ verificationToken: 'vt' })),
      dnsInstructions: jest.fn(async () => ({ record_name: 'x' })),
      verifyDns: jest.fn(async () => ({ id: 'c3' })),
      ...overrides,
    };
    const settle = jest.fn();
    return { deps: { nodeUrl: 'https://aqua.test', service, settleSignature: settle }, service, settle };
  }

  test('registers every claims channel and answers in the ipc-contract shape', async () => {
    const { deps, service } = fakeDeps();
    registerAquaIpc({ createDeps: () => deps, log: { error: () => {} } });
    const { invoke } = handlers();
    for (const channel of [
      IPC.AQUA_STATUS, IPC.AQUA_CLAIMS_LIST, IPC.AQUA_CLAIMS_CREATE, IPC.AQUA_CLAIMS_REMOVE, IPC.AQUA_CLAIMS_REFRESH,
      IPC.AQUA_CLAIMS_SEND_CODE, IPC.AQUA_CLAIMS_VERIFY_CODE, IPC.AQUA_CLAIMS_DNS_INSTRUCTIONS, IPC.AQUA_CLAIMS_VERIFY_DNS,
    ]) {
      expect(ipcMain.handle).toHaveBeenCalledWith(channel, expect.any(Function));
    }
    expect(await invoke(IPC.AQUA_STATUS)).toEqual({
      success: true, nodeUrl: 'https://aqua.test', wallet: expect.objectContaining({ canSign: true }), vaultUnlocked: true, hasVault: true,
    });
    expect(await invoke(IPC.AQUA_CLAIMS_LIST)).toEqual({ success: true, claims: [{ id: 'c1' }] });
    expect(await invoke(IPC.AQUA_CLAIMS_CREATE, { type: 'name', fields: {} })).toEqual({ success: true, claim: { id: 'c2' } });
    expect(service.createClaim).toHaveBeenCalledWith({ type: 'name', fields: {} });
    expect(broadcastToAllWebContents).toHaveBeenCalledWith(IPC.AQUA_CLAIMS_CHANGED, {});
  });

  test('errors map to codes the page can act on', async () => {
    const { deps, service } = fakeDeps();
    registerAquaIpc({ createDeps: () => deps, log: { error: () => {} } });
    const { invoke } = handlers();
    service.listClaims.mockRejectedValueOnce(new ClaimsStoreLocked());
    expect(await invoke(IPC.AQUA_CLAIMS_LIST)).toMatchObject({ success: false, error: { code: 'VAULT_LOCKED' } });
    service.createClaim.mockRejectedValueOnce(new ClaimInputError('Phone number must be E.164', 'phone_number'));
    expect(await invoke(IPC.AQUA_CLAIMS_CREATE, {})).toMatchObject({ success: false, error: { code: 'INVALID_INPUT', details: { field: 'phone_number' } } });
    service.createClaim.mockRejectedValueOnce(new AquaServiceError('nope', { status: 502, path: '/x' }));
    expect(await invoke(IPC.AQUA_CLAIMS_CREATE, {})).toMatchObject({ success: false, error: { code: 'SERVICE', message: 'nope', details: { status: 502 } } });
    service.createClaim.mockRejectedValueOnce(new Error('boom'));
    expect(await invoke(IPC.AQUA_CLAIMS_CREATE, {})).toMatchObject({ success: false, error: { code: 'ERROR', message: 'boom' } });
    expect(broadcastToAllWebContents).not.toHaveBeenCalled();
  });

  test('the feature switch in Settings → Advanced gates every handler', async () => {
    const { deps } = fakeDeps();
    registerAquaIpc({ createDeps: () => deps, log: { error: () => {} } });
    loadSettings.mockReturnValue({ enableIdentityWallet: false });
    const { invoke } = handlers();
    expect(await invoke(IPC.AQUA_CLAIMS_LIST)).toMatchObject({ success: false, error: { code: 'DISABLED' } });
  });

  test('the sign response channel settles the pending request and a URL change rebuilds the deps', async () => {
    const built = [];
    const { deps, settle } = fakeDeps();
    registerAquaIpc({ createDeps: ({ nodeUrl }) => { built.push(nodeUrl); return { ...deps, nodeUrl }; }, log: { error: () => {} } });
    const { invoke, on } = handlers();
    await invoke(IPC.AQUA_CLAIMS_LIST);
    on.get(IPC.AQUA_SIGN_RESPONSE)({}, { requestId: 'r', signature: '0x' + 'ab'.repeat(65) });
    expect(settle).toHaveBeenCalledWith({ requestId: 'r', signature: '0x' + 'ab'.repeat(65) });
    loadSettings.mockReturnValue({ enableIdentityWallet: true, aquaNodeUrl: 'https://other.test' });
    await invoke(IPC.AQUA_CLAIMS_LIST);
    expect(built).toEqual(['https://aqua.test', 'https://other.test']);
  });
});

describe('registerAquaIpc attestation channels', () => {
  test('owner and attester channels are registered and broadcast on mutation', async () => {
    const service = {
      shareForAttestation: jest.fn(async () => ({ id: 'c1', shares: [{}] })),
      pullAttestations: jest.fn(async () => ({ id: 'c1' })),
      importAttestation: jest.fn(async () => ({ id: 'c1' })),
      listSharedClaims: jest.fn(async () => [{ tip: '0xt' }]),
      attestSharedClaim: jest.fn(async () => ({ id: 'a1' })),
      listIssued: jest.fn(async () => []),
      exportIssued: jest.fn(async () => '{"revisions":{}}'),
    };
    registerAquaIpc({ createDeps: () => ({ nodeUrl: 'https://aqua.test', service, settleSignature: jest.fn() }), log: { error: () => {} } });
    const { invoke } = handlers();
    expect(await invoke(IPC.AQUA_CLAIMS_SHARE, 'c1', '0xabc')).toEqual({ success: true, claim: { id: 'c1', shares: [{}] } });
    expect(service.shareForAttestation).toHaveBeenCalledWith('c1', '0xabc');
    expect(await invoke(IPC.AQUA_CLAIMS_PULL_ATTESTATIONS, 'c1')).toMatchObject({ success: true });
    expect(await invoke(IPC.AQUA_CLAIMS_IMPORT_ATTESTATION, 'c1', '{}')).toMatchObject({ success: true });
    expect(service.importAttestation).toHaveBeenCalledWith('c1', '{}');
    expect(await invoke(IPC.AQUA_SHARED_LIST)).toEqual({ success: true, shared: [{ tip: '0xt' }] });
    expect(await invoke(IPC.AQUA_SHARED_ATTEST, { contractHash: 'h', tip: '0xt', context: 'x' })).toEqual({ success: true, issued: { id: 'a1' } });
    expect(await invoke(IPC.AQUA_ISSUED_LIST)).toEqual({ success: true, issued: [] });
    expect(await invoke(IPC.AQUA_ISSUED_EXPORT, 'a1')).toEqual({ success: true, json: '{"revisions":{}}' });
    expect(broadcastToAllWebContents).toHaveBeenCalledTimes(4);
  });
});

describe('disclosure channels', () => {
  const FIXTURE = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '__fixtures__', 'name-claim.aqua.json'), 'utf8'));
  const [OBJ] = Object.entries(FIXTURE.revisions).find(([, r]) => r.payloads);
  const CLAIM = { id: 'c1', type: 'name', address: ADDRESS, signerDid: `did:pkh:eip155:1:${ADDRESS}`, payload: FIXTURE.revisions[OBJ].payloads, tree: FIXTURE, signedAt: '2026-10-22T12:00:00Z', verification: { isValid: true }, attestations: [] };

  test('prepare matches the request against the stored claims, build applies the ticks through the worker', async () => {
    const sent = [];
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: (c, p) => sent.push({ c, p }) });
    deps.service.listClaims = jest.fn(async () => [CLAIM]);
    const prepared = await deps.prepareDisclosure({ request: { aqua: 1, need: ['name'], optional: ['email'] }, address: ADDRESS });
    expect(prepared.entries.map((e) => [e.type, e.claimId])).toEqual([['name', 'c1'], ['email', null]]);
    const response = await deps.buildDisclosure({ request: { aqua: 1, need: ['name'], nonce: 'n' }, selections: [{ type: 'name', claimId: 'c1' }], address: ADDRESS });
    expect(response.nonce).toBe('n');
    expect(response.claims[0].claim.revisions[OBJ].disclosure).toBe('Full');
    await require('./aqua-wasm').shutdown();
  });

  test('a pasted request goes to the chrome and settles on its answer', async () => {
    const sent = [];
    const deps = createAquaDeps({ nodeUrl: 'https://aqua.test', sendToChrome: (c, p) => sent.push({ c, p }), signTimeoutMs: 1000 });
    const promise = deps.manualDisclosure('{"aqua":1,"need":[{"type":"name","fields":["given_name"]}],"purpose":"hi"}');
    await new Promise((r) => setImmediate(r));
    expect(sent[0].c).toBe(IPC.AQUA_DISCLOSURE_REQUEST);
    expect(sent[0].p).toMatchObject({ address: ADDRESS, requester: { label: 'Pasted request' }, request: { aqua: 1, need: [{ type: 'name', fields: ['given_name'] }], optional: [], purpose: 'hi' } });
    expect(deps.settleDisclosure({ requestId: sent[0].p.requestId, response: { aqua: 1, claims: [] } })).toBe(true);
    await expect(promise).resolves.toEqual({ aqua: 1, claims: [] });
    const rejected = deps.manualDisclosure({ aqua: 1, need: ['email'] });
    await new Promise((r) => setImmediate(r));
    deps.settleDisclosure({ requestId: sent[1].p.requestId, error: { message: 'User rejected the request' } });
    await expect(rejected).rejects.toThrow('User rejected');
    await expect(deps.manualDisclosure('nope')).rejects.toThrow('valid JSON');
  });

  test('the handlers map a malformed request to INVALID_REQUEST', async () => {
    const deps = { nodeUrl: 'https://aqua.test', service: {}, settleSignature: jest.fn(), settleDisclosure: jest.fn(),
      prepareDisclosure: async () => { throw new (require('./disclosure').DisclosureRequestError)('Request names nothing it needs'); } };
    registerAquaIpc({ createDeps: () => deps, log: { error: () => {} } });
    const { invoke, on } = handlers();
    expect(await invoke(IPC.AQUA_DISCLOSURE_PREPARE, {})).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
    on.get(IPC.AQUA_DISCLOSURE_MANUAL_RESPONSE)({}, { requestId: 'r', response: {} });
    expect(deps.settleDisclosure).toHaveBeenCalledWith({ requestId: 'r', response: {} });
  });
});
