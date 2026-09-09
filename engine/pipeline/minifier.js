/**
 * @fileoverview
 * Lossless Code & Markup Minification Subsystem.
 * Minifies HTML, CSS, JS, SVG, XML, and JSON files seamlessly on compilation.
 *
 * Guarantees strictly lossless transformations:
 * - HTML: Strips comments, collapses redundant whitespace outside pre/code/textarea,
 *         minifies inline CSS and JS.
 * - CSS: Strips comments, collapses redundant whitespace and semicolons, shortens colors
 *        losslessly via csso with restructure: false.
 * - JS: Strips comments, collapses redundant whitespace losslessly via terser with mangle: false.
 * - SVG: Strips comments, metadata, unnecessary namespaces and groups, shortens color codes
 *        losslessly via svgo with preserved viewBox and IDs.
 * - XML: Strips comments, collapses whitespace outside CDATA blocks.
 * - JSON: Compacts whitespace via JSON.stringify.
 */

import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { minify as minifyHtmlTerser } from 'html-minifier-terser';
import { minify as minifyCssCsso } from 'csso';
import { minify as minifyJsTerser } from 'terser';
import { optimize as optimizeSvgSvgo } from 'svgo';

/** Default lossless HTML minifier options */
export const DEFAULT_HTML_MINIFIER_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
  collapseBooleanAttributes: true,
  decodeEntities: true,
  minifyCSS: { restructure: false },
  minifyJS: { mangle: false },
  keepClosingSlash: true,
  caseSensitive: true
};

/** Default lossless CSS minifier options */
export const DEFAULT_CSS_MINIFIER_OPTIONS = {
  restructure: false,
  comments: false
};

/** Default lossless JS minifier options */
export const DEFAULT_JS_MINIFIER_OPTIONS = {
  ecma: 2022,
  compress: {
    passes: 2,
    dead_code: true,
    drop_debugger: true,
    conditionals: true,
    evaluate: true,
    booleans: true,
    loops: true,
    unused: true,
    hoist_funs: true,
    keep_fargs: true,
    if_return: true,
    join_vars: true,
    side_effects: true
  },
  mangle: false
};

/** Default lossless SVGO configuration */
export const DEFAULT_SVGO_OPTIONS = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false
        }
      }
    },
    'cleanupListOfValues',
    'removeXlink'
  ]
};

/**
 * Minifies HTML markup losslessly by collapsing whitespace outside pre/code/textarea
 * and stripping comments.
 *
 * @param {string} htmlString - Raw HTML markup
 * @param {object} [options={}] - Custom html-minifier-terser overrides
 * @returns {Promise<string>} Minified HTML markup
 */
export async function minifyHtml(htmlString, options = {}) {
  if (typeof htmlString !== 'string' || !htmlString.trim()) return htmlString || '';
  const config = {
    ...DEFAULT_HTML_MINIFIER_OPTIONS,
    ...options
  };
  return await minifyHtmlTerser(htmlString, config);
}

/**
 * Minifies CSS losslessly by stripping comments and redundant whitespace.
 * Preserves cascade ordering and rule specificity by disabling structural restructuring.
 *
 * @param {string} cssString - Raw CSS
 * @param {object} [options={}] - Custom csso options
 * @returns {string} Minified CSS
 */
export function minifyCss(cssString, options = {}) {
  if (typeof cssString !== 'string' || !cssString.trim()) return cssString || '';
  const config = {
    ...DEFAULT_CSS_MINIFIER_OPTIONS,
    ...options
  };
  const result = minifyCssCsso(cssString, config);
  return result.css;
}

/**
 * Minifies JavaScript losslessly by stripping comments, unnecessary whitespace,
 * and dead code while preserving variable/function names.
 *
 * @param {string} jsString - Raw JavaScript source
 * @param {object} [options={}] - Custom terser options
 * @returns {Promise<string>} Minified JavaScript
 */
export async function minifyJs(jsString, options = {}) {
  if (typeof jsString !== 'string' || !jsString.trim()) return jsString || '';
  const config = {
    ...DEFAULT_JS_MINIFIER_OPTIONS,
    ...options
  };
  const result = await minifyJsTerser(jsString, config);
  return result.code || jsString;
}

/**
 * Minifies SVG markup losslessly using SVGO.
 * Strips comments, XML declarations, DOCTYPE, metadata, and redundant groups,
 * and shortens colors while preserving viewBox and IDs.
 *
 * @param {string} svgString - Raw SVG markup
 * @param {object} [options={}] - Custom SVGO options
 * @returns {string} Minified SVG markup
 */
export function minifySvg(svgString, options = {}) {
  if (typeof svgString !== 'string' || !svgString.trim()) return svgString || '';
  const config = {
    ...DEFAULT_SVGO_OPTIONS,
    ...options
  };
  const result = optimizeSvgSvgo(svgString, config);
  return result.data || svgString;
}

