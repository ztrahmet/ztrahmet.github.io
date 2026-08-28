/**
 * Custom ValidationError class and Ajv error formatting utilities
 */

export class ValidationError extends Error {
  /**
   * @param {string} message - Formatted human-readable error message
   * @param {Array<object>} [details=[]] - Raw Ajv error objects
   */
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Converts a JSON Pointer instancePath to human-readable dot notation.
 * e.g. "/profile/experience/0/start" -> "profile.experience[0].start"
 * @param {string} instancePath - JSON Pointer path from Ajv
 * @returns {string} Human-readable property path
 */
export function formatInstancePath(instancePath) {
  if (!instancePath || instancePath === '/') return 'root';
  return instancePath
    .replace(/^\//, '')
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
    .join('')
    .replace(/^\./, '');
}

/**
 * Formats a list of Ajv errors into a clear, descriptive multi-line error message.
 * @param {Array<import('ajv').ErrorObject>} errors - Ajv error objects
 * @param {string} [source='Data'] - Source file or entity identifier
 * @returns {string} Formatted error string
 */
export function formatAjvErrors(errors, source = 'Data') {
  if (!errors || errors.length === 0) {
    return `${source} validation failed with unknown error.`;
  }

  const lines = [`[Schema Validation Failed] in ${source}:`];

  for (const err of errors) {
    const path = formatInstancePath(err.instancePath);
    let detail = '';

    switch (err.keyword) {
      case 'required':
        detail = `Missing required property '${err.params.missingProperty}'`;
        break;
      case 'additionalProperties':
        detail = `Unexpected property '${err.params.additionalProperty}' is not allowed`;
        break;
      case 'enum':
        detail = `Value must be one of: [${err.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}]`;
        break;
      case 'pattern':
        detail = `Value does not match required format (pattern: ${err.params.pattern})`;
        break;
      case 'type':
        detail = `Expected type '${err.params.type}', received '${typeof err.data}'`;
        break;
      case 'minLength':
        detail = `String is too short (minimum length is ${err.params.limit})`;
        break;
      default:
        detail = err.message || 'Invalid value';
        break;
    }

    const valueSnippet = err.data !== undefined ? ` (received: ${JSON.stringify(err.data)})` : '';
    lines.push(`  • at '${path}': ${detail}${valueSnippet}`);
  }

  return lines.join('\n');
}
