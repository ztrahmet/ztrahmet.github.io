import fs from 'node:fs';
import path from 'node:path';
import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getLanguageLevelLabel,
  getCollectionLabel
} from '../config/mappings.js';
import {
  formatDate,
  formatDateRange,
  toIsoDate,
  toRfc822Date,
  computeDuration,
  slugify
} from '../config/format.js';
import { renderMarkdown, renderMarkdownInline } from '../pipeline/markdown-renderer.js';
import { resolveAbsoluteUrl } from '../pipeline/seo-normalizer.js';
import { sortByRecency, sortByDate } from '../pipeline/ordering.js';
import { resolveAssetFsPath } from '../pipeline/asset-normalizer.js';
import { stripMarkdownAndHtml } from '../search/text-sanitizer.js';

export { formatDate, formatDateRange, toIsoDate, toRfc822Date, slugify };

/** Already absolute, or a scheme the resolver must not touch. */
const RESOLVED_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Rewrites src, href and poster attributes to absolute URLs.
 * Feeds and syndicated content need absolute links to resolve off-site.
 *
 * Root-relative paths resolve against the site, and document-relative ones such as
 * `./cover.png` against the page that contains them, which is the only way an
 * entry's own assets survive syndication.
 *
 * @param {string} html - Rendered HTML
 * @param {string} siteUrl - Site base URL
 * @param {string} [pagePath='/'] - Path of the page the HTML belongs to
 * @returns {string} HTML with absolute URLs
 */
