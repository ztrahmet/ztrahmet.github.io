import readingTime from 'reading-time';
import { stripMarkdownAndHtml, truncateText } from '../search/text-sanitizer.js';

/**
 * Calculates word count and estimated reading time from Markdown/plain text content.
 * Uses the industry-standard reading-time library with international word tokenization.
 * Assumes a standard reading speed of 200 words per minute.
 *
 * @param {string} content - Markdown or plain-text body content
 * @returns {{ wordCount: number, readingTime: number }} Reading metrics
 */
export function calculateReadingMetrics(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return {
      wordCount: 0,
      readingTime: 0
    };
  }

  const plainText = stripMarkdownAndHtml(content);
  if (!plainText) {
    return { wordCount: 0, readingTime: 0 };
  }

  const stats = readingTime(plainText, { wordsPerMinute: 200 });
  const wordCount = stats.words;

  if (wordCount === 0) {
    return { wordCount: 0, readingTime: 0 };
  }

  return {
    wordCount,
    readingTime: Math.max(1, Math.ceil(stats.minutes))
  };
}

/**
 * Generates a concise preview excerpt from content if not explicitly provided.
 *
 * @param {string} content - Markdown or plain text content
 * @param {number} [maxLength=160] - Target excerpt length in characters
 * @returns {string} Concise excerpt string
 */
export function generateExcerpt(content, maxLength = 160) {
  if (typeof content !== 'string' || !content.trim()) {
    return '';
  }

  const plainText = stripMarkdownAndHtml(content);
  if (!plainText) return '';

  // Extract first 1-2 sentences if within reasonable length
  const firstSentenceMatch = plainText.match(/^(.+?[.!?])(?:\s+|$)/);
  if (firstSentenceMatch && firstSentenceMatch[1].length <= maxLength && firstSentenceMatch[1].length >= 30) {
    return firstSentenceMatch[1];
  }

  return truncateText(plainText, maxLength);
}
