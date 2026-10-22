// A tiny ZIP writer for tests of code that reads Aqua artifact archives:
// enough of the format for src/main/aqua/zip-reader.js to walk, with stored
// and deflated entries, written the way the node's artifact bundler writes
// them. Not for production use.
const zlib = require('zlib');

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/**
 * @param {Array<{ name: string, data: Buffer, method?: 0|8, flags?: number, crc?: number }>} files
 * @param {{ comment?: string }} [options]
 */
function writeZip(files, { comment = '' } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, method = 8, flags = 0, crc } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const content = method === 8 ? zlib.deflateRawSync(data) : Buffer.from(data);
    const crc32 = crc ?? zlib.crc32(data);
    const header = Buffer.concat([
      u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0),
      u32(crc32), u32(content.length), u32(data.length), u16(nameBuf.length), u16(0), nameBuf,
    ]);
    locals.push(header, content);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0),
        u32(crc32), u32(content.length), u32(data.length), u16(nameBuf.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), nameBuf,
      ])
    );
    offset += header.length + content.length;
  }
  const central = Buffer.concat(centrals);
  const commentBuf = Buffer.from(comment, 'utf8');
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(commentBuf.length), commentBuf,
  ]);
  return Buffer.concat([...locals, central, eocd]);
}

/** An Aqua artifact ZIP holding the given chains (name → tree) plus a manifest. */
function writeAquaArtifact(chains) {
  const files = Object.entries(chains).map(([name, tree]) => ({
    name: name.endsWith('.aqua.json') ? name : `${name}.aqua.json`,
    data: Buffer.from(JSON.stringify(tree)),
  }));
  files.push({ name: 'aqua.json', data: Buffer.from(JSON.stringify({ type: 'aqua_multi_file', roots: [] })), method: 0 });
  return writeZip(files);
}

module.exports = { writeZip, writeAquaArtifact };
