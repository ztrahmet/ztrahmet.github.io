import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_CONTENT_DIR = path.resolve(PROJECT_ROOT, 'content');
export const SCHEMAS_DIR = path.resolve(PROJECT_ROOT, 'engine/schemas');

/**
 * Extracts a CLI argument value from an argument array by flag names.
 * Supports both '--flag=value' and '--flag value' syntax.
 *
 * @param {Array<string>} [args=process.argv] - Array of CLI arguments
 * @param {Array<string>} [flags=['--content', '--content-dir', '-c']] - Flags to match
 * @returns {string|null} Extracted value or null if not found
 */
export function extractArgValue(args = process.argv, flags = ['--content', '--content-dir', '-c']) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const flag of flags) {
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1);
      }
      if (arg === flag && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        return args[i + 1];
      }
    }
  }
  return null;
}

/**
 * Resolves the content directory path with fallback priority:
 * 1. Explicitly passed customPath parameter
 * 2. CLI argument (--content, --content-dir, -c)
 * 3. Environment variable (CONTENT_DIR)
 * 4. Default project content/ directory
 *
 * @param {string} [customPath] - Explicit path to content folder
 * @param {object} [options]
 * @param {boolean} [options.mustExist=true] - Whether to throw an error if the directory doesn't exist
 * @returns {string} Absolute resolved content directory path
 * @throws {Error} If mustExist is true and the directory does not exist
 */
export function resolveContentDir(customPath, options = { mustExist: true }) {
  let targetPath = customPath;

  if (!targetPath) {
    targetPath = extractArgValue(process.argv);
  }

  if (!targetPath && process.env.CONTENT_DIR) {
    targetPath = process.env.CONTENT_DIR;
  }

  const resolved = targetPath
    ? path.resolve(process.cwd(), targetPath)
    : DEFAULT_CONTENT_DIR;

  if (options.mustExist && !fs.existsSync(resolved)) {
    throw new Error(`Content directory does not exist at: ${resolved}`);
  }

  return resolved;
}
