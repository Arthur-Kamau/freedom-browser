const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClaimsStore, ClaimsStoreLocked, STORE_FILE } = require('./claims-store');

const SEED = crypto.createHash('sha512').update('test seed').digest();
const OWN_DID = 'did:pkh:eip155:1:0x12BECb263eB324b9638Ef75cE9BA1ae5DB8b1AF8';
const OTHER_DID = 'did:pkh:eip155:1:0x0000000000000000000000000000000000000001';

function record(overrides = {}) {
  return {
    id: 'claim-1',
    type: 'name',
    signerDid: OWN_DID,
    tree: { revisions: { '0x1620aa': {} }, file_index: {} },
    attestations: [],
    payload: { given_name: 'A', family_name: 'B' },
    ...overrides,
  };
}

function makeStore({ seed = SEED, own = [OWN_DID] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-claims-'));
  const state = { seed };
  const store = createClaimsStore({
    dataDir,
    getSeed: async () => state.seed,
    isOwnDid: async (did) => own.map((d) => d.toLowerCase()).includes(did.toLowerCase()),
  });
  return { store, dataDir, state };
}

describe('claims store', () => {
  test('round-trips a claim through an encrypted file that holds no plaintext', async () => {
    const { store, dataDir } = makeStore();
    expect(await store.list()).toEqual([]);
    await store.upsert(record());
    expect(await store.get('claim-1')).toEqual(record());

    const file = fs.readFileSync(path.join(dataDir, STORE_FILE), 'utf8');
    expect(file).not.toContain('given_name');
    expect(file).not.toContain(OWN_DID);
    expect(JSON.parse(file)).toMatchObject({ version: 1, cipher: 'aes-256-gcm' });
    expect(fs.statSync(path.join(dataDir, STORE_FILE)).mode & 0o777).toBe(0o600);
  });

  test('upsert replaces by id and remove reports whether anything went', async () => {
    const { store } = makeStore();
    await store.upsert(record());
    await store.upsert(record({ id: 'claim-2', type: 'email' }));
    await store.upsert(record({ payload: { given_name: 'Z', family_name: 'B' } }));
    const claims = await store.list();
    expect(claims.map((c) => c.id)).toEqual(['claim-1', 'claim-2']);
    expect(claims[0].payload.given_name).toBe('Z');
    expect(await store.remove('claim-2')).toBe(true);
    expect(await store.remove('claim-2')).toBe(false);
    expect((await store.list()).map((c) => c.id)).toEqual(['claim-1']);
  });

  test('a locked vault means no reads and no writes, and nothing is lost', async () => {
    const { store, state } = makeStore();
    await store.upsert(record());
    state.seed = null;
    await expect(store.list()).rejects.toBeInstanceOf(ClaimsStoreLocked);
    await expect(store.upsert(record({ id: 'x' }))).rejects.toMatchObject({ code: 'VAULT_LOCKED' });
    state.seed = SEED;
    expect((await store.list()).map((c) => c.id)).toEqual(['claim-1']);
  });

  test('a different seed cannot open the file', async () => {
    const { store, state } = makeStore();
    await store.upsert(record());
    state.seed = crypto.createHash('sha512').update('another seed').digest();
    await expect(store.list()).rejects.toThrow();
  });

  test('AS-REQ-0013: a claim is stored only when its subject is one of this profile\'s wallets', async () => {
    const { store } = makeStore();
    await expect(store.upsert(record({ signerDid: OTHER_DID }))).rejects.toThrow('wallet in this profile');
    expect(await store.list()).toEqual([]);
    // Case of the address does not decide ownership.
    await store.upsert(record({ signerDid: OWN_DID.toLowerCase() }));
    expect((await store.list()).length).toBe(1);
  });

  test('refuses malformed records before touching the file', async () => {
    const { store } = makeStore();
    await expect(store.upsert(record({ type: 'passport' }))).rejects.toThrow('Unknown claim type');
    await expect(store.upsert(record({ signerDid: 'did:key:z6Mk' }))).rejects.toThrow('did:pkh:eip155');
    await expect(store.upsert(record({ tree: null }))).rejects.toThrow('Aqua tree');
    await expect(store.upsert(record({ attestations: undefined }))).rejects.toThrow('attestations');
    expect(store.exists()).toBe(false);
  });
});