export function absolutizeUrls(html, siteUrl, pagePath = '/') {
  if (typeof html !== 'string' || !html || !siteUrl) return html || '';

  let pageBase;
  try {
    pageBase = new URL(String(pagePath || '/'), `${String(siteUrl).replace(/\/+$/, '')}/`);
  } catch {
    return html;
  }

  // Markdown renders double quotes, but authors may hand-write single quoted HTML
  return html.replace(/\b(src|href|poster)=(["'])([^"']*)\2/gi, (match, attr, quote, value) => {
    const ref = value.trim();
    if (!ref || RESOLVED_REFERENCE.test(ref)) return match;
    try {
      return `${attr}=${quote}${new URL(ref, pageBase).href}${quote}`;
    } catch {
      return match;
    }
  });
}

const inlinedSvgCache = new Map();
let svgUid = 0;

/**
 * Completely isolates an inlined SVG so its IDs, gradients, and <style> CSS rules
 * can never leak into or collide with other SVGs or the host document.
 *
 * @param {string} markup - Raw SVG markup
 * @param {string} token - Unique prefix token for this SVG instance
 * @returns {string} Isolated SVG markup
 */
export function isolateSvgMarkup(markup, token) {
  if (!markup || typeof markup !== 'string') return markup || '';

  let out = markup;

  // 1. Ensure root <svg> has a unique id or scoped identifier
  let rootId = token;
  const rootSvgMatch = out.match(/^<svg\b([^>]*)>/i);
  if (rootSvgMatch) {
    const attrs = rootSvgMatch[1];
    const existingIdMatch = attrs.match(/\sid=(["'])(.*?)\1/i);
    if (existingIdMatch) {
      rootId = `${token}_${existingIdMatch[2]}`;
      out = out.replace(/^<svg\b([^>]*)\sid=(["'])(.*?)\2/i, `<svg$1 id="${rootId}"`);
    } else {
      out = out.replace(/^<svg\b/i, `<svg id="${rootId}"`);
    }
  }

  // 2. Namespace all IDs defined in the SVG (excluding rootId)
  const ids = [...out.matchAll(/\sid=(["'])(.*?)\1/g)]
    .map((m) => m[2])
    .filter((id) => id !== rootId);

  for (const id of new Set(ids)) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const renamed = `${token}-${id}`;
    out = out
      .replace(new RegExp(`\\sid=(["'])${escaped}\\1`, 'g'), ` id="${renamed}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${renamed})`)
      .replace(new RegExp(`((?:xlink:)?href)=(["'])#${escaped}\\2`, 'g'), `$1="#${renamed}"`);
  }

  // 3. Namespace and scope all classes defined in <style> blocks
  const styleBlocks = [...out.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  const classNames = new Set();
  for (const match of styleBlocks) {
    const css = match[1];
    const classes = [...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    for (const c of classes) classNames.add(c);
  }

  if (classNames.size > 0) {
    out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, css, close) => {
      let scopedCss = css;
      for (const c of classNames) {
        scopedCss = scopedCss.replace(new RegExp(`\\.${c}(?=[^a-zA-Z0-9_-]|$)`, 'g'), `.${token}-${c}`);
      }
      scopedCss = scopedCss.replace(/([^{}]+)\{/g, (ruleMatch, selector) => {
        const trimmed = selector.trim();
        if (trimmed.startsWith('@')) return ruleMatch;
        const scopedSelector = trimmed.split(',').map((part) => `#${rootId} ${part.trim()}`).join(', ');
        return `${scopedSelector} {`;
      });
      return `${open}${scopedCss}${close}`;
    });

    for (const c of classNames) {
      out = out.replace(/\sclass=(["'])(.*?)\1/gi, (match, quote, classes) => {
        const list = classes.split(/\s+/).map((cls) => (cls === c ? `${token}-${c}` : cls));
        return ` class=${quote}${list.join(' ')}${quote}`;
      });
    }
  }

  return out;
}

/**
 * Reads an SVG asset and returns its markup for inlining with unique style and ID isolation.
 *
 * An SVG referenced by `<img>` is a separate document, so `currentColor` inside
 * it never sees the page. Inlining is what lets an asset take the theme colour.
 * Scripts and event handlers are stripped, and internal classes and IDs are isolated
 * per instance so different logos never collide or bleed into each other.
 *
 * @param {string} assetPath - Root-relative asset path
 * @param {string} contentDir - Absolute path to content directory
 * @returns {string} SVG markup, or an empty string when not an inlinable SVG
 */
export function inlineSvg(assetPath, contentDir) {
  if (typeof assetPath !== 'string') return '';
  const cleanPath = assetPath.split(/[?#]/)[0];
  if (!cleanPath.toLowerCase().endsWith('.svg') || !contentDir) return '';

  const cacheKey = `${contentDir}::${cleanPath}`;
  let rawMarkup = inlinedSvgCache.get(cacheKey);

  if (rawMarkup === undefined) {
    const fsPath = resolveAssetFsPath(cleanPath, contentDir);
    if (fsPath && fs.existsSync(fsPath)) {
      rawMarkup = fs.readFileSync(fsPath, 'utf-8')
        .replace(/<\?xml[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .trim();
    } else {
      rawMarkup = '';
    }
    inlinedSvgCache.set(cacheKey, rawMarkup);
  }

  if (!rawMarkup) return '';

  svgUid += 1;
  return isolateSvgMarkup(rawMarkup, `svg_${svgUid}`);
}

/**
 * Clears the inlined SVG cache so a watch rebuild picks up edited files.
 */
export function resetInlinedSvgCache() {
  inlinedSvgCache.clear();
  svgUid = 0;
}

/**
 * Transforms SVG markup so all fills and strokes are overridden to `currentColor`,
 * making the graphic strictly symbolic and reactive to theme color modes.
 *
 * @param {string} markup - Raw or isolated SVG markup
 * @returns {string} Symbolic SVG markup
 */
export function makeSvgSymbolic(markup) {
  if (!markup || typeof markup !== 'string') return markup || '';

  let out = markup;

  // 1. In <style> blocks, override fill and stroke declarations to currentColor
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, css, close) => {
    const overridden = css
      .replace(/fill\s*:\s*(?!(?:none|currentColor)\b)[^;}\s]+/gi, 'fill: currentColor')
      .replace(/stroke\s*:\s*(?!(?:none|currentColor)\b)[^;}\s]+/gi, 'stroke: currentColor');
    return `${open}${overridden}${close}`;
  });

  // 2. On elements, override hardcoded inline style="fill:...; stroke:..."
  out = out.replace(/\sstyle=(["'])(.*?)\1/gi, (match, quote, styleContent) => {
    const updated = styleContent
      .replace(/fill\s*:\s*(?!(?:none|currentColor)\b)[^;]+/gi, 'fill: currentColor')
      .replace(/stroke\s*:\s*(?!(?:none|currentColor)\b)[^;]+/gi, 'stroke: currentColor');
    return ` style=${quote}${updated}${quote}`;
  });

  // 3. On elements, replace hardcoded fill="..." (except 'none' and 'currentColor')
  out = out.replace(/\sfill=(["'])(?!(?:none|currentColor)\b)(.*?)\1/gi, ' fill="currentColor"');

  // 4. On elements, replace hardcoded stroke="..." (except 'none' and 'currentColor')
  out = out.replace(/\sstroke=(["'])(?!(?:none|currentColor)\b)(.*?)\1/gi, ' stroke="currentColor"');

  // 5. If root <svg> has no fill attribute and isn't explicitly stroked-only, ensure fill="currentColor"
  if (!/<svg\b[^>]*\sfill=/i.test(out)) {
    out = out.replace(/^<svg\b/i, '<svg fill="currentColor"');
  }

  return out;
}

/**
 * Reads an SVG asset and returns its markup forced to symbolic `currentColor`.
 * Unlike a logo (which preserves authentic brand colors), an icon is always symbolic
 * and overrides authored colors to inherit the current theme color.
 *
 * @param {string} assetPath - Root-relative asset path
 * @param {string} contentDir - Absolute path to content directory
 * @returns {string} Symbolic SVG markup, or an empty string when not an inlinable SVG
 */
export function inlineIcon(assetPath, contentDir) {
  const markup = inlineSvg(assetPath, contentDir);
  if (!markup) return '';
  return makeSvgSymbolic(markup);
}

/**
 * Renders an icon specification (local SVG path, remote CDN URL, or icon slug).
 * Enforces the symbolic contract where the icon is always reactive to theme modes.
 *
 * @param {string} icon - Icon path, remote URL, or slug
 * @param {string} contentDir - Absolute path to content directory
 * @returns {string} Rendered markup or empty string if unhandled
 */
export function renderIcon(icon, contentDir) {
  if (!icon || typeof icon !== 'string') return '';
  const trimmed = icon.trim();

  // External CDN URI: use CSS mask to adapt to currentColor dynamically
  if (trimmed.includes('://')) {
    return `<span class="social__icon" style="--icon: url('${trimmed}')" aria-hidden="true"></span>`;
  }

  // Local SVG asset path: inline with forced symbolic currentColor
  if (trimmed.startsWith('/') || trimmed.endsWith('.svg')) {
    const inlined = inlineIcon(trimmed, contentDir);
    if (inlined) return inlined;
    return `<span class="social__icon" style="--icon: url('${trimmed}')" aria-hidden="true"></span>`;
  }

  return '';
}

/**
 * Inlines the SVG images in a rendered body that are written to follow the page.
 *
 * Markdown produces `<img src="diagram.svg">`, and an image referenced that way is
 * a separate document, so `currentColor` inside it renders black whatever the page
 * is doing. Only files that actually ask for `currentColor` are inlined, so a full
 * colour illustration keeps its own palette and stays a normal, lazily loaded image.
 *
 * @param {string} html - Rendered entry body
 * @param {string} contentDir - Absolute path to content directory
 * @param {string} [baseDir] - Entry directory, for resolving relative sources
 * @returns {string} Body with themeable SVGs inlined
 */
export function inlineThemedSvg(html, contentDir, baseDir = '') {
  if (typeof html !== 'string' || !html || !contentDir) return html || '';

  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\ssrc=(["'])(.*?)\1/i)?.[2];
    if (!src || !src.split(/[?#]/)[0].toLowerCase().endsWith('.svg')) return tag;

    const assetPath = src.startsWith('/') ? src : path.posix.join('/', baseDir, src);
    const markup = inlineSvg(assetPath, contentDir);
    if (!markup || !markup.includes('currentColor')) return tag;

    const alt = tag.match(/\salt=(["'])(.*?)\1/i)?.[2] ?? '';
    const label = alt
      ? ` role="img" aria-label="${alt}"`
      : ' role="presentation" aria-hidden="true"';

    return markup.replace(/^<svg\b/i, `<svg class="inline-svg"${label}`);
  });
}

/**
 * Registers all engine filters on an Eleventy configuration instance.
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {string} [contentDir] - Absolute path to content directory, for asset reading filters
 */
export function registerFilters(eleventyConfig, contentDir) {
  // Presentation mappings
  eleventyConfig.addFilter('modalityLabel', (val, context) => getModalityLabel(val, context));
  eleventyConfig.addFilter('employmentTypeLabel', (val) => getEmploymentTypeLabel(val));
  eleventyConfig.addFilter('degreeTypeLabel', (val) => getDegreeTypeLabel(val));
  eleventyConfig.addFilter('languageLevelLabel', (val) => getLanguageLevelLabel(val));
  eleventyConfig.addFilter('collectionLabel', (val, plural) => getCollectionLabel(val, plural));

  // Dates
  eleventyConfig.addFilter('formatDate', (val, locale) => formatDate(val, locale));
  eleventyConfig.addFilter('dateRange', (start, end, locale) => formatDateRange(start, end, locale));
  eleventyConfig.addFilter('isoDate', (val) => toIsoDate(val));

  // Markdown
  eleventyConfig.addFilter('markdown', (content) => renderMarkdown(content));
  eleventyConfig.addFilter('markdownInline', (content) => renderMarkdownInline(content));
  // Plain text, for the few spots Markdown must not reach: JSON-LD, meta tags.
  eleventyConfig.addFilter('stripMarkdown', (content) => stripMarkdownAndHtml(content));

  eleventyConfig.addFilter('rfc822Date', (val) => toRfc822Date(val));
  eleventyConfig.addFilter('duration', (start, end) => computeDuration(start, end)?.text || '');

  // URLs and identifiers
  eleventyConfig.addFilter('absoluteUrl', (urlPath, siteUrl) => resolveAbsoluteUrl(urlPath, siteUrl));
  eleventyConfig.addFilter('absoluteUrls', (html, siteUrl, pagePath) => absolutizeUrls(html, siteUrl, pagePath));
  eleventyConfig.addFilter('slugify', (val) => slugify(val));

  // Assets (logo and icon distinction)
  eleventyConfig.addFilter('inlineSvg', (assetPath) => inlineSvg(assetPath, contentDir));
  eleventyConfig.addFilter('inlineIcon', (assetPath) => inlineIcon(assetPath, contentDir));
  eleventyConfig.addFilter('renderIcon', (icon) => renderIcon(icon, contentDir));
  eleventyConfig.addFilter('inlineThemedSvg', (html, baseDir) => inlineThemedSvg(html, contentDir, baseDir));

  // List helpers. Nunjucks selectattr only tests truthiness and slice chunks
  // rather than limiting, so themes cannot filter or cap a list without these.
  eleventyConfig.addFilter('limit', (list, count) => (Array.isArray(list) ? list.slice(0, count) : list));
  eleventyConfig.addFilter('where', (list, key, value) =>
    (Array.isArray(list) ? list.filter((entry) => entry?.[key] === value) : list));
  eleventyConfig.addFilter('whereNot', (list, key, value) =>
    (Array.isArray(list) ? list.filter((entry) => entry?.[key] !== value) : list));
  eleventyConfig.addFilter('sortBy', (list, key, descending = false) => {
    if (!Array.isArray(list)) return list;
    const sorted = [...list].sort((a, b) =>
      String(a?.[key] ?? '').localeCompare(String(b?.[key] ?? ''), undefined, { numeric: true }));
    return descending ? sorted.reverse() : sorted;
  });
  eleventyConfig.addFilter('byRecency', (list) => (Array.isArray(list) ? sortByRecency(list) : list));
  eleventyConfig.addFilter('byDate', (list) => (Array.isArray(list) ? sortByDate(list) : list));
  /* Concatenates two lists and drops repeats, keeping the first spelling seen.
     Skills are compared without case, since "Node.js" and "node.js" name one
     thing, and Nunjucks can neither join two arrays nor deduplicate. */
  eleventyConfig.addFilter('union', (list, other) => {
    const items = [...(Array.isArray(list) ? list : []), ...(Array.isArray(other) ? other : [])];
    const seen = new Set();
    return items.filter((item) => {
      const key = typeof item === 'string' ? item.trim().toLowerCase() : item;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}
