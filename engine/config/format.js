/**
 * Pure formatting primitives shared by the pipeline, search, and template filters.
 * Kept free of any Eleventy or rendering dependency.
 */

const TRANSLITERATIONS = Object.freeze({
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l',
  ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe'
});

/**
 * Converts arbitrary text into a URL-safe slug.
 * Decomposes accented characters, transliterates letters that have no canonical
 * decomposition, and expands the symbols that distinguish technology names,
 * so non-ASCII headings keep readable anchors and "C", "C++" and "C#" stay distinct.
 *
 * @param {string} text - Raw text
 * @returns {string} URL-safe slug
 */
export function slugify(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/[ıİşŞğĞøØđĐłŁßæÆœŒ]/g, (ch) => TRANSLITERATIONS[ch] || ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalizes a date value to its canonical string form.
 * Integer years from YAML are coerced so downstream consumers see a stable type.
 *
 * @param {string|number} dateVal - Date value
 * @returns {string} Canonical date string, or empty string when absent
 */
export function toDateString(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === '') return '';
  return String(dateVal).trim();
}

/**
 * Converts a partial date into a full ISO-8601 date for machine-readable markup.
 * Missing month and day components default to January 1st.
 *
 * @param {string|number} dateVal - Date string or integer year
 * @returns {string} ISO date (YYYY-MM-DD), or empty string when not a date
 */
export function toIsoDate(dateVal) {
  const str = toDateString(dateVal);
  if (!str || str.toLowerCase() === 'present') return '';

  if (/^\d{4}$/.test(str)) return `${str}-01-01`;
  if (/^\d{4}-\d{2}$/.test(str)) return `${str}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return '';
}

/**
 * Formats a date string ('YYYY-MM-DD', 'YYYY-MM', 'YYYY', or 'present')
 * into a human-readable localized display string.
 *
 * @param {string|number} dateVal - Date string or integer year
 * @param {string} [locale='en-US'] - BCP 47 language tag
 * @returns {string} Formatted display date (e.g. "Aug 15, 2023", "Jan 2022", "Present")
 */
export function formatDate(dateVal, locale = 'en-US') {
  const str = toDateString(dateVal);
  if (!str) return '';
  if (str.toLowerCase() === 'present') return 'Present';

  if (/^\d{4}$/.test(str)) {
    return str;
  }

  if (/^\d{4}-\d{2}$/.test(str)) {
    const [year, month] = str.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return str;
}

/**
 * Formats a start and end pair into a single display range.
 *
 * @param {string|number} start - Range start
 * @param {string|number} [end] - Range end, or 'present'
 * @param {string} [locale='en-US'] - BCP 47 language tag
 * @returns {string} Formatted range (e.g. "Jan 2022 – Present")
 */
export function formatDateRange(start, end, locale = 'en-US') {
  const from = formatDate(start, locale);
  const to = formatDate(end, locale);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

/**
 * Converts a BCP 47 locale tag or an underscore locale (en_US) into a display locale.
 *
 * @param {object} [site={}] - Site metadata
 * @returns {string} BCP 47 language tag
 */
export function resolveLocale(site = {}) {
  const raw = site?.locale || site?.lang;
  if (!raw || typeof raw !== 'string') return 'en-US';
  return raw.replace('_', '-');
}

/**
 * Converts a date into an RFC-822 string, the format RSS requires for pubDate
 * and lastBuildDate. Accepts both an authored date (2023, 2023-01, 2023-01-15)
 * and a full ISO timestamp (build.generatedAt), which toIsoDate's own patterns
 * don't match since they only describe a day, not a moment.
 *
 * @param {string|number} dateVal - Date string, integer year, or ISO timestamp
 * @returns {string} RFC-822 date, or empty string when not a date
 */
export function toRfc822Date(dateVal) {
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(dateVal)) {
    const parsed = new Date(dateVal);
    if (!Number.isNaN(parsed.getTime())) return parsed.toUTCString();
  }
  const iso = toIsoDate(dateVal);
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toUTCString();
}

/**
 * Calculates the elapsed span between two dates, treating 'present' as today.
 * Months are inclusive of the start month, matching how a CV counts tenure.
 *
 * @param {string|number} start - Range start
 * @param {string|number} [end] - Range end, or 'present'
 * @returns {{ months: number, years: number, remainingMonths: number, text: string }|null}
 */
export function computeDuration(start, end) {
  const startIso = toIsoDate(start);
  if (!startIso) return null;

  const endStr = toDateString(end);
  const endIso = endStr.toLowerCase() === 'present' || !endStr
    ? new Date().toISOString().slice(0, 10)
    : toIsoDate(endStr);
  if (!endIso) return null;

  const [sy, sm] = startIso.split('-').map(Number);
  const [ey, em] = endIso.split('-').map(Number);

  const diffMonths = (ey - sy) * 12 + (em - sm);
  if (diffMonths < 0) return null;

  const months = diffMonths + 1;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  const parts = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`);
  if (remainingMonths > 0) parts.push(`${remainingMonths} mo${remainingMonths === 1 ? '' : 's'}`);

  return { months, years, remainingMonths, text: parts.join(' ') || '1 mo' };
}
