import { generateExcerpt } from './content-metrics.js';
import { stripMarkdownAndHtml } from '../search/text-sanitizer.js';
import { toDateString, toIsoDate } from '../config/format.js';

/**
 * Resolves an absolute URL given a path and a base site URL.
 * @param {string} urlPath - Root-relative path or URI
 * @param {string} [siteUrl=''] - Site base URL (e.g. 'https://username.github.io')
 * @returns {string} Absolute URL
 */
export function resolveAbsoluteUrl(urlPath, siteUrl = '') {
  if (!urlPath || typeof urlPath !== 'string') return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlPath)) {
    return urlPath; // Already absolute URI
  }

  const base = (siteUrl || '').replace(/\/+$/, '');
  const pathPart = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return base ? `${base}${pathPart}` : pathPart;
}

/**
 * Builds a standardized, normalized SEO metadata object for a page or collection entry.
 *
 * @param {object} item - Synthesized collection item or page data
 * @param {object} [site={}] - Site metadata from data.yaml
 * @returns {{
 *   canonicalUrl: string,
 *   title: string,
 *   siteTitle: string,
 *   description: string,
 *   image: string,
 *   ogType: 'article' | 'website',
 *   publishedTime: string | null,
 *   modifiedTime: string | null
 * }} Normalized SEO metadata
 */
export function buildItemSeo(item = {}, site = {}) {
  const siteUrl = site?.url || '';
  const siteTitle = site?.title || 'Portfolio';
  const itemTitle = item?.title || siteTitle;
  // description may carry Markdown now that it renders that way on the page;
  // a <meta> tag and an OG description can't, so this is always plain text.
  const rawDescription = stripMarkdownAndHtml(item?.description || '') || generateExcerpt(item?.content || '') || site?.description || '';

  const permalink = item?.permalink || '/';
  const canonicalUrl = resolveAbsoluteUrl(permalink, siteUrl);

  // Resolve image (item image -> site share_image -> site favicon -> empty)
  let rawImage = '';
  if (item?.image) {
    rawImage = typeof item.image === 'object' ? item.image.light || item.image.dark : item.image;
  } else if (site?.share_image) {
    rawImage = typeof site.share_image === 'object' ? site.share_image.light || site.share_image.dark : site.share_image;
  }
  const image = rawImage ? resolveAbsoluteUrl(rawImage, siteUrl) : '';

  const isArticle = item?.collection === 'blog' || item?.collection === 'publication';
  const ogType = isArticle ? 'article' : 'website';

  const publishedTime = toDateString(item?.date ?? item?.start) || null;
  const publishedIso = toIsoDate(publishedTime) || null;

  return {
    canonicalUrl,
    title: itemTitle,
    siteTitle,
    description: rawDescription,
    image,
    ogType,
    publishedTime,
    modifiedTime: publishedTime,
    publishedIso
  };
}
