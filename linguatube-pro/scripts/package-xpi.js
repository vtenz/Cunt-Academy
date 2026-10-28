#!/usr/bin/env node
/**
 * Packages BOTH:
 * 1. Zen Browser / Firefox WebExtension (`linguatube-pro.xpi`, `linguatube-pro-zen-firefox.xpi`, `linguatube-pro-zen-firefox.zip`)
 * 2. Google Chrome / Brave / Edge WebExtension (`linguatube-pro-chrome.zip`)
 * Uses pure Node.js Buffer/zlib with zero external dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(rootDir, currentDir = '') {
  const results = [];
  const fullDir = path.join(rootDir, currentDir);
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = path.posix.join(currentDir, entry.name);
    if (
      entry.name.endsWith('.xpi') ||
      entry.name.endsWith('.zip') ||
      entry.name === '.DS_Store' ||
      entry.name === 'scripts' ||
      entry.name === 'manifest.chrome.json'
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...collectFiles(rootDir, relPath));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * @param {Array<{archivePath: string, data: Buffer}>} entries
 */
function createZipFromEntries(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const item of entries) {
    const rawData = item.data;
    const compressed = zlib.deflateRawSync(rawData);
    const fileNameBuf = Buffer.from(item.archivePath, 'utf8');
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30 + fileNameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(fileNameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    fileNameBuf.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + fileNameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    fileNameBuf.copy(centralHeader, 46);

    localHeaders.push(localHeader, compressed);
    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

function makePngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePngBuffer(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const t = y / size;
        rawData[px] = Math.round(14 * (1 - t) + 2 * t);
        rawData[px + 1] = Math.round(165 * (1 - t) + 132 * t);
        rawData[px + 2] = Math.round(233 * (1 - t) + 199 * t);
        rawData[px + 3] = 255;
      } else {
        rawData[px] = 15;
        rawData[px + 1] = 23;
        rawData[px + 2] = 42;
        rawData[px + 3] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(rawData);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', iend)
  ]);
}

export function buildExtensionBuffers() {
  const extRoot = path.resolve(__dirname, '..');
  const commonRelFiles = collectFiles(extRoot);

  const iconSizes = [48, 96, 128];
  const virtualIcons = iconSizes
    .filter((size) => !commonRelFiles.includes(`icons/icon${size}.png`))
    .map((size) => ({
      archivePath: `icons/icon${size}.png`,
      data: generatePngBuffer(size),
    }));

  const zenEntries = [
    ...commonRelFiles
      .filter((rel) => rel !== 'background-sw.js')
      .map((rel) => ({
        archivePath: rel,
        data: fs.readFileSync(path.join(extRoot, rel)),
      })),
    ...virtualIcons,
  ];

  const zenBuffer = createZipFromEntries(zenEntries);

  const chromeEntries = [
    ...commonRelFiles.map((rel) => {
      if (rel === 'manifest.json') {
        return {
          archivePath: 'manifest.json',
          data: fs.readFileSync(path.join(extRoot, 'manifest.chrome.json')),
        };
      }
      return {
        archivePath: rel,
        data: fs.readFileSync(path.join(extRoot, rel)),
      };
    }),
    ...virtualIcons,
  ];

  const chromeBuffer = createZipFromEntries(chromeEntries);

  return { zenBuffer, chromeBuffer, zenCount: zenEntries.length, chromeCount: chromeEntries.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const extRoot = path.resolve(__dirname, '..');
  const distDir = path.resolve(extRoot, '..', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const { zenBuffer, chromeBuffer, zenCount, chromeCount } = buildExtensionBuffers();

  // Write packaged archives strictly into dist/ during `npm run build` (for Netlify deployment)
  fs.writeFileSync(path.join(distDir, 'linguatube-pro.xpi'), zenBuffer);
  fs.writeFileSync(path.join(distDir, 'linguatube-pro-zen-firefox.xpi'), zenBuffer);
  fs.writeFileSync(path.join(distDir, 'linguatube-pro-zen-firefox.zip'), zenBuffer);
  fs.writeFileSync(path.join(distDir, 'cunt-academy-zen-firefox.xpi'), zenBuffer);
  fs.writeFileSync(path.join(distDir, 'cunt-academy-zen-firefox.zip'), zenBuffer);
  fs.writeFileSync(path.join(distDir, 'linguatube-pro-chrome.zip'), chromeBuffer);
  fs.writeFileSync(path.join(distDir, 'cunt-academy-chrome.zip'), chromeBuffer);

  console.log(`✓ Zen/Firefox package built into dist/: cunt-academy-zen-firefox.xpi (${zenBuffer.length} bytes, ${zenCount} files)`);
  console.log(`✓ Chrome/Edge/Brave package built into dist/: cunt-academy-chrome.zip (${chromeBuffer.length} bytes, ${chromeCount} files)`);
}


