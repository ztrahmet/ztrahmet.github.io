import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError, formatAjvErrors } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMAS_DIR = path.resolve(__dirname, '../schemas');

/**
 * Loads and parses a JSON schema file from disk.
 * @param {string} filePath - Absolute path to JSON file
 * @returns {object} Parsed JSON schema object
 */
function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Schema file not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Creates and initializes a configured Ajv instance with all schemas loaded and compiled.
 * @returns {{ ajv: Ajv, validateData: Function, validateContent: Function, validateCollectionItem: Function }}
 */
export function createValidator() {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false
  });

  addFormats(ajv);

  // Load common & core schemas
  const commonDefs = readJson(path.join(SCHEMAS_DIR, 'common.defs.json'));
  const dataSchema = readJson(path.join(SCHEMAS_DIR, 'data.schema.json'));
  const contentSchema = readJson(path.join(SCHEMAS_DIR, 'content.schema.json'));

  // Load collection item schemas
  const blogItemSchema = readJson(path.join(SCHEMAS_DIR, 'collections/blog.item.json'));
  const projectItemSchema = readJson(path.join(SCHEMAS_DIR, 'collections/project.item.json'));
  const publicationItemSchema = readJson(path.join(SCHEMAS_DIR, 'collections/publication.item.json'));
  const certificateItemSchema = readJson(path.join(SCHEMAS_DIR, 'collections/certificate.item.json'));
  const awardItemSchema = readJson(path.join(SCHEMAS_DIR, 'collections/award.item.json'));

  // Register schemas in Ajv
  ajv.addSchema(commonDefs, 'common.defs.json');
  ajv.addSchema(dataSchema, 'data.schema.json');
  ajv.addSchema(contentSchema, 'content.schema.json');

  ajv.addSchema(blogItemSchema, 'blog.item.json');
  ajv.addSchema(projectItemSchema, 'project.item.json');
  ajv.addSchema(publicationItemSchema, 'publication.item.json');
  ajv.addSchema(certificateItemSchema, 'certificate.item.json');
  ajv.addSchema(awardItemSchema, 'award.item.json');

  // Pre-compile validators for fast execution
  const dataValidate = ajv.compile(dataSchema);
  const contentValidate = ajv.compile(contentSchema);

  const collectionItemValidators = {
    blog: ajv.compile(blogItemSchema),
    project: ajv.compile(projectItemSchema),
    publication: ajv.compile(publicationItemSchema),
    certificate: ajv.compile(certificateItemSchema),
    award: ajv.compile(awardItemSchema)
  };

  /**
   * Validates data.yaml payload against data.schema.json.
   * @param {object} data - Parsed data.yaml object
   * @param {string} [source='content/data.yaml'] - Source file identifier for error reporting
   * @returns {boolean} True if valid
   * @throws {ValidationError} If validation fails
   */
  function validateData(data, source = 'content/data.yaml') {
    const valid = dataValidate(data);
    if (!valid) {
      const msg = formatAjvErrors(dataValidate.errors, source);
      throw new ValidationError(msg, dataValidate.errors);
    }
    return true;
  }

  /**
   * Validates content.yaml payload against content.schema.json.
   * @param {object} content - Parsed content.yaml object
   * @param {string} [source='content/content.yaml'] - Source file identifier for error reporting
   * @returns {boolean} True if valid
   * @throws {ValidationError} If validation fails
   */
  function validateContent(content, source = 'content/content.yaml') {
    const valid = contentValidate(content);
    if (!valid) {
      const msg = formatAjvErrors(contentValidate.errors, source);
      throw new ValidationError(msg, contentValidate.errors);
    }
    return true;
  }

  /**
   * Validates a synthesized collection item against its specific collection item schema.
   * @param {'blog' | 'project' | 'publication' | 'certificate' | 'award'} collectionType - Collection name
   * @param {object} item - Synthesized collection item payload
   * @param {string} [source] - Source file identifier for error reporting
   * @returns {boolean} True if valid
   * @throws {ValidationError} If validation fails
   */
  function validateCollectionItem(collectionType, item, source = `Collection [${collectionType}] item '${item?.slug}'`) {
    const validator = collectionItemValidators[collectionType];
    if (!validator) {
      throw new ValidationError(`Unknown collection type '${collectionType}'`);
    }

    const valid = validator(item);
    if (!valid) {
      const msg = formatAjvErrors(validator.errors, source);
      throw new ValidationError(msg, validator.errors);
    }
    return true;
  }

  return {
    ajv,
    validateData,
    validateContent,
    validateCollectionItem
  };
}

let defaultValidator = null;

/**
 * Returns the shared singleton validator instance.
 * @returns {ReturnType<createValidator>}
 */
export function getValidator() {
  if (!defaultValidator) {
    defaultValidator = createValidator();
  }
  return defaultValidator;
}

/**
 * Validates data payload using default validator.
 * @param {object} data
 * @param {string} [source]
 * @returns {boolean}
 */
export function validateData(data, source) {
  return getValidator().validateData(data, source);
}

/**
 * Validates content payload using default validator.
 * @param {object} content
 * @param {string} [source]
 * @returns {boolean}
 */
export function validateContent(content, source) {
  return getValidator().validateContent(content, source);
}

/**
 * Validates collection item payload using default validator.
 * @param {string} type
 * @param {object} item
 * @param {string} [source]
 * @returns {boolean}
 */
export function validateCollectionItem(type, item, source) {
  return getValidator().validateCollectionItem(type, item, source);
}
