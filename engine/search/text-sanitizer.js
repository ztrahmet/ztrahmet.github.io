/**
 * Text sanitization and plain-text extraction utilities for search indexing
 */

/**
 * Cleans a LaTeX mathematical expression for plain-text search indexing,
 * stripping LaTeX command noise while preserving variables, operands, and numbers.
 *
 * @param {string} latex - Raw LaTeX formula
 * @returns {string} Sanitized plain-text tokens
 */
export function sanitizeLatex(latex) {
  if (typeof latex !== 'string' || !latex.trim()) {
    return '';
  }

  return latex
    .replace(/\\[a-zA-Z]+/g, ' ') // Strip LaTeX commands (\frac, \int, \alpha, \sum)
    .replace(/[{}^_]/g, ' ')       // Strip structural braces and sub/superscript markers
    .replace(/\\/g, ' ')           // Strip standalone backslashes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips HTML tags, Markdown syntax, formatting markers, and control tokens,
 * returning clean, dense plain text optimized for full-text search indexing.
 * Preserves literal currency strings ($50, $5 - $10, \$50) and code variables ($VAR).
 *
 * @param {string} text - Raw Markdown or HTML string
 * @returns {string} Clean plain text
 */
export function stripMarkdownAndHtml(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return '';
  }

  let clean = text;

  // 1. Remove Markdown code blocks (fenced)
  clean = clean.replace(/```[\s\S]*?```/g, ' ');

  // 2. Remove inline code backticks while preserving code content (including $VAR)
  clean = clean.replace(/`([^`]+)`/g, '$1');

  // 3. Process and sanitize block math ($$...$$)
  clean = clean.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => ` ${sanitizeLatex(math)} `);

  // 4. Process and sanitize inline math ($...$) with strict TeX boundary rules:
  // - Opening $ not preceded by backslash
  // - Opening $ not followed by whitespace
  // - Closing $ not preceded by whitespace
  // - Closing $ not immediately followed by a digit (0-9) to protect currency ranges ($5 - $10)
  // - Single line only
  clean = clean.replace(
    /(^|[^\\])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g,
    (_, prefix, math) => `${prefix}${sanitizeLatex(math)}`
  );

  // 5. Convert escaped dollar signs (\$50 -> $50)
  clean = clean.replace(/\\(\$)/g, '$1');

  // 6. Remove Markdown images ![alt](url) -> keep alt text if available
  clean = clean.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // 7. Convert Markdown links [text](url) -> keep link text
  clean = clean.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 8. Remove HTML tags
  clean = clean.replace(/<[^>]*>/g, ' ');

  // 9. Remove Markdown headers (# Header), blockquotes (> quote), and list bullets (*, -, 1.)
  clean = clean.replace(/^\s*#{1,6}\s+/gm, ' ');
  clean = clean.replace(/^\s*>\s+/gm, ' ');
  clean = clean.replace(/^\s*[-*+]\s+/gm, ' ');
  clean = clean.replace(/^\s*\d+\.\s+/gm, ' ');

  // 10. Remove Markdown horizontal rules
  clean = clean.replace(/^[-*_]{3,}\s*$/gm, ' ');

  // 11. Remove emphasis and formatting markers (bold, italic, strikethrough)
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, '$2');
  clean = clean.replace(/(\*|_)(.*?)\1/g, '$2');
  clean = clean.replace(/~~(.*?)~~/g, '$1');

  // 12. Decode common HTML entities
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 13. Collapse multiple whitespaces and newlines into single spaces
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Truncates text to a maximum character length on word boundaries with ellipsis.
 * @param {string} text - Input text
 * @param {number} [maxLength=200] - Max character length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text || '';
  const sub = text.slice(0, maxLength);
  const lastSpace = sub.lastIndexOf(' ');
  return lastSpace > 0 ? `${sub.slice(0, lastSpace)}...` : `${sub}...`;
}
