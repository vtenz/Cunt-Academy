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

  // Helper for signed distance to a rounded box centered at (cx, cy) with half-size (hx, hy) and corner radius r
  function sdRoundBox(px, py, cx, cy, hx, hy, r) {
    const qx = Math.abs(px - cx) - hx + r;
    const qy = Math.abs(py - cy) - hy + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }

  // Point in triangle helper
  function inTriangle(px, py, x1, y1, x2, y2, x3, y3) {
    const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
    const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
    const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0;
    const ny = y / size; // normalized 0..1

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const nx = x / size; // normalized 0..1

      // 1. Outer rounded app icon shell
      const dOuter = sdRoundBox(nx, ny, 0.5, 0.5, 0.46, 0.46, 0.2);
      if (dOuter > 0.01) {
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
        continue;
      }

      // Base obsidian-indigo-violet gradient
      let r = Math.round(18 * (1 - ny) + 12 * ny);
      let g = Math.round(22 * (1 - ny) + 28 * ny);
      let b = Math.round(42 * (1 - ny) + 52 * ny);

      // Glowing outer border ring (violet -> emerald)
      if (dOuter > -0.045) {
        r = Math.round(139 * (1 - nx) + 16 * nx);
        g = Math.round(92 * (1 - nx) + 185 * nx);
        b = Math.round(246 * (1 - nx) + 129 * nx);
      }

      // 2. Central Leitner Card stage (nx: 0.18..0.82, ny: 0.20..0.68)
      const dCard = sdRoundBox(nx, ny, 0.5, 0.44, 0.32, 0.23, 0.08);
      if (dCard <= 0) {
        if (dCard > -0.028) {
          // Card border (violet-cyan)
          r = Math.round(124 * (1 - nx) + 52 * nx);
          g = Math.round(92 * (1 - nx) + 211 * nx);
          b = Math.round(252 * (1 - nx) + 153 * nx);
        } else {
          r = 15;
          g = 19;
          b = 34;
        }
      }

      // 3. Central Emerald-Cyan Play Triangle inside the Card
      if (inTriangle(nx, ny, 0.41, 0.31, 0.41, 0.57, 0.64, 0.44)) {
        const t = (ny - 0.31) / 0.26;
        r = Math.round(52 * (1 - t) + 14 * t);
        g = Math.round(211 * (1 - t) + 165 * t);
        b = Math.round(153 * (1 - t) + 233 * t);
      }

      // 4. Dual-Subtitle Bars at Bottom (White EN bar + Gold FA bar)
      const dSubEn = sdRoundBox(nx, ny, 0.5, 0.77, 0.28, 0.025, 0.012);
      if (dSubEn <= 0) {
        r = 248;
        g = 250;
        b = 252;
      }
      const dSubFa = sdRoundBox(nx, ny, 0.5, 0.855, 0.2, 0.024, 0.012);
      if (dSubFa <= 0) {
        r = 253;
        g = 224;
        b = 71;
      }

      // 5. Top Gold AI Sparkle Diamond
      const dxStar = Math.abs(nx - 0.5);
      const dyStar = Math.abs(ny - 0.125);
      if (dxStar + dyStar <= 0.055) {
        r = 253;
        g = 224;
        b = 71;
      }

      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
      rawData[px + 3] = 255;
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


