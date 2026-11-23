const { readZipEntries, readAquaChains } = require('./zip-reader');

const { writeZip } = require('../../../test/helpers/zip-writer');

const TREE = { revisions: { '0x1620aa': { revision_type: '0x1620bb' } }, file_index: {} };

describe('readZipEntries', () => {
  test('reads stored and deflated entries back byte for byte', () => {
    const big = Buffer.alloc(70_000, 'a');
    const zip = writeZip([
      { name: 'aqua.json', data: Buffer.from('{"roots":[]}'), method: 0 },
      { name: 'claim.aqua.json', data: Buffer.from(JSON.stringify(TREE)) },
      { name: 'asset.bin', data: big },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(['aqua.json', 'claim.aqua.json', 'asset.bin']);
    expect(entries[0].data.toString()).toBe('{"roots":[]}');
    expect(JSON.parse(entries[1].data.toString())).toEqual(TREE);
    expect(entries[2].data.equals(big)).toBe(true);
  });

  test('finds the end record behind an archive comment', () => {
    const zip = writeZip([{ name: 'a.txt', data: Buffer.from('hi') }], { comment: 'x'.repeat(300) });
    expect(readZipEntries(zip)[0].data.toString()).toBe('hi');
  });

  test('refuses what is not a ZIP, an encrypted entry, and an unknown method', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all, really'))).toThrow('Not a ZIP');
    expect(() => readZipEntries(Buffer.alloc(3))).toThrow('Not a ZIP');
    const encrypted = writeZip([{ name: 'a', data: Buffer.from('x'), flags: 0x0001 }]);
    expect(() => readZipEntries(encrypted)).toThrow('Encrypted');
    const bzip2 = writeZip([{ name: 'a', data: Buffer.from('x'), method: 12 }]);
    expect(() => readZipEntries(bzip2)).toThrow('Unsupported ZIP compression method 12');
  });

  test('refuses a truncated archive instead of returning partial data', () => {
    const zip = writeZip([{ name: 'a', data: Buffer.alloc(5000, 'b'), method: 0 }]);
    // Keep the end record but cut the entry's bytes out from under it, so
    // the central directory offset no longer lands on a central header.
    const broken = Buffer.concat([zip.subarray(0, 100), zip.subarray(zip.length - 120)]);
    expect(() => readZipEntries(broken)).toThrow('Corrupt ZIP');
  });
});

describe('readAquaChains', () => {
  test('returns only the parsed .aqua.json chains, never the manifest', () => {
    const zip = writeZip([
      { name: 'aqua.json', data: Buffer.from('{"type":"aqua_multi_file"}') },
      { name: 'name_claim_x.aqua.json', data: Buffer.from(JSON.stringify(TREE)) },
    ]);
    expect(readAquaChains(zip)).toEqual([{ name: 'name_claim_x.aqua.json', tree: TREE }]);
  });

  test('a chain entry that is not a tree is an error, not a silent skip', () => {
    const notJson = writeZip([{ name: 'x.aqua.json', data: Buffer.from('nope') }]);
    expect(() => readAquaChains(notJson)).toThrow('not an Aqua chain');
    const noRevisions = writeZip([{ name: 'x.aqua.json', data: Buffer.from('{"a":1}') }]);
    expect(() => readAquaChains(noRevisions)).toThrow('not an Aqua chain');
  });
});
