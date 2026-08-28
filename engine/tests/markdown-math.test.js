import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderKaTeX } from '../pipeline/markdown-renderer.js';
import { stripMarkdownAndHtml, sanitizeLatex } from '../search/text-sanitizer.js';

describe('LaTeX Math Support & TeX Disambiguation Rules', () => {
  describe('renderKaTeX static compiler', () => {
    it('pre-renders inline LaTeX to static HTML and MathML', () => {
      const html = renderKaTeX('E = mc^2', false);
      expect(html).toContain('class="katex"');
      expect(html).toContain('<math');
      expect(html).toContain('annotation encoding="application/x-tex">E = mc^2</annotation>');
    });

    it('pre-renders block LaTeX to display mode HTML and MathML', () => {
      const html = renderKaTeX('\\frac{a}{b}', true);
      expect(html).toContain('class="katex-display"');
      expect(html).toContain('<math');
      expect(html).toContain('display="block"');
    });

    it('handles malformed LaTeX gracefully without throwing', () => {
      const html = renderKaTeX('\\invalidMacro{something}', false);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });
  });

  describe('renderMarkdown: Inline & Block Math', () => {
    it('renders inline math expressions ($...$)', () => {
      const md = 'Einstein stated that $E = mc^2$ was fundamental.';
      const html = renderMarkdown(md);

      expect(html).toContain('<span class="katex">');
      expect(html).toContain('<math');
      expect(html).toContain('Einstein stated that');
      expect(html).toContain('was fundamental.');
    });

    it('renders complex inline math formulas', () => {
      const md = 'The area is $A = \\pi r^2$ and sum is $\\sum_{i=1}^{n} x_i$.';
      const html = renderMarkdown(md);

      expect(html).toContain('<span class="katex">');
      expect(html).toContain('The area is');
      expect(html).toContain('and sum is');
    });

    it('renders single-line block math ($$...$$)', () => {
      const md = '$$\\int_{a}^{b} f(x) dx = F(b) - F(a)$$';
      const html = renderMarkdown(md);

      expect(html).toContain('<span class="katex-display">');
      expect(html).toContain('<math');
      expect(html).toContain('display="block"');
    });

    it('renders multi-line block math ($$...$$)', () => {
      const md = `
$$
\\begin{aligned}
a &= b + c \\\\
d &= e + f
\\end{aligned}
$$
`;
      const html = renderMarkdown(md);

      expect(html).toContain('<span class="katex-display">');
      expect(html).toContain('<math');
      expect(html).toContain('display="block"');
    });
  });

  describe('renderMarkdown: Strict Pandoc/TeX Boundary & Currency Disambiguation', () => {
    it('preserves single currency figures as plain text ($5, $100)', () => {
      const md = 'The coffee costs $5 and the sandwich is $12.50.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('The coffee costs $5 and the sandwich is $12.50.');
    });

    it('preserves currency ranges with "to" as plain text ($5 to $10)', () => {
      const md = 'Items range from $5 to $10 in price.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('Items range from $5 to $10 in price.');
    });

    it('preserves currency ranges with dashes as plain text ($50 - $100, $50-$100)', () => {
      const md1 = 'Budget estimate: $50 - $100 per day.';
      const html1 = renderMarkdown(md1);
      expect(html1).not.toContain('class="katex"');
      expect(html1).toContain('Budget estimate: $50 - $100 per day.');

      const md2 = 'Budget: $50-$100.';
      const html2 = renderMarkdown(md2);
      expect(html2).not.toContain('class="katex"');
      expect(html2).toContain('Budget: $50-$100.');
    });

    it('enforces whitespace rules: opening $ followed by space is not math', () => {
      const md = 'This is $ not math $ at all.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('This is $ not math $ at all.');
    });

    it('enforces whitespace rules: closing $ preceded by space is not math', () => {
      const md = 'This is $also not math $ here.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('This is $also not math $ here.');
    });

    it('renders escaped dollar signs as literal $ symbols without math trigger', () => {
      const md = 'Use \\$50 or \\$VAR for variables.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('Use $50 or $VAR for variables.');
    });
  });

  describe('renderMarkdown: Code & Variable Protection', () => {
    it('protects shell/code variables in inline code ($VAR)', () => {
      const md = 'Set the `PORT` variable to `$PORT` and check `$HOME`.';
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('<code>$PORT</code>');
      expect(html).toContain('<code>$HOME</code>');
    });

    it('protects dollar signs in fenced code blocks', () => {
      const md = `
\`\`\`bash
#!/bin/bash
VAR="value"
echo "Price is $50"
echo "User is $USER"
\`\`\`
`;
      const html = renderMarkdown(md);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain('<pre><code class="language-bash">');
      expect(html).toContain('Price is $50');
      expect(html).toContain('User is $USER');
    });
  });

  describe('text-sanitizer: Search Indexer Alignment for Math & Currency', () => {
    it('sanitizes LaTeX formulas into clean plain-text keywords without syntax noise', () => {
      expect(sanitizeLatex('\\frac{a}{b}')).toBe('a b');
      expect(sanitizeLatex('\\int_{a}^{b} f(x) dx')).toBe('a b f(x) dx');
      expect(sanitizeLatex('E = mc^2')).toBe('E = mc 2');
      expect(sanitizeLatex('\\alpha + \\beta = \\gamma')).toBe('+ =');
    });

    it('strips math markup in stripMarkdownAndHtml while indexing content', () => {
      const text = 'According to $E = mc^2$ and $$\\frac{x}{y}$$, physics applies.';
      const stripped = stripMarkdownAndHtml(text);

      expect(stripped).not.toContain('$');
      expect(stripped).not.toContain('\\frac');
      expect(stripped).toContain('According to E = mc 2 and x y , physics applies.');
    });

    it('preserves literal currency strings in stripMarkdownAndHtml', () => {
      const text = 'Priced at $50 and ranges from $5 to $10, with code `$VAR` and \\$100.';
      const stripped = stripMarkdownAndHtml(text);

      expect(stripped).toContain('$50');
      expect(stripped).toContain('from $5 to $10');
      expect(stripped).toContain('$VAR');
      expect(stripped).toContain('$100');
    });
  });
});
