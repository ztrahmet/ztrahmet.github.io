import path from 'node:path';

const URI_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Checks if a string is a valid URI scheme (e.g. https://, mailto:, doi:).
 * @param {any} str
 * @returns {boolean} True if string is a valid URI
 */
export function isUri(str) {
  if (typeof str !== 'string') return false;
  return URI_REGEX.test(str);
}

/**
 * Checks if a value is a simple-icon slug (e.g. "gmail", "github", "linkedin").
 * @param {any} val
 * @returns {boolean} True if value is an icon identifier slug
 */
export function isIconSlug(val) {
  if (typeof val !== 'string') return false;
  if (isUri(val)) return false;
  if (val.startsWith('/') || val.startsWith('.')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(val);
}

/**
 * Normalizes an asset path into a standardized root-relative web path.
 * - Root-relative paths (/images/...) remain root-relative.
 * - Co-located relative paths (./cover.png or cover.png) resolve relative to baseDir.
 * - Preserves external URIs unchanged.
 *
 * @param {string} assetPath - Raw asset path string
 * @param {string} [baseDir=''] - Directory of referencing file relative to content root
 * @returns {string} Normalized root-relative web path
 */
export function normalizeAssetPath(assetPath, baseDir = '') {
  if (typeof assetPath !== 'string' || !assetPath.trim()) return assetPath;
  if (isUri(assetPath)) return assetPath;

  let clean = assetPath.trim().replace(/\\/g, '/');

  if (clean.startsWith('/')) {
    return clean;
  }

  clean = clean.replace(/^\.\//, '');
  return baseDir ? path.posix.join('/', baseDir, clean) : `/${clean}`;
}

/**
 * Resolves the absolute filesystem path for a content asset.
 * @param {string} assetPath - Root-relative web path (e.g. '/images/favicon.svg')
 * @param {string} contentDir - Absolute path to content/ root directory
 * @returns {string|null} Absolute filesystem path, or null if URI
 */
export function resolveAssetFsPath(assetPath, contentDir) {
  if (typeof assetPath !== 'string' || isUri(assetPath)) return null;
  const rel = assetPath.replace(/^\/+/, '');
  return path.resolve(contentDir, rel);
}

/**
 * Normalizes an Asset, ThemedAsset, or Icon.
 * Handles strings, themed objects ({ light, dark }), arrays, and icon slugs.
 *
 * @param {string|object|Array} asset - Asset definition
 * @param {object} [options]
 * @param {string} [options.baseDir=''] - Referencing directory relative to content root
 * @param {boolean} [options.isIcon=false] - Whether this property can be a simple-icon slug
 * @returns {string|object|Array} Normalized asset
 */
export function normalizeAsset(asset, options = {}) {
  const { baseDir = '', isIcon = false } = options;

  if (!asset) return asset;

  if (typeof asset === 'string') {
    if (isIcon && isIconSlug(asset)) {
      return asset;
    }
    if (isUri(asset)) {
      return asset;
    }
    return normalizeAssetPath(asset, baseDir);
  }

  if (Array.isArray(asset)) {
    return asset.map((item) => normalizeAsset(item, options));
  }

  if (typeof asset === 'object') {
    if ('light' in asset || 'dark' in asset) {
      return {
        light: asset.light ? normalizeAsset(asset.light, { baseDir, isIcon }) : asset.light,
        dark: asset.dark ? normalizeAsset(asset.dark, { baseDir, isIcon }) : asset.dark
      };
    }
  }

  return asset;
}
