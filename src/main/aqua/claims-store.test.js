const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClaimsStore, ClaimsStoreLocked, STORE_FILE, didKey } = require('./claims-store');

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

  test('removeAll drops every claim and leaves issued attestations alone', async () => {
    const { store } = makeStore();
    await store.upsert(record());
    await store.upsert(record({ id: 'claim-2', type: 'email' }));
    await store.addIssued({ id: 'a1', tree: { revisions: {} } });
    expect(await store.removeAll()).toBe(2);
    expect(await store.list()).toEqual([]);
    expect(await store.listIssued()).toHaveLength(1);
    expect(await store.removeAll()).toBe(0);
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

describe('issued attestations', () => {
  const issued = (overrides = {}) => ({
    id: 'att-1', claimTip: '0xclaim', subjectDid: OTHER_DID, context: 'I know them',
    tree: { revisions: { '0x1620bb': {} }, file_index: {} }, createdAt: '2026-10-22T12:00:00Z', ...overrides,
  });

  test('AS-REQ-0013: an attestation issued for someone else is never listed among the user\'s own claims', async () => {
    const { store } = makeStore();
    await store.addIssued(issued());
    expect(await store.list()).toEqual([]);
    expect((await store.listIssued()).map((a) => a.id)).toEqual(['att-1']);
    await store.addIssued(issued({ context: 'updated' }));
    expect((await store.listIssued())[0].context).toBe('updated');
    expect(await store.removeIssued('att-1')).toBe(true);
    expect(await store.removeIssued('att-1')).toBe(false);
  });

  test('a store written before issued attestations existed still opens', async () => {
    const { store } = makeStore();
    await store.upsert(record());
    expect(await store.listIssued()).toEqual([]);
    await expect(store.addIssued({ id: 'x' })).rejects.toThrow('Aqua tree');
  });
});

describe('trust list', () => {
  const PEER = 'did:pkh:eip155:1:0xC412D3047AFFD97DC51C5C52E2588AE4238CBF88';
  const KEY = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';

  test('a DID is trusted or rejected, either undoes the other, and the choice survives a reopen', async () => {
    const { store, dataDir, state } = makeStore();
    expect(await store.listTrust()).toEqual([]);
    await store.setTrust(PEER, 'trusted', { at: '2026-11-10T10:00:00Z' });
    expect(await store.listTrust()).toEqual([
      { did: PEER, kind: 'person', state: 'trusted', updatedAt: '2026-11-10T10:00:00Z' },
    ]);
    // The same wallet in another letter case is the same entry.
    await store.setTrust(PEER.toLowerCase(), 'rejected', { at: '2026-11-10T11:00:00Z' });
    expect(await store.listTrust()).toEqual([
      { did: PEER, kind: 'person', state: 'rejected', updatedAt: '2026-11-10T11:00:00Z' },
    ]);
    await store.setTrust(PEER, 'trusted', { at: '2026-11-10T12:00:00Z' });
    const reopened = createClaimsStore({ dataDir, getSeed: async () => state.seed, isOwnDid: async () => true });
    expect((await reopened.listTrust())[0]).toMatchObject({ did: PEER, state: 'trusted' });
    // Sealed with the vault: the DID is not readable in the file.
    expect(fs.readFileSync(path.join(dataDir, STORE_FILE), 'utf8')).not.toContain('C412D3047AFF');
  });

  test('a did:key is compared exactly: a case variant is another key', async () => {
    const { store } = makeStore();
    await store.setTrust(KEY, 'trusted');
    await store.setTrust(KEY.replace('z6Mk', 'z6MK'), 'rejected');
    expect((await store.listTrust()).map((e) => e.state)).toEqual(['trusted', 'rejected']);
    expect(didKey(KEY)).toBe(KEY);
    expect(didKey(` ${PEER} `)).toBe(PEER.toLowerCase());
  });

  test('addTrusted adds only what the list does not know, so a rejection is never overwritten', async () => {
    const { store } = makeStore();
    await store.setTrust(KEY, 'rejected', { kind: 'service' });
    expect(await store.addTrusted([KEY, PEER, PEER.toLowerCase(), null, 'not a did'], { kind: 'service', at: 't' })).toBe(1);
    expect(await store.listTrust()).toEqual([
      expect.objectContaining({ did: KEY, kind: 'service', state: 'rejected' }),
      { did: PEER, kind: 'service', state: 'trusted', updatedAt: 't' },
    ]);
    expect(await store.addTrusted([KEY, PEER])).toBe(0);
  });

  test('refuses what is not a DID or not a state, needs the vault open, and outlives removeAll', async () => {
    const { store, state } = makeStore();
    await expect(store.setTrust('0xabc', 'trusted')).rejects.toThrow('needs a DID');
    await expect(store.setTrust(PEER, 'maybe')).rejects.toThrow('Unknown trust state');
    await store.setTrust(PEER, 'trusted');
    await store.upsert(record());
    await store.removeAll();
    expect(await store.listTrust()).toHaveLength(1);
    state.seed = null;
    await expect(store.listTrust()).rejects.toBeInstanceOf(ClaimsStoreLocked);
    await expect(store.setTrust(PEER, 'rejected')).rejects.toBeInstanceOf(ClaimsStoreLocked);
  });

  test('a store written before the trust list existed still opens', async () => {
    const { store } = makeStore();
    await store.upsert(record());
    expect(await store.listTrust()).toEqual([]);
  });
});
