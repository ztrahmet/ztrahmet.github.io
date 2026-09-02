import fs from 'node:fs';
import matter from 'gray-matter';
import { load, CORE_SCHEMA } from 'js-yaml';

/**
 * Custom YAML engine for gray-matter using CORE_SCHEMA
 * to preserve date strings identically to YAML data files.
 */
const customYamlEngine = {
  parse: (str) => {
    return load(str, { schema: CORE_SCHEMA }) || {};
  }
};

/**
 * Parses frontmatter and markdown body from a markdown file on disk.
 * @param {string} filePath - Absolute path to the markdown file
 * @returns {{ data: object, content: string }} Parsed frontmatter and content
 * @throws {Error} If the file does not exist or frontmatter is invalid
 */
export function loadMarkdownFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Markdown file not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownString(raw, filePath);
}

/**
 * Parses frontmatter and markdown body from a string.
 * Excerpts are derived downstream from the body by content-metrics, so gray-matter's
 * own excerpt handling is left off to avoid leaking raw Markdown into previews.
 *
 * @param {string} markdownString - Raw markdown text
 * @param {string} [source='Markdown content'] - Source identifier for error reporting
 * @returns {{ data: object, content: string }}
 * @throws {Error} If frontmatter syntax is malformed
 */
export function parseMarkdownString(markdownString, source = 'Markdown content') {
  if (typeof markdownString !== 'string') {
    return { data: {}, content: '' };
  }

  try {
    const parsed = matter(markdownString, {
      engines: {
        yaml: customYamlEngine
      }
    });

    return {
      data: parsed.data || {},
      content: parsed.content || ''
    };
  } catch (err) {
    throw new Error(`Failed to parse frontmatter from ${source}: ${err.message}`);
  }
}
