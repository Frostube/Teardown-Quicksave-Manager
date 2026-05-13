const zlib = require("zlib");

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value;
  }
  crcTable = table;
  return table;
}

function crc32(buffer) {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    value = table[(value ^ buffer[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
}

function dosDate(date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function buildZip(entries) {
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);
  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  entries.forEach(([rawName, data]) => {
    const name = String(rawName).replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(SIG_LOCAL, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(FLAG_UTF8, 6);
    localHeader.writeUInt16LE(METHOD_STORE, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    chunks.push(localHeader, nameBuffer, data);
    centralRecords.push({ name: nameBuffer, crc, size: data.length, offset });
    offset += 30 + nameBuffer.length + data.length;
  });

  const centralStart = offset;
  centralRecords.forEach((record) => {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_STORE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(record.crc, 16);
    central.writeUInt32LE(record.size, 20);
    central.writeUInt32LE(record.size, 24);
    central.writeUInt16LE(record.name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(record.offset, 42);
    chunks.push(central, record.name);
    offset += 46 + record.name.length;
  });

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralRecords.length, 8);
  eocd.writeUInt16LE(centralRecords.length, 10);
  eocd.writeUInt32LE(offset - centralStart, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readZip(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("readZip expects a Buffer");
  const eocdPos = findEocd(buffer);
  if (eocdPos < 0) throw new Error("Not a ZIP file (end-of-central-directory marker missing).");
  const entryCount = buffer.readUInt16LE(eocdPos + 10);
  const centralOffset = buffer.readUInt32LE(eocdPos + 16);

  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== SIG_CENTRAL) {
      throw new Error("ZIP central directory entry has invalid signature.");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLen).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new Error(`ZIP local header for ${name} has invalid signature.`);
    }
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    let data;
    if (method === METHOD_STORE) {
      data = compressed;
    } else if (method === METHOD_DEFLATE) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`ZIP entry ${name} uses unsupported compression method ${method}.`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`ZIP entry ${name} size mismatch (${data.length} vs ${uncompressedSize}).`);
    }
    if (crc32(data) !== crc) {
      throw new Error(`ZIP entry ${name} failed CRC check.`);
    }

    entries.push({ name, data });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

module.exports = { buildZip, readZip, crc32 };
