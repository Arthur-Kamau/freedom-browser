const fs = require('fs');
const path = require('path');
const { OPS } = require('./aqua-worker');
const wasm = require('./aqua-wasm');

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__', 'name-claim.aqua.json'), 'utf8')
);
const PROVENANCE = fs.readFileSync(path.join(__dirname, 'vendor', 'aqua-rs-sdk', 'PROVENANCE'), 'utf8');

afterAll(() => wasm.shutdown());

describe('vendored aqua-rs-sdk', () => {
  test('is the build PROVENANCE describes', () => {
    const { protocol, crate } = OPS.version();
    expect(PROVENANCE).toContain(`crate_version: ${crate}`);
    expect(PROVENANCE).toContain(`protocol_version: ${protocol}`);
    const crypto = require('crypto');
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(__dirname, 'vendor', 'aqua-rs-sdk', 'aqua_rs_sdk_bg.wasm')))
      .digest('hex');
    expect(PROVENANCE).toContain(`sha256_wasm: ${sha}`);
  });

  test('fullPolicy and applyDisclosure round-trip a signed claim tree', () => {
    const policy = OPS.fullPolicy({ tree: FIXTURE });
    expect(policy).toEqual({ revisions: {} });
    const selective = OPS.applyDisclosure({ tree: FIXTURE, policy });
    const hashes = Object.keys(FIXTURE.revisions);
    expect(Object.keys(selective.revisions).sort()).toEqual(hashes.sort());
    for (const entry of Object.values(selective.revisions)) expect(entry.disclosure).toBe('Full');
    expect(selective.file_index).toEqual(FIXTURE.file_index);
  });

  test('Hidden omits a signature leaf and leaves a content revision as a chain placeholder', () => {
    const [sigHash] = Object.entries(FIXTURE.revisions).find(([, r]) => r.signature).map((x) => x);
    const [objHash] = Object.entries(FIXTURE.revisions).find(([, r]) => r.payloads);
    const selective = OPS.applyDisclosure({
      tree: FIXTURE,
      policy: { revisions: { [sigHash]: 'Hidden', [objHash]: 'Hidden' } },
    });
    expect(selective.revisions[sigHash]).toBeUndefined();
    expect(selective.revisions[objHash]).toEqual({ disclosure: 'Hidden' });
  });

  test('FieldRedacted discloses only the named payload fields of a tree-method revision', () => {
    const [objHash] = Object.entries(FIXTURE.revisions).find(([, r]) => r.payloads);
    const selective = OPS.applyDisclosure({
      tree: FIXTURE,
      policy: { revisions: { [objHash]: { FieldRedacted: ['/payloads/given_name', '/revision_type'] } } },
    });
    const redacted = selective.revisions[objHash];
    expect(redacted.disclosure).toBe('Redacted');
    const disclosed = redacted.redacted.leaves.filter((l) => l.type === 'Disclosed').map((l) => l.path);
    expect(disclosed.sort()).toEqual(['/payloads/given_name', '/previous_revision', '/revision_type']);
    const hidden = redacted.redacted.leaves.filter((l) => l.type === 'Redacted').map((l) => l.path);
    expect(hidden).toContain('/payloads/family_name');
    expect(hidden).toContain('/payloads/signer_did');
  });

  test('a scalar revision cannot be field-redacted: the SDK refuses, it does not guess', () => {
    const [sigHash] = Object.entries(FIXTURE.revisions).find(([, r]) => r.signature);
    expect(() =>
      OPS.applyDisclosure({ tree: FIXTURE, policy: { revisions: { [sigHash]: { FieldRedacted: [] } } } })
    ).toThrow(/NotTreeMethod/);
  });

  // The upstream defect PROVENANCE records: at v7.0.0 the verifier reads the
  // wall clock through std, which has no wasm32 implementation. This pins the
  // reason tree verification goes through the service; when a fixed tag is
  // vendored this test is the one to flip.
  test('verifyAquaTree at this tag traps on the wall clock (PROVENANCE known defect)', () => {
    // console_error_panic_hook prints the panic before the trap; keep it out
    // of the test log.
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => OPS.verifyTree({ tree: FIXTURE })).toThrow();
    } finally {
      quiet.mockRestore();
    }
    expect(PROVENANCE).toContain('verifyAquaTree panics on wasm32');
  });
});

describe('aqua-wasm worker host', () => {
  test('answers from a worker thread, never the calling thread', async () => {
    const version = await wasm.sdkVersion();
    expect(version.crate).toBe('7.0.0');
    const selective = await wasm.applyDisclosure(FIXTURE, { revisions: {} });
    expect(Object.keys(selective.revisions)).toHaveLength(Object.keys(FIXTURE.revisions).length);
  });

  test('an SDK refusal comes back as a rejected promise carrying its message', async () => {
    await expect(wasm.applyDisclosure({ revisions: 'nope' }, { revisions: {} })).rejects.toThrow(/parse/i);
  });
});
