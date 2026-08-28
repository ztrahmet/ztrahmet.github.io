import fs from 'node:fs';
import { load, CORE_SCHEMA } from 'js-yaml';

/**
 * Loads and parses a YAML file, preserving date representations as strings.
 * @param {string} filePath - Absolute or relative path to the YAML file
 * @returns {object} Parsed JavaScript object
 * @throws {Error} If the file does not exist or contains invalid YAML
 */
export function loadYamlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`YAML file not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseYamlString(raw, filePath);
}

/**
 * Parses a YAML string, preserving date strings without converting to JavaScript Date objects.
 * @param {string} yamlString - Raw YAML string
 * @param {string} [source='YAML input'] - Source identifier for error reporting
 * @returns {object} Parsed JavaScript object
 * @throws {Error} If the string contains invalid YAML syntax
 */
export function parseYamlString(yamlString, source = 'YAML input') {
  if (typeof yamlString !== 'string' || !yamlString.trim()) {
    return {};
  }

  try {
    const data = load(yamlString, {
      schema: CORE_SCHEMA,
      filename: source
    });
    return data || {};
  } catch (err) {
    throw new Error(`Failed to parse YAML from ${source}: ${err.message}`);
  }
}
