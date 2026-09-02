import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { slugify } from '../config/format.js';

/**
 * Generates a URL-safe anchor slug from heading text.
 * @param {string} text - Raw heading text
 * @returns {string} Anchor slug
 */
export function slugifyHeading(text) {
  return slugify(text);
}

/**
 * Renders LaTeX math expression using KaTeX in static HTML/MathML mode.
 * @param {string} latex - Raw LaTeX formula
 * @param {boolean} [isDisplayMode=false] - Whether to render as block display
 * @returns {string} Static pre-rendered HTML/MathML
 */
export function renderKaTeX(latex, isDisplayMode = false) {
  try {
    return katex.renderToString(latex, {
      displayMode: isDisplayMode,
      throwOnError: false,
      output: 'htmlAndMathml'
    });
  } catch (err) {
    return `<span class="katex-error">${latex}</span>`;
  }
}

/**
 * Markdown-it plugin implementing LaTeX math support with strict Pandoc/TeX disambiguation rules.
 *
 * @param {MarkdownIt} md - Markdown-it instance
 */
export function markdownItMath(md) {
  function mathInline(state, silent) {
    if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) {
      return false;
    }

    const start = state.pos;
    const max = state.posMax;

    if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) {
      return false;
    }

    const isDouble = state.src.charCodeAt(start + 1) === 0x24;
    const marker = isDouble ? '$$' : '$';
    const markerLen = marker.length;

    const nextChar = state.src.charCodeAt(start + markerLen);
    if (nextChar === 0x20 || nextChar === 0x09 || nextChar === 0x0a) {
      return false;
    }

    let match = -1;
    let pos = start + markerLen;

    while (pos < max) {
      if (state.src.charCodeAt(pos) === 0x24) {
        if (state.src.charCodeAt(pos - 1) !== 0x5c) {
          if (isDouble) {
            if (state.src.charCodeAt(pos + 1) === 0x24) {
              match = pos;
              break;
            }
          } else {
            if (state.src.charCodeAt(pos + 1) !== 0x24) {
              match = pos;
              break;
            }
          }
        }
      }
      pos++;
    }

    if (match === -1) {
      return false;
    }

    const prevChar = state.src.charCodeAt(match - 1);
    if (prevChar === 0x20 || prevChar === 0x09 || prevChar === 0x0a) {
      return false;
    }

    if (!isDouble && match + 1 < max) {
      const afterClosing = state.src.charCodeAt(match + 1);
      if (afterClosing >= 0x30 && afterClosing <= 0x39) {
        return false;
      }
    }

    const content = state.src.slice(start + markerLen, match);
    if (!content.trim()) {
      return false;
    }
    if (!isDouble && content.includes('\n')) {
      return false;
    }

    if (!silent) {
      const token = state.push(isDouble ? 'math_block' : 'math_inline', 'math', 0);
      token.markup = marker;
      token.content = content;
    }

    state.pos = match + markerLen;
    return true;
  }

  function mathBlock(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];

    if (pos + 2 > max) return false;
    if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) {
      return false;
    }

    pos += 2;
    const firstLine = state.src.slice(pos, max);

    if (firstLine.trim().endsWith('$$') && firstLine.trim().length >= 2) {
      const trimmed = firstLine.trim();
      const content = trimmed.slice(0, -2);
      if (!silent) {
        const token = state.push('math_block', 'math', 0);
        token.block = true;
        token.content = content;
        token.markup = '$$';
        token.map = [startLine, startLine + 1];
      }
      state.line = startLine + 1;
      return true;
    }

    let nextLine = startLine;
    let closed = false;

    while (nextLine < endLine) {
      nextLine++;
      if (nextLine >= endLine) break;

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos < max && state.sCount[nextLine] < state.blkIndent) break;

      if (state.src.slice(pos, max).trim() === '$$' || state.src.slice(pos, max).trim().endsWith('$$')) {
        closed = true;
        break;
      }
    }

    if (!closed) return false;

    if (!silent) {
      const lines = [];
      if (firstLine.trim()) lines.push(firstLine);
      for (let i = startLine + 1; i < nextLine; i++) {
        const lPos = state.bMarks[i] + state.tShift[i];
        const lMax = state.eMarks[i];
        lines.push(state.src.slice(lPos, lMax));
      }
      const lastLine = state.src.slice(pos, max).trim();
      if (lastLine !== '$$' && lastLine.endsWith('$$')) {
        lines.push(lastLine.slice(0, -2));
      }

      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = lines.join('\n');
      token.markup = '$$';
      token.map = [startLine, nextLine + 1];
    }

    state.line = nextLine + 1;
    return true;
  }

  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderKaTeX(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => renderKaTeX(tokens[idx].content, true);
}

