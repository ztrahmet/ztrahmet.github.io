import MarkdownIt from 'markdown-it';
import katex from 'katex';

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
 * Rules:
 * 1. Inline math ($...$):
 *    - Opening $ must not be preceded by backslash escape.
 *    - Opening $ must not be followed by whitespace (\s).
 *    - Closing $ must not be preceded by whitespace (\s).
 *    - Closing $ must not be immediately followed by a digit (0-9) to prevent currency range collisions ($5 - $10).
 *    - Inline math must be contained within a single line (no newlines).
 * 2. Block math ($$...$$):
 *    - Can be single-line ($$formula$$) or multi-line block.
 * 3. Currency protection:
 *    - Single currency numbers ($50), ranges ($5 to $10, $50 - $100), and escaped dollars (\$50) remain literal text.
 * 4. Code protection:
 *    - Dollar signs and variables in inline code (`$VAR`) or fenced blocks (```bash echo $VAR```) remain untouched.
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

    // Check if preceded by backslash escape (e.g. \$)
    if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) {
      return false;
    }

    const isDouble = state.src.charCodeAt(start + 1) === 0x24;
    const marker = isDouble ? '$$' : '$';
    const markerLen = marker.length;

    // Rule 1: Opening marker must not be followed by whitespace
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

    // Rule 2: Closing marker must not be preceded by whitespace
    const prevChar = state.src.charCodeAt(match - 1);
    if (prevChar === 0x20 || prevChar === 0x09 || prevChar === 0x0a) {
      return false;
    }

    // Rule 3: For inline single $, closing marker must not be immediately followed by a digit (currency protection like $5 - $10)
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

    // Single-line block math ($$content$$)
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

    // Multi-line block math
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

  // Register inline math after escape rule
  md.inline.ruler.after('escape', 'math_inline', mathInline);

  // Register block math before fence rule
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderKaTeX(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => renderKaTeX(tokens[idx].content, true);
}

/**
 * Creates and configures a MarkdownIt instance with KaTeX math and standard markdown extensions.
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
 * Renders Markdown text to static HTML with pre-rendered KaTeX math.
 * @param {string} markdown - Raw Markdown string
 * @returns {string} Rendered HTML string
 */
export function renderMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return '';
  }
  return defaultRenderer.render(markdown).trim();
}
