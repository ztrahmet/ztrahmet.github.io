import fs from 'node:fs';
import path from 'node:path';
import { resolveAssetFsPath } from './asset-normalizer.js';

/**
 * Cache of probed image dimensions keyed by absolute file path on disk.
 * @type {Map<string, { format: string, width: number, height: number } | null>}
 */
const probeCache = new Map();

/**
 * Calculates greatest common divisor (Euclidean algorithm).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gcd(a, b) {
  let x = Math.round(Math.abs(a));
  let y = Math.round(Math.abs(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Formats width and height into a standardized CSS aspect-ratio string (e.g. "16 / 10", "16 / 9", "1 / 1").
 * @param {number} width
 * @param {number} height
 * @returns {string} CSS aspect ratio string
 */
export function formatAspectRatio(width, height) {
  if (!width || !height || width <= 0 || height <= 0) return '16 / 10';

  if (Number.isInteger(width) && Number.isInteger(height)) {
    const divisor = gcd(width, height);
    return `${width / divisor} / ${height / divisor}`;
  }

  const ratio = width / height;
  return `${Number(ratio.toFixed(4))} / 1`;
}

/**
 * Calculates standardized image dimension metadata and presentation helpers.
 * Preserves intrinsic width, height, and natural aspect ratio for engine purity,
 * while providing `isVertical`, `clampedAspectRatio`, and `clampedRatio` so themes
 * can cleanly enforce non-vertical display without hardcoded limitations.
 *
 * @param {number} width - Intrinsic image width in pixels
 * @param {number} height - Intrinsic image height in pixels
 * @returns {{
 *   width: number,
 *   height: number,
 *   aspectRatio: string,
 *   ratio: number,
 *   isVertical: boolean,
 *   clampedWidth: number,
 *   clampedHeight: number,
 *   clampedAspectRatio: string,
 *   clampedRatio: number,
 *   isClamped: boolean,
 *   originalWidth: number,
 *   originalHeight: number
 * }}
 */
export function clampDimensions(width, height) {
  const isVertical = width < height;
  const ratio = width / height;
  const aspectRatio = formatAspectRatio(width, height);
  const clampedWidth = width;
  const clampedHeight = isVertical ? width : height;
  const clampedAspectRatio = isVertical ? '1 / 1' : aspectRatio;
  const clampedRatio = isVertical ? 1 : ratio;

  return {
    width,
    height,
    aspectRatio,
    ratio,
    isVertical,
    clampedWidth,
    clampedHeight,
    clampedAspectRatio,
    clampedRatio,
    isClamped: isVertical,
    originalWidth: width,
    originalHeight: height
  };
}

/**
 * Probes the intrinsic format and dimensions of an image binary buffer.
 * Supports PNG, JPEG, WebP (lossy, lossless, extended), GIF, SVG, and AVIF.
 *
 * @param {Buffer} buf - Image data buffer
 * @returns {{ format: string, width: number, height: number } | null} Probed dimensions or null if unrecognized
 */
