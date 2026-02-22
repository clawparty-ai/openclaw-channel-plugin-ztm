/**
 * @fileoverview Log sanitization utilities
 * @module utils/log-sanitize
 *
 * Protects against CWE-117: Improper Output Neutralization for Logs.
 * Removes or escapes control characters that could break log parsers
 * or allow log injection attacks.
 *
 * Security: These utilities prevent log injection attacks by sanitizing:
 * - Newlines and carriage returns
 * - Control characters (ASCII 0x00-0x1F, 0x7F)
 * - Multiple whitespace
 */

// Log sanitization utilities

/**
 * Sanitize a string for safe logging by removing or escaping control characters
 * that could break log parsers or allow log injection attacks.
 *
 * @param input - The string to sanitize
 * @param maxLength - Maximum length to truncate to (default: 200)
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLog(input: string, maxLength = 200): string {
  if (input === null || input === undefined) {
    return '';
  }

  const str = String(input);

  // Remove newlines, carriage returns, and other control characters
  // that could allow log injection or break log parsers
  const sanitized = str
    .replace(/[\r\n\t\v\f]/g, ' ') // Replace control chars with space
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove remaining control chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Truncate to prevent excessively long log entries
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

/**
 * Sanitize an object for safe logging by recursively sanitizing string values
 *
 * @param obj - The object to sanitize
 * @param maxLength - Maximum length for string values
 * @returns Object with sanitized string values
 */
export function sanitizeObjectForLog<T extends Record<string, unknown>>(
  obj: T,
  maxLength = 200
): T {
  const sanitized = { ...obj };

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      (sanitized as Record<string, unknown>)[key] = sanitizeForLog(value, maxLength);
    } else if (typeof value === 'object' && value !== null) {
      (sanitized as Record<string, unknown>)[key] = sanitizeObjectForLog(
        value as Record<string, unknown>,
        maxLength
      );
    }
  }

  return sanitized;
}
