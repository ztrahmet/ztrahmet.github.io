#!/usr/bin/env node

import path from 'node:path';
import Eleventy from '@11ty/eleventy';
import { loadEngineData } from './pipeline/data-loader.js';
import { extractArgValue, resolveContentDir, PROJECT_ROOT } from './config/paths.js';
import { writeSearchIndexFile } from './search/search-indexer.js';

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

/**
 * Main CLI entry point.
 */
async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const KNOWN_COMMANDS = ['build', 'dev', 'serve', 'validate'];
  let command = null;
  let positionalPath = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('-')) {
      const isValueFlag = ['-c', '--content', '--content-dir', '-o', '--output', '-p', '--port'].includes(arg);
      if (isValueFlag && i + 1 < rawArgs.length) {
        i++;
      }
      continue;
    }

    if (!command && KNOWN_COMMANDS.includes(arg)) {
      command = arg === 'serve' ? 'dev' : arg;
    } else if (!positionalPath) {
      positionalPath = arg;
    }
  }

  if (!command) {
    command = 'build';
  }

  const explicitContentDir = positionalPath || extractArgValue(rawArgs);

  try {
    const targetDir = resolveContentDir(explicitContentDir);
    process.env.CONTENT_DIR = targetDir;

    if (command === 'validate') {
      console.log(`🔍 Validating content data in: ${targetDir}`);
      const data = loadEngineData(targetDir);

      console.log('✅ Validation passed successfully!\n');
      console.log('📊 Summary:');
      console.log(`  • Content Dir: ${data.contentDir}`);
      console.log(`  • Site: "${data.site.title}" (${data.site.url})`);
      console.log(`  • Profile: ${data.profile.name} (@${data.profile.handle})`);
      console.log(`  • Experience entries: ${data.profile.experience?.length || 0}`);
      console.log(`  • Education entries: ${data.profile.education?.length || 0}`);
      console.log(`  • Collections:`);
      for (const [col, items] of Object.entries(data.collections)) {
        const mdCount = items.filter((i) => i.hasMarkdown).length;
        const inlineCount = items.length - mdCount;
        console.log(`    - ${col}: ${items.length} items (${mdCount} markdown-driven, ${inlineCount} inline-driven)`);
      }
      console.log(`  • Pinned items: ${data.pinned_items.length} resolved`);
      console.log(`  • Search index: ${data.search_index.totalRecords} records indexed`);
      process.exit(0);
    }

    if (command === 'build') {
      console.log(`🔨 Building static site with content from: ${targetDir}`);
      const data = loadEngineData(targetDir);

      const outputDirName = extractArgValue(rawArgs, ['--output', '-o']) || '_site';
      const elev = new Eleventy('theme', outputDirName, {
        configPath: 'eleventy.config.js'
      });

      await elev.init();
      await elev.write();

      // Ensure search-index.json is written
      const absOutputDir = path.resolve(PROJECT_ROOT, outputDirName);
      writeSearchIndexFile(data, path.join(absOutputDir, 'search-index.json'));

      console.log(`\n✅ Build complete! Static site and search-index.json generated in '${outputDirName}'.`);
      process.exit(0);
    }

    if (command === 'dev') {
      console.log(`🚀 Starting local development server with content from: ${targetDir}`);
      loadEngineData(targetDir);

      const outputDir = extractArgValue(rawArgs, ['--output', '-o']) || '_site';
      const port = parseInt(extractArgValue(rawArgs, ['--port', '-p']) || '8080', 10);

      const elev = new Eleventy('theme', outputDir, {
        configPath: 'eleventy.config.js'
      });

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