export function probeImageBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 10) return null;

  // 1. PNG (8-byte signature + 16-byte IHDR chunk)
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    if (buf.toString('ascii', 12, 16) === 'IHDR') {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) {
        return { format: 'png', width, height };
      }
    }
  }

  // 2. GIF (GIF87a or GIF89a)
  if (
    buf.length >= 10 &&
    (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    if (width > 0 && height > 0) {
      return { format: 'gif', width, height };
    }
  }

  // 3. WebP (RIFF....WEBP)
  if (
    buf.length >= 25 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunkType = buf.toString('ascii', 12, 16);
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) {
          return { format: 'webp', width, height };
        }
      }
    } else if (chunkType === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) {
        return { format: 'webp', width, height };
      }
    } else if (chunkType === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (width > 0 && height > 0) {
        return { format: 'webp', width, height };
      }
    }
  }

  // 4. JPEG (SOI 0xFF 0xD8)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 1) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < buf.length && buf[offset] === 0xff) {
        offset++;
      }
      if (offset >= buf.length) break;
      const marker = buf[offset++];

      // Standalone markers without payload
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }

      if (offset + 2 > buf.length) break;
      const length = buf.readUInt16BE(offset);
      if (length < 2) break;

      // Start of Frame markers (SOF0..SOF15 except DHT/0xC4, JPG/0xC8, DAC/0xCC)
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + length <= buf.length) {
        const height = buf.readUInt16BE(offset + 3);
        const width = buf.readUInt16BE(offset + 5);
        if (width > 0 && height > 0) {
          return { format: 'jpeg', width, height };
        }
      }

      if (marker === 0xda) {
        // Start of Scan: headers have completed
        break;
      }

      offset += length;
    }
  }

  // 5. AVIF (ISOBMFF with ftyp and ispe box)
  if (buf.length >= 16 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const ispeIndex = buf.indexOf(Buffer.from('ispe'));
    if (ispeIndex >= 4 && ispeIndex + 16 <= buf.length) {
      const width = buf.readUInt32BE(ispeIndex + 8);
      const height = buf.readUInt32BE(ispeIndex + 12);
      if (width > 0 && height > 0) {
        return { format: 'avif', width, height };
      }
    }
  }

  // 6. SVG (XML text inspection)
  const text = buf.toString('utf8', 0, Math.min(buf.length, 4096)).trim();
  if (text.includes('<svg')) {
    const vbMatch = text.match(/viewBox\s*=\s*["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)\s*["']/i);
    if (vbMatch) {
      const width = parseFloat(vbMatch[3]);
      const height = parseFloat(vbMatch[4]);
      if (width > 0 && height > 0) {
        return { format: 'svg', width, height };
      }
    }
    const wMatch = text.match(/\bwidth\s*=\s*["']\s*([\d.-]+)(?:px)?\s*["']/i);
    const hMatch = text.match(/\bheight\s*=\s*["']\s*([\d.-]+)(?:px)?\s*["']/i);
    if (wMatch && hMatch) {
      const width = parseFloat(wMatch[1]);
      const height = parseFloat(hMatch[1]);
      if (width > 0 && height > 0) {
        return { format: 'svg', width, height };
      }
    }
  }

  return null;
}

/**
 * Probes the intrinsic format and dimensions of an image file on disk.
 * Reads only the first chunk (up to 64KB) to eliminate disk I/O and memory overhead.
 * Caches results in memory for the build lifetime.
 *
 * @param {string} filePath - Absolute path to image file on disk
 * @returns {{ format: string, width: number, height: number } | null} Probed dimensions or null
 */
export function probeImageFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  if (!fs.existsSync(filePath)) return null;

  if (probeCache.has(filePath)) {
    return probeCache.get(filePath);
  }

  let fd = null;
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      probeCache.set(filePath, null);
      return null;
    }

    const bufferSize = Math.min(stats.size, 65536);
    if (bufferSize < 4) {
      probeCache.set(filePath, null);
      return null;
    }

    const buffer = Buffer.alloc(bufferSize);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, bufferSize, 0);

    const probed = probeImageBuffer(buffer);
    probeCache.set(filePath, probed);
    return probed;
  } catch {
    probeCache.set(filePath, null);
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * Resets the image probe dimension cache.
 */
export function resetImageProbeCache() {
  probeCache.clear();
}

/**
 * Helper to probe a single asset path or return null.
 * @param {string} assetPath - Asset path string
 * @param {string} contentDir - Absolute path to content directory
 * @returns {ReturnType<typeof clampDimensions> | null}
 */
function probeSingleAsset(assetPath, contentDir) {
  if (!assetPath || typeof assetPath !== 'string') return null;
  const fsPath = resolveAssetFsPath(assetPath, contentDir);
  if (!fsPath) return null;
  const probed = probeImageFile(fsPath);
  if (!probed || !probed.width || !probed.height) return null;
  return clampDimensions(probed.width, probed.height);
}

/**
 * Probes and calculates normalized dimension metadata for an entry cover image / thumbnail.
 * Supports string asset paths and themed objects ({ light, dark }).
 * Clamps vertical images to 1:1 so cover graphics never render vertically on screen.
 *
 * @param {string | { light?: string, dark?: string }} imageAsset - Asset path or themed object
 * @param {string} contentDir - Absolute path to content root
 * @returns {{
 *   width: number,
 *   height: number,
 *   aspectRatio: string,
 *   ratio: number,
 *   originalWidth: number,
 *   originalHeight: number,
 *   isVertical: boolean,
 *   isClamped: boolean,
 *   light?: ReturnType<typeof clampDimensions> | null,
 *   dark?: ReturnType<typeof clampDimensions> | null
 * } | null} Dimensions metadata or null if unresolvable
 */
export function probeCoverImageDimensions(imageAsset, contentDir) {
  if (!imageAsset || !contentDir) return null;

  if (typeof imageAsset === 'string') {
    return probeSingleAsset(imageAsset, contentDir);
  }

  if (typeof imageAsset === 'object' && !Array.isArray(imageAsset)) {
    const lightMeta = imageAsset.light ? probeSingleAsset(imageAsset.light, contentDir) : null;
    const darkMeta = imageAsset.dark ? probeSingleAsset(imageAsset.dark, contentDir) : null;

    const primary = lightMeta || darkMeta;
    if (!primary) return null;

    return {
      ...primary,
      light: lightMeta,
      dark: darkMeta
    };
  }

  return null;
}