/**
 * Creates and configures a MarkdownIt instance with KaTeX math support.
 * @returns {MarkdownIt} Configured MarkdownIt instance
 */
export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
  });

  md.use(markdownItMath);

  return md;
}

const defaultRenderer = createMarkdownRenderer();

/**
 * Reads the plain-text content of a heading from its inline token children.
 * @param {object} inlineToken - The inline token following a heading_open token
 * @returns {string} Heading text without inline markup
 */
function readHeadingText(inlineToken) {
  if (!inlineToken || !Array.isArray(inlineToken.children)) return '';
  return inlineToken.children
    .filter((child) => child.type !== 'html_inline')
    .reduce((acc, child) => acc + (child.content || ''), '')
    .trim();
}

/**
 * Parses Markdown once and derives both the rendered HTML and the Table of Contents
 * from the same token stream, so every TOC entry is guaranteed to match a real
 * heading anchor in the output.
 *
 * Anchor slugs are disambiguated across all heading levels, and headings inside
 * fenced or indented code blocks are never treated as headings.
 *
 * @param {string} markdown - Raw Markdown string
 * @param {object} [options]
 * @param {Array<number>} [options.tocLevels=[2, 3]] - Heading levels collected into the TOC
 * @returns {{ html: string, toc: Array<{ id: string, slug: string, text: string, level: number }> }}
 */
export function renderMarkdownDocument(markdown, options = {}) {
  const { tocLevels = [2, 3] } = options;

  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { html: '', toc: [] };
  }

  const env = {};
  const tokens = defaultRenderer.parse(markdown, env);
  const slugCounts = new Map();
  const toc = [];
  let headingIndex = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'heading_open') continue;

    headingIndex++;
    const level = Number(token.tag.slice(1));
    const text = readHeadingText(tokens[i + 1]);

    let baseSlug = slugify(text);
    if (!baseSlug) baseSlug = `section-${headingIndex}`;

    const count = slugCounts.get(baseSlug) || 0;
    const slug = count > 0 ? `${baseSlug}-${count}` : baseSlug;
    slugCounts.set(baseSlug, count + 1);

    token.attrSet('id', slug);

    if (tocLevels.includes(level)) {
      toc.push({ id: slug, slug, text, level });
    }
  }

  const html = defaultRenderer.renderer.render(tokens, defaultRenderer.options, env).trim();
  return { html, toc };
}

/**
 * Renders Markdown text to static HTML with pre-rendered KaTeX math and heading anchor IDs.
 * @param {string} markdown - Raw Markdown string
 * @returns {string} Rendered HTML string
 */
export function renderMarkdown(markdown) {
  return renderMarkdownDocument(markdown).html;
}

/**
 * Renders Markdown to inline HTML without a wrapping block element.
 * Suited to short strings such as taglines, labels, and headings.
 *
 * @param {string} markdown - Raw Markdown string
 * @returns {string} Rendered inline HTML
 */
export function renderMarkdownInline(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return '';
  }
  return defaultRenderer.renderInline(markdown).trim();
}

/**
 * Extracts a structured Table of Contents from Markdown content.
 * Derived from the same parse as the rendered HTML, so slugs always resolve.
 *
 * @param {string} markdown - Raw Markdown text
 * @returns {Array<{ id: string, slug: string, text: string, level: number }>} TOC items
 */
export function extractTableOfContents(markdown) {
  return renderMarkdownDocument(markdown).toc;
}
