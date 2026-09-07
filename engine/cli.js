#!/usr/bin/env node

import Eleventy from '@11ty/eleventy';
import { loadEngineData } from './pipeline/data-loader.js';
import { extractArgValue, resolveContentDir } from './config/paths.js';

const KNOWN_COMMANDS = ['build', 'dev', 'serve', 'validate'];
const VALUE_FLAGS = ['-c', '--content', '--content-dir', '-o', '--output', '-p', '--port'];

/**
 * Displays CLI usage and available commands.
 */
function printHelp() {
  console.log(`
Usage:
  node engine/cli.js <command> [content-dir] [options]
  npm run <command> -- [content-dir] [options]

Commands:
  build [path]      Validate data and build static site (default if omitted)
  dev [path]        Start live-reload development server
  validate [path]   Validate data and synthesize collections without building

Options:
  -c, --content <dir>       Path to custom content directory
      --content-dir <dir>   Path to custom content directory
  -o, --output <dir>        Output directory for static site (default: _site)
  -p, --port <number>       Port for local dev server (default: 8080)
  -h, --help                Show help information

Examples:
  npm run build
  npm run build -- ./custom-content
  npm run dev -- ./custom-content
  npm run validate -- ./custom-content
`);
}

import { parseArgs as parseUtilArgs } from 'node:util';

/**
 * Parses CLI arguments into structured command, paths, and flags using Node's native parser.
 * @param {Array<string>} rawArgs - Raw CLI arguments
 * @returns {{ command: string, contentDir: string|null, outputDir: string, port: number, help: boolean }}
 */
function parseCliArgs(rawArgs) {
  const { values, positionals } = parseUtilArgs({
    args: rawArgs,
    options: {
      content: { type: 'string', short: 'c' },
      'content-dir': { type: 'string' },
      output: { type: 'string', short: 'o', default: '_site' },
      port: { type: 'string', short: 'p', default: '8080' },
      help: { type: 'boolean', short: 'h', default: false }
    },
    allowPositionals: true,
    strict: false
  });

  const KNOWN_COMMANDS = new Set(['build', 'dev', 'serve', 'validate']);
  let command = 'build';
  let positionalPath = null;

  if (positionals.length > 0) {
    if (KNOWN_COMMANDS.has(positionals[0])) {
      command = positionals[0] === 'serve' ? 'dev' : positionals[0];
      positionalPath = positionals[1] || null;
    } else {
      positionalPath = positionals[0];
    }
  }

  const contentDir = positionalPath || values.content || values['content-dir'] || extractArgValue(rawArgs);

  return {
    command,
    contentDir,
    outputDir: values.output || '_site',
    port: parseInt(values.port || '8080', 10),
    help: Boolean(values.help)
  };
}

/**
 * Prints a human-readable summary of a compiled dataset.
 * @param {object} data - Engine dataset
 */
function printSummary(data) {
  console.log('✅ Validation passed successfully!\n');
  console.log('📊 Summary:');
  console.log(`  • Content Dir: ${data.contentDir}`);
  console.log(`  • Site: "${data.site.title}" (${data.site.url})`);
  console.log(`  • Profile: ${data.profile.name} (@${data.profile.handle})`);
  console.log(`  • Experience entries: ${data.profile.experience?.length || 0}`);
  console.log(`  • Education entries: ${data.profile.education?.length || 0}`);
  console.log('  • Collections:');

  for (const [name, counts] of Object.entries(data.stats.collections)) {
    console.log(`    - ${name}: ${counts.total} items (${counts.markdown} markdown-driven, ${counts.inline} inline-driven)`);
  }

  console.log(`  • Pinned items: ${data.pinned_items.length} resolved`);
  console.log(`  • Skills indexed: ${data.stats.totalSkills} unique`);
  console.log(`  • Search index: ${data.search_index.totalRecords} records indexed`);
}

/**
 * Creates a configured Eleventy instance for the resolved output directory.
 * @param {string} outputDir - Output directory
 * @returns {Eleventy} Eleventy instance
 */
function createEleventy(outputDir) {
  return new Eleventy('theme', outputDir, { configPath: 'eleventy.config.js' });
}

/**
 * Main CLI entry point.
 */
async function main() {
  const rawArgs = process.argv.slice(2);
  const { command, contentDir, outputDir, port, help } = parseCliArgs(rawArgs);

  if (help) {
    printHelp();
    process.exit(0);
  }

  try {
    const targetDir = resolveContentDir(contentDir);
    process.env.CONTENT_DIR = targetDir;

    if (command === 'validate') {
      console.log(`🔍 Validating content data in: ${targetDir}`);
      printSummary(loadEngineData(targetDir));
      process.exit(0);
    }

    if (command === 'build') {
      console.log(`🔨 Building static site with content from: ${targetDir}`);
      const elev = createEleventy(outputDir);

      await elev.init();
      await elev.write();

      console.log(`\n✅ Build complete! Static site and search-index.json generated in '${outputDir}'.`);
      process.exit(0);
    }

    if (command === 'dev') {
      console.log(`🚀 Starting local development server with content from: ${targetDir}`);
      const elev = createEleventy(outputDir);

      await elev.init();
      await elev.watch();
      await elev.serve(port);
    }
  } catch (err) {
    console.error('\n❌ Build/Validation Error:');
    console.error(err.message);
    process.exit(1);
  }
}

main();
