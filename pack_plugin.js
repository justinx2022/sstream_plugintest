const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Cross-platform pure Node.js ZIP archive generator (Zero external dependencies)
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function computeCrc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createZipArchive(files, outputPath) {
  const parts = [];
  const centralDirectory = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const data = fs.readFileSync(file.path);
    const compressed = zlib.deflateRawSync(data);
    const crc = computeCrc32(data);

    // Local file header (30 bytes + filename + data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method: Deflate (8)
    localHeader.writeUInt16LE(0, 10);         // Last mod file time
    localHeader.writeUInt16LE(0, 12);         // Last mod file date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(data.length, 22);       // Uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26);// Filename length
    localHeader.writeUInt16LE(0, 28);                 // Extra field length

    parts.push(localHeader, filenameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cdHeader.writeUInt16LE(20, 4);          // Version made by
    cdHeader.writeUInt16LE(20, 6);          // Version needed
    cdHeader.writeUInt16LE(0, 8);           // General purpose bit flag
    cdHeader.writeUInt16LE(8, 10);          // Compression method: Deflate
    cdHeader.writeUInt16LE(0, 12);          // Last mod file time
    cdHeader.writeUInt16LE(0, 14);          // Last mod file date
    cdHeader.writeUInt32LE(crc, 16);        // CRC-32
    cdHeader.writeUInt32LE(compressed.length, 20); // Compressed size
    cdHeader.writeUInt32LE(data.length, 24);       // Uncompressed size
    cdHeader.writeUInt16LE(filenameBuf.length, 28);// Filename length
    cdHeader.writeUInt16LE(0, 30);          // Extra field length
    cdHeader.writeUInt16LE(0, 32);          // Comment length
    cdHeader.writeUInt16LE(0, 34);          // Disk number start
    cdHeader.writeUInt16LE(0, 36);          // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);          // External file attributes
    cdHeader.writeUInt32LE(offset, 42);     // Relative offset of local header

    centralDirectory.push(cdHeader, filenameBuf);
    offset += localHeader.length + filenameBuf.length + compressed.length;
  }

  const cdBuffer = Buffer.concat(centralDirectory);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(files.length, 8); // Total records on disk
  eocd.writeUInt16LE(files.length, 10);// Total records
  eocd.writeUInt32LE(cdBuffer.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16);    // Offset of central directory
  eocd.writeUInt16LE(0, 20);         // Comment length

  const fullZip = Buffer.concat([...parts, cdBuffer, eocd]);
  fs.writeFileSync(outputPath, fullZip);
}

const repoDir = __dirname;
const distDir = path.join(repoDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const plugins = [
  { dir: 'catalogue', bundle: 'dev.justin.catalogue' },
  { dir: 'yoturkish', bundle: 'dev.justin.yoturkish' },
  { dir: 'wlext', bundle: 'dev.justin.wlext_v5' },
];

for (const { dir, bundle } of plugins) {
  const pluginDir = path.join(repoDir, 'src', dir);
  const outSky = path.join(distDir, `${bundle}.sky`);

  if (fs.existsSync(outSky)) fs.unlinkSync(outSky);

  console.log(`Packaging ${bundle}...`);
  createZipArchive(
    [
      { name: 'plugin.js', path: path.join(pluginDir, 'plugin.js') },
      { name: 'plugin.json', path: path.join(pluginDir, 'plugin.json') }
    ],
    outSky
  );

  console.log(`Generated: ${outSky} (${fs.statSync(outSky).size} bytes)`);
}

console.log('All plugins packaged successfully via cross-platform Node.js.');