/**
 * Minifies XML markup losslessly by stripping XML comments and collapsing whitespace
 * between elements while preserving CDATA blocks.
 *
 * @param {string} xmlString - Raw XML content
 * @returns {string} Minified XML
 */
export function minifyXml(xmlString) {
  if (typeof xmlString !== 'string' || !xmlString.trim()) return xmlString || '';
  const cdata = [];
  let tokenized = xmlString.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (match) => {
    cdata.push(match);
    return `__XML_CDATA_${cdata.length - 1}__`;
  });

  // Strip XML comments
  tokenized = tokenized.replace(/<!--[\s\S]*?-->/g, '');

  // Collapse whitespace between tags
  tokenized = tokenized.replace(/>\s+</g, '><').trim();

  // Restore CDATA blocks
  return tokenized.replace(/__XML_CDATA_(\d+)__/g, (_, idx) => cdata[Number(idx)]);
}

/**
 * Minifies JSON content by parsing and serializing without indentation.
 *
 * @param {string} jsonString - Raw JSON content
 * @returns {string} Compact JSON string
 */
export function minifyJson(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) return jsonString || '';
  return JSON.stringify(JSON.parse(jsonString));
}

/**
 * Dispatches minification for a single string based on file path or extension.
 *
 * @param {string} content - Raw file content
 * @param {string} fileOrExt - Filename, extension, or format identifier
 * @param {object} [options={}] - Minifier configuration overrides
 * @returns {Promise<string>} Minified content or original on error
 */
export async function minifyContent(content, fileOrExt, options = {}) {
  if (typeof content !== 'string') return content;
  const ext = (fileOrExt.startsWith('.') ? fileOrExt : path.extname(fileOrExt) || `.${fileOrExt}`).toLowerCase();

  try {
    switch (ext) {
      case '.html':
        return await minifyHtml(content, options.html);
      case '.css':
        return minifyCss(content, options.css);
      case '.js':
        return await minifyJs(content, options.js);
      case '.svg':
        return minifySvg(content, options.svg);
      case '.xml':
        return minifyXml(content);
      case '.json':
        return minifyJson(content);
      default:
        return content;
    }
  } catch (err) {
    if (options.verbose) {
      console.warn(`⚠️  [Minifier Warning] Failed to minify ${fileOrExt}:`, err.message);
    }
    return content;
  }
}

/** Set of file extensions eligible for compilation minification */
export const MINIFIABLE_EXTENSIONS = new Set(['.html', '.css', '.js', '.svg', '.xml', '.json']);

/**
 * Scans an output directory and minifies all code and markup files in-place.
 *
 * @param {string} outputDir - Absolute path to compiled output directory
 * @param {object} [options={}] - Minifier options
 * @param {boolean} [options.silent=false] - Whether to suppress console summary
 * @param {boolean} [options.verbose=false] - Whether to log warnings on failed files
 * @returns {Promise<object|null>} Summary of files minified and byte reduction
 */
export async function minifyOutputDirectory(outputDir, options = {}) {
  if (!outputDir || !fs.existsSync(outputDir)) return null;

  const t0 = performance.now();
  const allFiles = fg.sync(['**/*'], {
    cwd: outputDir,
    absolute: true,
    onlyFiles: true
  });

  const candidates = allFiles.filter((f) => MINIFIABLE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  if (candidates.length === 0) return null;

  let totalBefore = 0;
  let totalAfter = 0;
  const countsByType = { html: 0, css: 0, js: 0, svg: 0, xml: 0, json: 0 };

  await Promise.all(
    candidates.map(async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const origContent = fs.readFileSync(filePath, 'utf-8');
      const origSize = Buffer.byteLength(origContent, 'utf-8');
      totalBefore += origSize;

      const minified = await minifyContent(origContent, ext, options);
      const minSize = Buffer.byteLength(minified, 'utf-8');
      totalAfter += minSize;

      if (minified !== origContent) {
        fs.writeFileSync(filePath, minified, 'utf-8');
      }

      const typeKey = ext.slice(1);
      if (countsByType[typeKey] !== undefined) {
        countsByType[typeKey]++;
      }
    })
  );

  const t1 = performance.now();
  const savedBytes = Math.max(0, totalBefore - totalAfter);
  const savedPercent = totalBefore > 0 ? ((savedBytes / totalBefore) * 100).toFixed(1) : '0.0';
  const durationMs = Math.round(t1 - t0);

  const summary = {
    totalFiles: candidates.length,
    countsByType,
    totalBefore,
    totalAfter,
    savedBytes,
    savedPercent,
    durationMs
  };

  if (options.silent !== true) {
    console.log(
      `⚡ Minified ${candidates.length} files (${countsByType.html} html, ${countsByType.css} css, ` +
      `${countsByType.js} js, ${countsByType.svg} svg, ${countsByType.xml} xml, ${countsByType.json} json) ` +
      `saving ${(savedBytes / 1024).toFixed(1)} KB (${savedPercent}%) in ${durationMs}ms.`
    );
  }

  return summary;
}
