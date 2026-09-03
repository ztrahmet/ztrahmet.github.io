import fs from 'node:fs';
import path from 'node:path';

/**
 * KaTeX ships the stylesheet that its build-time HTML depends on. Reading it
 * from the installed package keeps the CSS in step with the version the engine
 * renders with, instead of vendoring a copy that silently goes stale.
 *
 * The woff2 files are published from content/static/fonts/katex/, so the src
 * lists are rewritten to point there and the woff and ttf fallbacks are dropped.
 */
const SOURCE = 'node_modules/katex/dist/katex.min.css';

const FONT_SRC =
  /url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(?:,url\(fonts\/[\w-]+\.woff\) format\("woff"\))?(?:,url\(fonts\/[\w-]+\.ttf\) format\("truetype"\))?/g;

export const data = {
  permalink: '/assets/katex.css',
  eleventyExcludeFromCollections: true
};

export function render() {
  const css = fs.readFileSync(path.resolve(SOURCE), 'utf8');
  const rebased = css.replace(FONT_SRC, 'url(/static/fonts/katex/$1.woff2) format("woff2")');

  return `${rebased}
/* Theme adjustments. Loaded after katex.min.css, and site.css owns the tokens. */
.katex { font-size: 1.06em; }
.katex-display {
  margin: var(--s5) 0;
  padding-block: 0.35rem;
  overflow-x: auto;
  overflow-y: hidden;
}
.katex-error {
  font-family: var(--mono);
  font-size: var(--t-mono);
  color: var(--accent-ink);
}
`;
}
