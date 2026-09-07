import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../validation/errors.js';

const URI_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const warnedMissingAssets = new Set();

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
 * - Traversal segments are resolved and clamped to the content root, which is the web root.
 * - Preserves external URIs unchanged.
 *
 * @param {string} assetPath - Raw asset path string
 * @param {string} [baseDir=''] - Directory of referencing file relative to content root
 * @returns {string} Normalized root-relative web path
 */
export function normalizeAssetPath(assetPath, baseDir = '') {
  if (typeof assetPath !== 'string' || !assetPath.trim()) return assetPath;
  if (isUri(assetPath)) return assetPath;

  const clean = assetPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');

  if (clean.startsWith('/')) {
    return path.posix.join('/', clean);
  }

  return path.posix.join('/', baseDir || '', clean);
}

/**
 * Resolves the absolute filesystem path for a content asset.
 * @param {string} assetPath - Root-relative web path (e.g. '/images/favicon.svg')
 * @param {string} contentDir - Absolute path to content/ root directory
 * @returns {string|null} Absolute filesystem path, or null if URI
 */
export function resolveAssetFsPath(assetPath, contentDir) {
  if (typeof assetPath !== 'string' || isUri(assetPath)) return null;

  const rel = normalizeAssetPath(assetPath).replace(/^\/+/, '');
  const resolved = path.resolve(contentDir, rel);

  // Never resolve outside the content root, even if the caller passed a raw path
  const root = path.resolve(contentDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }

  return resolved;
}

/**
 * Checks whether a local referenced asset physically exists inside contentDir.
 * - If isRequired is true and the file is missing: throws a ValidationError immediately.
 * - If isRequired is false and the file is missing: emits a deduplicated, non-blocking console warning.
 *
 * @param {string} normalizedPath - Root-relative asset path (e.g. '/images/avatar.svg')
 * @param {string} [contentDir] - Absolute path to content directory
 * @param {object} [options]
 * @param {boolean} [options.isRequired=false] - If true, throws ValidationError when missing
 * @param {boolean} [options.silent=false] - If true, suppresses console output
 * @returns {boolean} True if file exists or is URI/icon, false if missing (when not required)
 * @throws {ValidationError} If isRequired is true and file does not exist
 */
export function checkAssetExists(normalizedPath, contentDir, options = {}) {
  const { isRequired = false, silent = false } = options;

  if (!contentDir || typeof normalizedPath !== 'string') return true;
  if (isUri(normalizedPath) || isIconSlug(normalizedPath)) return true;

  const fsPath = resolveAssetFsPath(normalizedPath, contentDir);
  if (!fsPath) return true;

  const exists = fs.existsSync(fsPath);
  if (!exists) {
    const relDisplay = path.relative(process.cwd(), fsPath).replace(/\\/g, '/');

    if (isRequired) {
      throw new ValidationError(`Missing required asset on disk: ${relDisplay}`);
    }

    if (!silent) {
      if (!warnedMissingAssets.has(relDisplay)) {
        warnedMissingAssets.add(relDisplay);
        console.warn(`⚠️  [Warning] Referenced asset not found: ${relDisplay}`);
      }
    }
  }

  return exists;
}

/**
 * Resets the set of warned missing assets (useful for testing and rebuild cycles).
 */
export function resetMissingAssetWarnings() {
  warnedMissingAssets.clear();
}

/**
 * Normalizes an Asset, ThemedAsset, or Icon.
 * Handles strings, themed objects ({ light, dark }), arrays, and icon slugs.
 * Optionally validates physical file existence (non-blocking warning or strict ValidationError).
 *
 * @param {string|object|Array} asset - Asset definition
 * @param {object} [options]
 * @param {string} [options.baseDir=''] - Referencing directory relative to content root
 * @param {string} [options.contentDir] - Absolute path to content directory for existence checking
 * @param {boolean} [options.warnMissing=false] - Whether to check file existence and warn if missing
 * @param {boolean} [options.isRequired=false] - Whether to throw ValidationError if missing on disk
 * @param {boolean} [options.isIcon=false] - Whether this property can be a simple-icon slug
 * @returns {string|object|Array} Normalized asset
 */
export function normalizeAsset(asset, options = {}) {
  const { baseDir = '', contentDir, warnMissing = false, isRequired = false, isIcon = false } = options;

  if (!asset) return asset;

  if (typeof asset === 'string') {
    if (isIcon && isIconSlug(asset)) {
      return asset;
    }
    if (isUri(asset)) {
      return asset;
    }
    const normalized = normalizeAssetPath(asset, baseDir);
    if ((warnMissing || isRequired) && contentDir) {
      checkAssetExists(normalized, contentDir, options);
    }
    return normalized;
  }

  if (Array.isArray(asset)) {
    return asset.map((item) => normalizeAsset(item, options));
  }

  if (typeof asset === 'object') {
    if ('light' in asset || 'dark' in asset) {
      return {
        light: asset.light ? normalizeAsset(asset.light, { baseDir, contentDir, warnMissing, isRequired, isIcon }) : asset.light,
        dark: asset.dark ? normalizeAsset(asset.dark, { baseDir, contentDir, warnMissing, isRequired, isIcon }) : asset.dark
      };
    }
  }

  return asset;
}

/**
 * Infers a standard symbolic icon slug from a known destination URL.
 * @param {string} url - Target URL
 * @returns {string|null} Icon slug or null if unrecognized
 */
export function inferDomainIcon(url) {
  if (typeof url !== 'string') return null;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith('mailto:')) return 'mail';
  try {
    const parsed = new URL(lower);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'github.com') return 'github';
    if (host === 'linkedin.com') return 'linkedin';
    if (host === 'orcid.org') return 'orcid';
    if (host === 'twitter.com' || host === 'x.com') return 'x';
    if (host === 'mastodon.social' || host.includes('mastodon') || host === 'fosstodon.org') return 'mastodon';
  } catch {
    // ignore invalid URL
  }
  return null;
}

/**
 * Normalizes a list of Link objects (used for profile.social and collection item links).
 * Deduces domain icon if omitted, and normalizes icon asset paths.
 *
 * @param {Array<object>} links - Array of { label, url, icon? }
 * @param {object} [options]
 * @returns {Array<object>} Normalized links
 */
export function normalizeLinkList(links, options = {}) {
  if (!Array.isArray(links)) return [];
  return links.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const cloned = { ...entry };
    if (!cloned.icon && cloned.url) {
      const inferred = inferDomainIcon(cloned.url);
      if (inferred) cloned.icon = inferred;
    }
    if (cloned.icon) {
      cloned.icon = normalizeAsset(cloned.icon, { ...options, isIcon: true });
    }
    return cloned;
  });
}

