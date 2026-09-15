import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  probeImageBuffer,
  probeImageFile,
  probeCoverImageDimensions,
  resetImageProbeCache,
  formatAspectRatio,
  clampDimensions,
  gcd
} from '../pipeline/image-probe.js';

describe('Image Dimension Probe & Aspect Ratio Subsystem', () => {
  const contentDir = path.resolve(process.cwd(), 'content');

  beforeEach(() => {
    resetImageProbeCache();
  });

  describe('gcd and formatAspectRatio', () => {
    it('calculates greatest common divisor accurately', () => {
      expect(gcd(1200, 750)).toBe(150);
      expect(gcd(1920, 1080)).toBe(120);
      expect(gcd(800, 600)).toBe(200);
      expect(gcd(1000, 1000)).toBe(1000);
      expect(gcd(0, 50)).toBe(50);
    });

    it('formats aspect ratios using simplified fractions', () => {
      expect(formatAspectRatio(1200, 750)).toBe('8 / 5');
      expect(formatAspectRatio(1920, 1080)).toBe('16 / 9');
      expect(formatAspectRatio(800, 600)).toBe('4 / 3');
      expect(formatAspectRatio(1000, 1000)).toBe('1 / 1');
      expect(formatAspectRatio(600, 600)).toBe('1 / 1');
      expect(formatAspectRatio(0, 0)).toBe('16 / 10');
      expect(formatAspectRatio(null, 100)).toBe('16 / 10');
    });

    it('handles decimal dimensions gracefully', () => {
      expect(formatAspectRatio(120.5, 60.25)).toBe('2 / 1');
    });
  });

  describe('clampDimensions (Vertical image restriction to 1:1)', () => {
    it('preserves landscape ratios without clamping', () => {
      const result = clampDimensions(1200, 750);
      expect(result.isVertical).toBe(false);
      expect(result.isClamped).toBe(false);
      expect(result.width).toBe(1200);
      expect(result.height).toBe(750);
      expect(result.aspectRatio).toBe('8 / 5');
      expect(result.ratio).toBe(1.6);
      expect(result.originalWidth).toBe(1200);
      expect(result.originalHeight).toBe(750);
    });

    it('preserves 1:1 square ratio without clamping', () => {
      const result = clampDimensions(800, 800);
      expect(result.isVertical).toBe(false);
      expect(result.isClamped).toBe(false);
      expect(result.width).toBe(800);
      expect(result.height).toBe(800);
      expect(result.aspectRatio).toBe('1 / 1');
      expect(result.ratio).toBe(1);
    });

    it('provides both natural and clamped aspect ratios for vertical images', () => {
      // 600x900 (natural ratio 2:3)
      const result = clampDimensions(600, 900);
      expect(result.isVertical).toBe(true);
      expect(result.isClamped).toBe(true);
      // Intrinsic dimensions preserved for engine purity
      expect(result.width).toBe(600);
      expect(result.height).toBe(900);
      expect(result.aspectRatio).toBe('2 / 3');
      expect(result.ratio).toBeCloseTo(600 / 900);
      // Presentation helpers for theme
      expect(result.clampedWidth).toBe(600);
      expect(result.clampedHeight).toBe(600);
      expect(result.clampedAspectRatio).toBe('1 / 1');
      expect(result.clampedRatio).toBe(1);
    });

    it('clamps extreme vertical images (e.g. 200x1000) helper to 1:1', () => {
      const result = clampDimensions(200, 1000);
      expect(result.isVertical).toBe(true);
      expect(result.isClamped).toBe(true);
      expect(result.width).toBe(200);
      expect(result.height).toBe(1000);
      expect(result.clampedAspectRatio).toBe('1 / 1');
      expect(result.clampedRatio).toBe(1);
    });
  });

  describe('probeImageBuffer formats', () => {
    it('probes PNG buffers', () => {
      const png = Buffer.alloc(24);
      png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      png.write('IHDR', 12);
      png.writeUInt32BE(1280, 16);
      png.writeUInt32BE(720, 20);

      const res = probeImageBuffer(png);
      expect(res).toEqual({ format: 'png', width: 1280, height: 720 });
    });

    it('probes GIF buffers (GIF87a and GIF89a)', () => {
      const gif = Buffer.alloc(10);
      gif.write('GIF89a', 0);
      gif.writeUInt16LE(640, 6);
      gif.writeUInt16LE(480, 8);

      const res = probeImageBuffer(gif);
      expect(res).toEqual({ format: 'gif', width: 640, height: 480 });
    });

    it('probes JPEG buffers (SOF0 baseline and SOF2 progressive)', () => {
      // SOF0
      const jpeg = Buffer.alloc(32);
      jpeg[0] = 0xff; jpeg[1] = 0xd8; // SOI
      jpeg[2] = 0xff; jpeg[3] = 0xe0; // APP0
      jpeg.writeUInt16BE(4, 4); // length
      jpeg[6] = 0x00; jpeg[7] = 0x00;
      jpeg[8] = 0xff; jpeg[9] = 0xc0; // SOF0
      jpeg.writeUInt16BE(17, 10); // length
      jpeg[12] = 8; // precision
      jpeg.writeUInt16BE(1080, 13); // height
      jpeg.writeUInt16BE(1920, 15); // width

      const res = probeImageBuffer(jpeg);
      expect(res).toEqual({ format: 'jpeg', width: 1920, height: 1080 });
    });

    it('probes WebP VP8 lossy buffers', () => {
      const webp = Buffer.alloc(30);
      webp.write('RIFF', 0);
      webp.writeUInt32LE(100, 4);
      webp.write('WEBP', 8);
      webp.write('VP8 ', 12);
      webp[23] = 0x9d; webp[24] = 0x01; webp[25] = 0x2a; // keyframe marker
      webp.writeUInt16LE(800, 26);
      webp.writeUInt16LE(600, 28);

      const res = probeImageBuffer(webp);
      expect(res).toEqual({ format: 'webp', width: 800, height: 600 });
    });

    it('probes WebP VP8L lossless buffers', () => {
      const webp = Buffer.alloc(30);
      webp.write('RIFF', 0);
      webp.writeUInt32LE(100, 4);
      webp.write('WEBP', 8);
      webp.write('VP8L', 12);
      webp[20] = 0x2f; // signature

      // width = 500, height = 300
      const wMinus1 = 500 - 1; // 499 = 0x01F3
      const hMinus1 = 300 - 1; // 299 = 0x012B
      webp[21] = wMinus1 & 0xff;
      webp[22] = ((wMinus1 >> 8) & 0x3f) | ((hMinus1 & 0x03) << 6);
      webp[23] = (hMinus1 >> 2) & 0xff;
      webp[24] = (hMinus1 >> 10) & 0x0f;

      const res = probeImageBuffer(webp);
      expect(res).toEqual({ format: 'webp', width: 500, height: 300 });
    });

    it('probes WebP VP8X extended buffers', () => {
      const webp = Buffer.alloc(32);
      webp.write('RIFF', 0);
      webp.writeUInt32LE(100, 4);
      webp.write('WEBP', 8);
      webp.write('VP8X', 12);
      // Canvas width - 1 = 1600 - 1 = 1599
      const wMinus1 = 1599;
      webp[24] = wMinus1 & 0xff;
      webp[25] = (wMinus1 >> 8) & 0xff;
      webp[26] = (wMinus1 >> 16) & 0xff;
      // Canvas height - 1 = 900 - 1 = 899
      const hMinus1 = 899;
      webp[27] = hMinus1 & 0xff;
      webp[28] = (hMinus1 >> 8) & 0xff;
      webp[29] = (hMinus1 >> 16) & 0xff;

      const res = probeImageBuffer(webp);
      expect(res).toEqual({ format: 'webp', width: 1600, height: 900 });
    });

    it('probes SVG text buffers with viewBox', () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900"></svg>');
      const res = probeImageBuffer(svg);
      expect(res).toEqual({ format: 'svg', width: 1440, height: 900 });
    });

    it('probes SVG text buffers with width and height attributes', () => {
      const svg = Buffer.from('<svg width="800px" height="600px"></svg>');
      const res = probeImageBuffer(svg);
      expect(res).toEqual({ format: 'svg', width: 800, height: 600 });
    });

    it('returns null for unparseable or unknown buffers', () => {
      expect(probeImageBuffer(null)).toBeNull();
      expect(probeImageBuffer(Buffer.from('hello world'))).toBeNull();
      expect(probeImageBuffer(Buffer.alloc(8))).toBeNull();
    });
  });

  describe('probeImageFile & probeCoverImageDimensions on real files', () => {
    it('probes real PNG assets on disk and returns clamped dimension metadata', () => {
      const result = probeCoverImageDimensions('/images/blogs/ssg-cover.png', contentDir);
      expect(result).toBeDefined();
      expect(result.width).toBe(1200);
      expect(result.height).toBe(750);
      expect(result.aspectRatio).toBe('8 / 5');
      expect(result.ratio).toBe(1.6);
      expect(result.isVertical).toBe(false);
      expect(result.isClamped).toBe(false);
    });

    it('probes themed asset objects with light and dark variants', () => {
      const themedAsset = {
        light: '/images/projects/engine-light.png',
        dark: '/images/projects/engine-dark.png'
      };

      const result = probeCoverImageDimensions(themedAsset, contentDir);
      expect(result).toBeDefined();
      expect(result.width).toBe(1200);
      expect(result.height).toBe(750);
      expect(result.aspectRatio).toBe('8 / 5');
      expect(result.light).toBeDefined();
      expect(result.light.width).toBe(1200);
      expect(result.dark).toBeDefined();
      expect(result.dark.width).toBe(1200);
    });

    it('returns null for external URIs without error', () => {
      expect(probeCoverImageDimensions('https://example.com/cover.png', contentDir)).toBeNull();
    });

    it('returns null for missing or invalid files gracefully', () => {
      expect(probeCoverImageDimensions('/images/non-existent.png', contentDir)).toBeNull();
      expect(probeCoverImageDimensions(null, contentDir)).toBeNull();
      expect(probeCoverImageDimensions(undefined, contentDir)).toBeNull();
    });

    it('caches probed files in memory across calls', () => {
      const file = path.join(contentDir, 'images/blogs/ssg-cover.png');
      const first = probeImageFile(file);
      const second = probeImageFile(file);
      expect(first).toBe(second); // same object reference from cache
    });
  });

  describe('probeCoverImageDimensions with a synthetic vertical image', () => {
    it('clamps an actual vertical image file to 1:1 square ratio', () => {
      // Create a temporary 600x1200 vertical PNG in content/images/scratch_vertical.png
      const tmpFile = path.join(contentDir, 'images', 'test_vertical_cover.png');
      const png = Buffer.alloc(24);
      png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      png.write('IHDR', 12);
      png.writeUInt32BE(600, 16);  // width 600
      png.writeUInt32BE(1200, 20); // height 1200 (vertical!)
      fs.writeFileSync(tmpFile, png);

      try {
        const result = probeCoverImageDimensions('/images/test_vertical_cover.png', contentDir);
        expect(result).toBeDefined();
        expect(result.isVertical).toBe(true);
        expect(result.isClamped).toBe(true);
        expect(result.width).toBe(600);
        expect(result.height).toBe(1200);
        expect(result.aspectRatio).toBe('1 / 2');
        expect(result.clampedWidth).toBe(600);
        expect(result.clampedHeight).toBe(600);
        expect(result.clampedAspectRatio).toBe('1 / 1');
        expect(result.clampedRatio).toBe(1);
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    });
  });
});
