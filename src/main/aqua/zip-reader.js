/**
 * Minimal ZIP reader for Aqua artifact downloads.
 *
 * The Aqua node serves a tree only as a portable artifact ZIP
 * (`GET /node/trees/{tip}/download`): one `<name>.aqua.json` chain per tree,
 * the raw file assets they reference, and an `aqua.json` manifest. Every
 * entry is written by one known writer as either stored (method 0) or
 * deflated (method 8), so the central-directory walk below is all that is
 * needed to read it back, and `zlib` already ships with Node. Anything else
 * (ZIP64, encryption, other compression methods) is refused rather than
 * guessed at.
 */
const zlib = require('zlib');

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const EOCD_MIN_LEN = 22;
const CENTRAL_MIN_LEN = 46;
const LOCAL_MIN_LEN = 30;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x0001;
// A ZIP64 archive writes this sentinel where a 32-bit size will not fit.
const ZIP64_SENTINEL = 0xffffffff;
// An entry larger than this is not an Aqua artifact; refuse before inflating.
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

function findEndOfCentralDirectory(buf) {
  // The comment that follows the record is at most 65535 bytes.
  const floor = Math.max(0, buf.length - EOCD_MIN_LEN - 0xffff);
  for (let i = buf.length - EOCD_MIN_LEN; i >= floor; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * Read every entry of a ZIP archive.
 *
 * @param {Buffer} buf
 * @returns {Array<{ name: string, data: Buffer }>}
 */
function readZipEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < EOCD_MIN_LEN) {
    throw new Error('Not a ZIP archive');
  }
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error('Not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  let offset = buf.readUInt32LE(eocd + 16);
  if (count === ZIP64_SENTINEL >>> 16 || offset === ZIP64_SENTINEL || centralSize === ZIP64_SENTINEL) {
    throw new Error('ZIP64 archives are not supported');
  }
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + CENTRAL_MIN_LEN > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new Error('Corrupt ZIP central directory');
    }
    const flags = buf.readUInt16LE(offset + 8);
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');

    if (flags & FLAG_ENCRYPTED) throw new Error(`Encrypted ZIP entry: ${name}`);
    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL) {
      throw new Error('ZIP64 archives are not supported');
    }
    if (uncompressedSize > MAX_ENTRY_BYTES || compressedSize > MAX_ENTRY_BYTES) {
      throw new Error(`ZIP entry too large: ${name}`);
    }
    if (localOffset + LOCAL_MIN_LEN > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new Error(`Corrupt ZIP local header: ${name}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + LOCAL_MIN_LEN + localNameLen + localExtraLen;
    const end = start + compressedSize;
    if (end > buf.length) throw new Error(`Truncated ZIP entry: ${name}`);
    const raw = buf.subarray(start, end);

    let data;
    if (method === METHOD_STORED) {
      data = Buffer.from(raw);
    } else if (method === METHOD_DEFLATE) {
      data = zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
    } else {
      throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    }
    if (data.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch: ${name}`);
    }
    entries.push({ name, data });
    offset += CENTRAL_MIN_LEN + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * The Aqua chains inside an artifact ZIP, parsed, keyed by entry name.
 * The `aqua.json` manifest is not a chain and is left out.
 *
 * @param {Buffer} buf
 * @returns {Array<{ name: string, tree: object }>}
 */
function readAquaChains(buf) {
  return readZipEntries(buf)
    .filter((entry) => entry.name.endsWith('.aqua.json'))
    .map((entry) => {
      let tree;
      try {
        tree = JSON.parse(entry.data.toString('utf8'));
      } catch (err) {
        throw new Error(`ZIP entry is not an Aqua chain: ${entry.name}`, { cause: err });
      }
      if (!tree || typeof tree !== 'object' || typeof tree.revisions !== 'object') {
        throw new Error(`ZIP entry is not an Aqua chain: ${entry.name}`);
      }
      return { name: entry.name, tree };
    });
}

module.exports = { readZipEntries, readAquaChains };
