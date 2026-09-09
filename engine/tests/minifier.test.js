import fs from 'node:fs';
import path from 'node:path';
import os from 'os';
import { describe, it, expect } from 'vitest';
import {
  minifyHtml,
  minifyCss,
  minifyJs,
  minifySvg,
  minifyXml,
  minifyJson,
  minifyContent,
  minifyOutputDirectory,
  DEFAULT_HTML_MINIFIER_OPTIONS,
  DEFAULT_CSS_MINIFIER_OPTIONS,
  DEFAULT_JS_MINIFIER_OPTIONS,
  DEFAULT_SVGO_OPTIONS
} from '../pipeline/minifier.js';

describe('Lossless Code & Markup Minification Subsystem', () => {
  describe('1. HTML Minification', () => {
    it('collapses whitespace and strips comments while preserving pre/code blocks', async () => {
      const input = `
        <!DOCTYPE html>
        <html>
          <head>
            <!-- Important SEO meta -->
            <title>Page Title</title>
          </head>
          <body>
            <h1>Hello World</h1>
            <!-- Content comment -->
            <p>
              This is a paragraph with   extra    spaces.
            </p>
            <pre><code class="language-js">
  // Preserve exact indentation and newlines
  function test() {
    return 42;
  }
</code></pre>
          </body>
        </html>
      `;

      const result = await minifyHtml(input);

      // Comments stripped
      expect(result).not.toContain('<!-- Important SEO meta -->');
      expect(result).not.toContain('<!-- Content comment -->');

      // Doctype minified
      expect(result).toContain('<!doctype html>');

      // Whitespace outside code blocks collapsed
      expect(result).toContain('<h1>Hello World</h1>');
      expect(result).toContain('<p>This is a paragraph with extra spaces.</p>');

      // Code block content exactly preserved
      expect(result).toContain(
        '<pre><code class="language-js">\n  // Preserve exact indentation and newlines\n  function test() {\n    return 42;\n  }\n</code></pre>'
      );
    });

    it('preserves KaTeX math markup losslessly', async () => {
      const input = `
        <p>Formula: <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord mathnormal">E</span><span class="mspace" style="margin-right:0.2778em;"></span><span class="mrel">=</span></span></span></span></p>
      `;

      const result = await minifyHtml(input);
      expect(result).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">');
      expect(result).toContain('<mi>E</mi>');
      expect(result).toContain('class="katex"');
      expect(result).toContain('class="katex-html"');
    });

    it('minifies inline style and script tags inside HTML', async () => {
      const input = `
        <html>
          <head>
            <style>
              /* CSS comment */
              .box {
                margin: 0px 10px;
                background-color: #ffffff;
              }
            </style>
          </head>
          <body>
            <script>
              // JS comment
              function greet(name) {
                console.log("Hello " + name);
              }
            </script>
          </body>
        </html>
      `;

      const result = await minifyHtml(input);
      expect(result).not.toContain('/* CSS comment */');
      expect(result).not.toContain('// JS comment');
      expect(result).toContain('.box{margin:0 10px;background-color:#fff}');
      expect(result).toContain('function greet(name){console.log("Hello "+name)}');
    });

    it('handles empty or blank HTML strings gracefully', async () => {
      expect(await minifyHtml('')).toBe('');
      expect(await minifyHtml('   ')).toBe('   ');
    });
  });

  describe('2. CSS Minification', () => {
    it('strips comments, collapses whitespace, and shortens color codes', () => {
      const input = `
        /* Theme stylesheet comment */
        :root {
          --brand-bg: #ffffff;
          --brand-text: #000000;
        }

        .header {
          display: flex;
          padding: 10px 20px;
          color: var(--brand-text);
          background-color: #ffffff;
        }
      `;

      const result = minifyCss(input);
      expect(result).not.toContain('/* Theme stylesheet comment */');
      expect(result).toContain(':root{--brand-bg:#ffffff;--brand-text:#000000}');
      expect(result).toContain('.header{display:flex;padding:10px 20px;color:var(--brand-text);background-color:#fff}');
    });

    it('preserves media queries and keeps restructure disabled for cascade safety', () => {
      const input = `
        .sidebar { width: 100%; }
        @media (min-width: 60rem) {
          .sidebar { width: 280px; }
        }
      `;

      const result = minifyCss(input);
      expect(result).toContain('.sidebar{width:100%}');
      expect(result).toContain('@media (min-width:60rem){.sidebar{width:280px}}');
    });

    it('handles empty or blank CSS strings gracefully', () => {
      expect(minifyCss('')).toBe('');
      expect(minifyCss('   ')).toBe('   ');
    });
  });

  describe('3. JS Minification', () => {
    it('strips comments and collapses whitespace while preserving variable names (lossless)', async () => {
      const input = `
        // Configuration options
        /* Search initialization function */
        function initSearchEngine(dataset, config) {
          var total = dataset.length;
          var active = true;
          if (!active) return null;
          return {
            total: total,
            search: function(q) {
              return q ? dataset.filter(function(item) { return item.name === q; }) : [];
            }
          };
        }
      `;

      const result = await minifyJs(input);
      expect(result).not.toContain('// Configuration options');
      expect(result).not.toContain('/* Search initialization function */');
      expect(result).toContain('function initSearchEngine(dataset,config)');
      expect(result).toContain('total:dataset.length');
    });

    it('handles empty or blank JS strings gracefully', async () => {
      expect(await minifyJs('')).toBe('');
      expect(await minifyJs('   ')).toBe('   ');
    });
  });

  describe('4. SVG Minification with SVGO', () => {
    it('strips XML declaration, DOCTYPE, metadata, and comments using SVGO', () => {
      const input = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- Created with Vector Software -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <metadata><creator>Designer</creator></metadata>
  <circle cx="50" cy="50" r="40" fill="#ffffff" stroke="#000000"/>
</svg>`;

      const result = minifySvg(input);
      expect(result).not.toContain('<?xml');
      expect(result).not.toContain('<!DOCTYPE');
      expect(result).not.toContain('Created with Vector');
      expect(result).not.toContain('<metadata>');

      // Shortened colors
      expect(result).toContain('fill="#fff"');
      expect(result).toContain('stroke="#000"');

      // Preserved viewBox and dimensions
      expect(result).toContain('viewBox="0 0 100 100"');
      expect(result).toContain('width="100"');
      expect(result).toContain('height="100"');
    });

    it('preserves element IDs and internal references strictly', () => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <defs>
    <linearGradient id="grad1">
      <stop offset="0%" stop-color="#ff0000"/>
      <stop offset="100%" stop-color="#0000ff"/>
    </linearGradient>
  </defs>
  <rect id="rect1" fill="url(#grad1)" width="50" height="50"/>
</svg>`;

      const result = minifySvg(input);
      expect(result).toContain('id="grad1"');
      expect(result).toContain('id="rect1"');
      expect(result).toContain('fill="url(#grad1)"');
    });

    it('handles empty or blank SVG strings gracefully', () => {
      expect(minifySvg('')).toBe('');
      expect(minifySvg('   ')).toBe('   ');
    });
  });

  describe('5. XML Minification', () => {
    it('strips XML comments and collapses whitespace while preserving CDATA blocks', () => {
      const input = `<?xml version="1.0" encoding="utf-8"?>
<!-- RSS feed header -->
<rss version="2.0">
  <channel>
    <title>My Site</title>
    <!-- Item list -->
    <item>
      <title>Post Title</title>
      <content:encoded><![CDATA[<p>Line 1</p>
<p>Line 2 with   spaces</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

      const result = minifyXml(input);
      expect(result).not.toContain('<!-- RSS feed header -->');
      expect(result).not.toContain('<!-- Item list -->');
      expect(result).toContain('<title>My Site</title><item>');
      expect(result).toContain('<![CDATA[<p>Line 1</p>\n<p>Line 2 with   spaces</p>]]>');
    });

    it('handles empty or blank XML strings gracefully', () => {
      expect(minifyXml('')).toBe('');
      expect(minifyXml('   ')).toBe('   ');
    });
  });

  describe('6. JSON Minification', () => {
    it('compacts formatted JSON strings without whitespace', () => {
      const input = JSON.stringify({ title: 'Search Index', count: 42, tags: ['a', 'b'] }, null, 2);
      const result = minifyJson(input);

      expect(result).toBe('{"title":"Search Index","count":42,"tags":["a","b"]}');
      expect(result).not.toContain('\n');
      expect(result).not.toContain('  ');
    });

    it('handles empty or blank JSON strings gracefully', () => {
      expect(minifyJson('')).toBe('');
      expect(minifyJson('   ')).toBe('   ');
    });
  });

  describe('7. Unified minifyContent Dispatcher', () => {
    it('dispatches properly based on filename or extension', async () => {
      const html = await minifyContent('<!-- comment --><h1>Hi</h1>', '.html');
      expect(html).toBe('<h1>Hi</h1>');

      const css = await minifyContent('/* c */ .a { color: #ffffff; }', 'style.css');
      expect(css).toBe('.a{color:#fff}');

      const js = await minifyContent('// comment\nvar x = 1;', 'main.js');
      expect(js).toBe('var x=1;');

      const svg = await minifyContent('<svg viewBox="0 0 10 10"><!-- c --><circle cx="5" cy="5" r="5" fill="#ffffff"/></svg>', 'icon.svg');
      expect(svg).toContain('fill="#fff"');

      const xml = await minifyContent('<root> <!-- c --> <val>1</val> </root>', '.xml');
      expect(xml).toBe('<root><val>1</val></root>');

      const json = await minifyContent('{\n  "a": 1\n}', 'data.json');
      expect(json).toBe('{"a":1}');
    });

    it('returns original content unchanged on unrecognized file extensions', async () => {
      const binaryLike = 'random-unsupported-data';
      expect(await minifyContent(binaryLike, 'photo.png')).toBe(binaryLike);
      expect(await minifyContent(binaryLike, 'doc.pdf')).toBe(binaryLike);
    });

    it('catches parse/minification errors gracefully without throwing', async () => {
      const malformedJson = '{ "unclosed: ';
      expect(await minifyContent(malformedJson, '.json')).toBe(malformedJson);
    });
  });

  describe('8. Directory Minifier: minifyOutputDirectory', () => {
    it('recursively minifies all eligible code and markup files in a directory', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minifier-test-'));

      try {
        // Create sample files of every supported type
        fs.mkdirSync(path.join(tempDir, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'index.html'), '<!-- Comment -->\n<h1> Hello World </h1>\n');
        fs.writeFileSync(path.join(tempDir, 'assets/site.css'), '/* Styles */\n.btn { color: #ffffff; margin: 0px 5px; }\n');
        fs.writeFileSync(path.join(tempDir, 'assets/app.js'), '// App logic\nfunction run() { return true; }\n');
        fs.writeFileSync(path.join(tempDir, 'assets/logo.svg'), '<?xml version="1.0"?><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#ffffff"/></svg>');
        fs.writeFileSync(path.join(tempDir, 'feed.xml'), '<!-- Feed -->\n<rss><channel><title>Blog</title></channel></rss>');
        fs.writeFileSync(path.join(tempDir, 'search.json'), '{\n  "version": "1.0.0"\n}');
        fs.writeFileSync(path.join(tempDir, 'robots.txt'), 'User-agent: *\nDisallow:\n');

        const summary = await minifyOutputDirectory(tempDir, { silent: true });

        expect(summary).not.toBeNull();
        expect(summary.totalFiles).toBe(6);
        expect(summary.countsByType.html).toBe(1);
        expect(summary.countsByType.css).toBe(1);
        expect(summary.countsByType.js).toBe(1);
        expect(summary.countsByType.svg).toBe(1);
        expect(summary.countsByType.xml).toBe(1);
        expect(summary.countsByType.json).toBe(1);
        expect(summary.savedBytes).toBeGreaterThan(0);

        // Verify files on disk are minified
        expect(fs.readFileSync(path.join(tempDir, 'index.html'), 'utf-8')).toBe('<h1>Hello World</h1>');
        expect(fs.readFileSync(path.join(tempDir, 'assets/site.css'), 'utf-8')).toBe('.btn{color:#fff;margin:0 5px}');
        expect(fs.readFileSync(path.join(tempDir, 'assets/app.js'), 'utf-8')).toBe('function run(){return!0}');
        expect(fs.readFileSync(path.join(tempDir, 'assets/logo.svg'), 'utf-8')).toContain('fill="#fff"');
        expect(fs.readFileSync(path.join(tempDir, 'feed.xml'), 'utf-8')).toBe('<rss><channel><title>Blog</title></channel></rss>');
        expect(fs.readFileSync(path.join(tempDir, 'search.json'), 'utf-8')).toBe('{"version":"1.0.0"}');

        // Non-code file left untouched
        expect(fs.readFileSync(path.join(tempDir, 'robots.txt'), 'utf-8')).toBe('User-agent: *\nDisallow:\n');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('returns null when given empty or non-existent directories', async () => {
      expect(await minifyOutputDirectory(null)).toBeNull();
      expect(await minifyOutputDirectory('/non/existent/dir/path')).toBeNull();

      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-dir-'));
      expect(await minifyOutputDirectory(emptyDir)).toBeNull();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe('9. Enhanced Lossless Limits & Clean Build Invariants', () => {
    it('collapses boolean attributes and decodes safe HTML entities losslessly', async () => {
      const input = '<button disabled="disabled" readonly="readonly">Click &amp; Submit</button>';
      const result = await minifyHtml(input);
      expect(result).toBe('<button disabled readonly>Click & Submit</button>');
    });

    it('removes deprecated xlink:href in favor of standard href in SVG', () => {
      const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><circle id="c" cx="5" cy="5" r="4"/></defs><use xlink:href="#c"/></svg>';
      const result = minifySvg(input);
      expect(result).not.toContain('xlink:href');
      expect(result).toContain('href="#c"');
    });

    it('strips all CSS comments without leaving comment fragments', () => {
      const input = '/*! Critical license comment */ .box { color: red; } /* Regular comment */';
      const result = minifyCss(input);
      expect(result).not.toContain('Critical license');
      expect(result).not.toContain('Regular comment');
      expect(result).toBe('.box{color:red}');
    });
  });
});

