import { toDateString, toIsoDate } from '../config/format.js';

/** Sorts ahead of every real date, so 'present' always ranks as the newest value. */
const PRESENT_SENTINEL = '9999-12-31';

/**
 * Checks whether a date value is the 'present' keyword.
 * @param {string|number} value - Date value
 * @returns {boolean} True when the value means "still running"
 */
function isPresent(value) {
  return toDateString(value).toLowerCase() === 'present';
}

/**
 * Determines whether an entry is still running.
 * Normally expressed as `end: present`, but a primary date of 'present' counts too.
 *
 * @param {object} entry - Collection item or profile record
 * @returns {boolean} True when the entry has no end date yet
 */
export function isOngoing(entry) {
  return isPresent(entry?.end) || isPresent(entry?.date ?? entry?.start);
}

/**
 * Resolves the date an entry is ranked by: its own date, otherwise its start.
 *
 * @param {object} entry - Collection item or profile record
 * @returns {string} Canonical date string, empty when the entry carries no date
 */
export function getPrimaryDate(entry) {
  return toDateString(entry?.date ?? entry?.start);
}

/**
 * Compares two date values ascending, normalizing partial dates so that
 * '2023' orders before '2023-05'. Absent dates order lowest.
 *
 * @param {string|number} a - First date
 * @param {string|number} b - Second date
 * @returns {number} Negative when a is earlier, positive when later, 0 when equal
 */
function compareDates(a, b) {
  const left = isPresent(a) ? PRESENT_SENTINEL : toIsoDate(a);
  const right = isPresent(b) ? PRESENT_SENTINEL : toIsoDate(b);

  if (left === right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left < right ? -1 : 1;
}

/**
 * Resolves ties between entries that rank identically by date, so ordering
 * never depends on input order or filesystem traversal.
 *
 * @param {object} a - First entry
 * @param {object} b - Second entry
 * @returns {number} Comparator result
 */
function compareTiebreak(a, b) {
  const byTitle = String(a?.title ?? '').localeCompare(String(b?.title ?? ''));
  if (byTitle !== 0) return byTitle;

  const byOrganization = String(a?.organization ?? '').localeCompare(String(b?.organization ?? ''));
  if (byOrganization !== 0) return byOrganization;

  return String(a?.slug ?? '').localeCompare(String(b?.slug ?? ''));
}

/**
 * Ranks entries newest first, with ongoing entries ahead of finished ones.
 *
 * Order of precedence:
 * 1. Entries carrying a date rank above entries without one
 * 2. Ongoing entries (`end: present`) rank above finished entries
 * 3. Later primary date first
 * 4. Later end date first, so the entry that ran most recently wins a tie
 * 5. Title, organization, then slug, so equal entries stay deterministic
 *
 * @param {object} a - First entry
 * @param {object} b - Second entry
 * @returns {number} Comparator result
 */
export function compareByRecency(a, b) {
  const dateA = getPrimaryDate(a);
  const dateB = getPrimaryDate(b);

  if (!dateA && !dateB) return compareTiebreak(a, b);
  if (!dateA) return 1;
  if (!dateB) return -1;

  const ongoingA = isOngoing(a);
  const ongoingB = isOngoing(b);
  if (ongoingA !== ongoingB) return ongoingA ? -1 : 1;

  const byPrimary = compareDates(dateB, dateA);
  if (byPrimary !== 0) return byPrimary;

  const byEnd = compareDates(toDateString(b?.end), toDateString(a?.end));
  if (byEnd !== 0) return byEnd;

  return compareTiebreak(a, b);
}

/**
 * Returns a new array ordered newest first, with ongoing entries ranked above finished ones.
 *
 * @param {Array<object>} [entries=[]] - Entries to order
 * @returns {Array<object>} Ordered copy
 */
export function sortByRecency(entries = []) {
  return [...entries].sort(compareByRecency);
}
