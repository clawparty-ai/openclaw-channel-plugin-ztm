/**
 * Input validation utilities
 * @module utils/validation
 *
 * Provides input validation and sanitization for:
 * - URL validation (http/https)
 * - Username and group ID format
 * - Group name validation
 * - Message content validation
 * - Path traversal detection
 * - HTML escaping for XSS prevention
 *
 * Security features:
 * - Path traversal attack detection
 * - XSS prevention via HTML escaping
 * - URL protocol validation
 * - Length limits to prevent DoS
 *
 * @example
 * import { validateUsername, validateGroupId, validateUrl, escapeHtml } from './utils/validation.js';
 *
 * // Validate username
 * const result = validateUsername('user_123');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * // Escape HTML
 * const safe = escapeHtml('<script>alert("xss")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */

import type { ConfigValidationError, ValidationErrorReason } from '../types/config.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import { logger } from './logger.js';

// ============================================
// Pattern Constants (centralized definitions)
// ============================================

/** Pattern for valid usernames and mesh names: Unicode letters, numbers, emoji, hyphens, underscores */
export const IDENTIFIER_PATTERN = /^[\p{L}\p{N}_-][\p{L}\p{N}\p{Extended_Pictographic}_-]*$/u;

/** Maximum length for usernames (prevents DoS from overly long names) */
export const MAX_USERNAME_LENGTH = 256;

/** Maximum length for group IDs (prevents DoS from overly long IDs) */
export const MAX_GROUP_ID_LENGTH = 256;

// ============================================
// Validation Result Types
// ============================================

/**
 * Result of input validation
 */
export type ValidationResult<T = void> =
  | { valid: true; value: T }
  | { valid: false; error: string };

// ============================================
// String Utilities
// ============================================

/**
 * Check if a string is empty (null, undefined, or whitespace-only)
 * Provides consistent empty string detection across the codebase
 *
 * @param value - The value to check
 * @returns true if the string is null, undefined, or contains only whitespace
 *
 * @example
 * ```typescript
 * isEmptyString('')        // Returns: true
 * isEmptyString('   ')     // Returns: true
 * isEmptyString(null)      // Returns: true
 * isEmptyString('hello')   // Returns: false
 * ```
 *
 * @complexity O(n) - Where n is the string length (trim operation)
 * @since 2026.3.13
 */
export function isEmptyString(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length === 0;
}

// ============================================
// Username Normalization
// ============================================

/**
 * Normalize a username for consistent comparison
 * Trims whitespace and converts to lowercase
 *
 * @param username - The username to normalize
 * @returns Normalized username (trimmed and lowercase)
 *
 * @example
 * ```typescript
 * normalizeUsername('  Alice  '); // Returns: 'alice'
 * normalizeUsername('Bob');       // Returns: 'bob'
 * ```
 *
 * @complexity O(n) - Where n is the string length (trim + lowercase)
 * @performance Used for case-insensitive username comparison
 * @since 2026.3.13
 * @see {@link validateUsername} For username validation with format checking
 */
export function normalizeUsername(username: string): string {
  if (typeof username !== 'string') return '';
  return username.trim().toLowerCase();
}

// ============================================
// Input Sanitization
// ============================================

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * This provides defense-in-depth for cases where user input
 * might be rendered in HTML contexts (logs, web UIs, etc.)
 *
 * @param input - The string to escape
 * @returns HTML-escaped string
 *
 * @example
 * ```typescript
 * const safe = escapeHtml('<script>alert("xss")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 * ```
 *
 * @complexity O(n) - Where n is the string length (single pass with multiple replacements)
 * @security Prevents XSS attacks by escaping HTML metacharacters
 * @since 2026.3.13
 * @see {@link https://owasp.org/www-community/attacks/xss/} OWASP XSS Prevention Cheat Sheet
 */
export function escapeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// Validation Error Factory
// ============================================

/**
 * Create a validation error for a specific field
 *
 * Factory function that creates a ConfigValidationError object
 * with consistent structure for validation failures.
 *
 * @param field - The field name that failed validation
 * @param reason - The validation error reason code
 * @param value - The invalid value that was provided
 * @param message - Human-readable error message
 * @returns ConfigValidationError object
 *
 * @example
 * ```typescript
 * const error = validationError('url', 'invalid_format', 'not-a-url', 'Invalid URL format');
 * // Returns: { field: 'url', reason: 'invalid_format', value: 'not-a-url', message: 'Invalid URL format' }
 * ```
 *
 * @complexity O(1) - Constant time object creation
 * @since 2026.3.13
 */
export function validationError(
  field: string,
  reason: ValidationErrorReason,
  value: unknown,
  message: string
): ConfigValidationError {
  return { field, reason, value, message };
}

/**
 * Validate a URL string and return whether it's valid
 *
 * Checks if a string is a valid http:// or https:// URL.
 * Rejects URLs with control characters for security.
 *
 * @param value - The URL string to validate
 * @returns true if the URL is valid and uses http/https protocol
 *
 * @example
 * ```typescript
 * isValidUrl('https://example.com');  // Returns: true
 * isValidUrl('ftp://example.com');    // Returns: false
 * isValidUrl('not a url');           // Returns: false
 * ```
 *
 * @complexity O(n) - Where n is the URL string length (URL parsing)
 * @security Rejects control characters to prevent URL smuggling attacks
 * @since 2026.3.13
 * @see {@link validateUrl} For validation that returns detailed error
 * @see {@link validateHttpsUrl} For HTTPS-only validation
 */
export function isValidUrl(value: string): boolean {
  // Reject URLs with control characters (security: prevent URL smuggling)
  if (/[\n\r\t]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate a URL string and return a Result type
 *
 * Validates URL format using the URL constructor and returns
 * a structured Result with detailed error information on failure.
 *
 * @param url - The URL string to validate
 * @returns Result with valid URL or ConfigValidationError
 *
 * @example
 * ```typescript
 * const result = validateUrl('https://example.com');
 * if (result.valid) {
 *   console.log('Valid URL:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the URL string length (URL parsing)
 * @since 2026.3.13
 * @see {@link isValidUrl} For boolean URL validation
 * @see {@link validateHttpsUrl} For HTTPS-only validation
 */
export function validateUrl(
  url: string
): { valid: true; value: string } | { valid: false; error: ConfigValidationError } {
  try {
    new URL(url);
    return { valid: true, value: url };
  } catch {
    return {
      valid: false,
      error: validationError('url', 'invalid_format', url, 'Invalid URL format'),
    };
  }
}

/**
 * Validate a URL must start with http:// or https://
 *
 * Enforces protocol checking to ensure URLs use secure (HTTPS) or
 * standard HTTP protocols. Prevents javascript: and other dangerous protocols.
 *
 * @param url - The URL string to validate
 * @returns Result with valid URL or ConfigValidationError
 *
 * @example
 * ```typescript
 * const result = validateHttpsUrl('https://example.com');
 * if (result.valid) {
 *   console.log('Valid HTTPS URL:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the URL string length (startsWith check + URL parsing)
 * @security Prevents javascript: and other dangerous URL protocols
 * @since 2026.3.13
 * @see {@link validateUrl} For general URL validation
 * @see {@link isValidUrl} For boolean URL validation
 */
export function validateHttpsUrl(
  url: string
): { valid: true; value: string } | { valid: false; error: ConfigValidationError } {
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return {
      valid: false,
      error: validationError(
        'url',
        'invalid_format',
        url,
        'URL must start with https:// or http://'
      ),
    };
  }
  return validateUrl(url);
}

// ============================================
// API Input Validation
// ============================================

/**
 * Check for path traversal patterns in a string
 * Detects attempts to access parent directories using ../ or ..\
 *
 * @param input - String to check for path traversal
 * @returns true if path traversal detected, false otherwise
 *
 * @example
 * ```typescript
 * containsPathTraversal('../../../etc/passwd');  // Returns: true
 * containsPathTraversal('safe-file.txt');        // Returns: false
 * ```
 *
 * @complexity O(n * m) - Where n is input length, m is number of patterns
 * @security Detects both direct and URL-encoded path traversal attempts
 * @since 2026.3.13
 * @see {@link validateUsername} For username validation with path traversal check
 * @see {@link validateGroupId} For group ID validation with path traversal check
 */
export function containsPathTraversal(input: string): boolean {
  // Check for common path traversal patterns
  const pathTraversalPatterns = [
    '../', // Unix parent directory
    '..\\', // Windows parent directory
    '%2e%2e', // URL encoded ../
    '%2e%2e%2f', // URL encoded ../
    '%2e%2e%5c', // URL encoded ..\
    '..%2f', // Mixed encoding
    '..%5c', // Mixed encoding
    '%252e%252e', // Double-encoded ../ (defense against multiple URL decode passes)
    '%252e%252e%252f', // Double-encoded ../
    '%252e%252e%255c', // Double-encoded ..\
  ];

  const lowerInput = input.toLowerCase();
  return pathTraversalPatterns.some(pattern => lowerInput.includes(pattern));
}

/**
 * Check if input contains path separators (forward or backslash)
 * Used for validating identifiers that should not contain paths
 *
 * @param input - String to check
 * @returns true if path separator detected, false otherwise
 *
 * @example
 * ```typescript
 * containsPathSeparator('path/to/file');  // Returns: true
 * containsPathSeparator('username');       // Returns: false
 * ```
 *
 * @complexity O(n) - Where n is the string length (includes check)
 * @since 2026.3.13
 * @see {@link containsPathTraversal} For more comprehensive path traversal detection
 */
export function containsPathSeparator(input: string): boolean {
  return input.includes('/') || input.includes('\\');
}

/**
 * Validate a peer username format
 * Checks for:
 * - Non-empty string
 * - Length within bounds
 * - Valid identifier pattern (alphanumeric, hyphens, underscores)
 * - No path traversal patterns
 *
 * @param username - Username to validate
 * @returns Validation result with sanitized username or error message
 *
 * @example
 * ```typescript
 * const result = validateUsername('alice_123');
 * if (result.valid) {
 *   console.log('Valid username:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the username length (trim + pattern check)
 * @security Validates against path traversal and enforces length limits
 * @since 2026.3.13
 * @see {@link normalizeUsername} For username normalization
 * @see {@link containsPathTraversal} For path traversal detection logic
 */
export function validateUsername(username: string): ValidationResult<string> {
  // Check for empty username
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username must be a non-empty string' };
  }

  const trimmed = username.trim();

  // Check for empty after trimming
  if (trimmed.length === 0) {
    return { valid: false, error: 'Username cannot be empty or whitespace only' };
  }

  // Check length
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return {
      valid: false,
      error: `Username exceeds maximum length of ${MAX_USERNAME_LENGTH} characters`,
    };
  }

  // Check for path traversal
  if (containsPathTraversal(trimmed)) {
    logger.warn(
      `[Security] Rejected username with path traversal pattern: "${trimmed.substring(0, 50)}"`
    );
    return { valid: false, error: 'Username contains invalid path traversal patterns' };
  }

  // Check identifier pattern
  if (!IDENTIFIER_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Username must contain only alphanumeric characters, hyphens, and underscores',
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate a group ID format
 * Checks for:
 * - Non-empty string
 * - Length within bounds
 * - Valid identifier pattern (alphanumeric, hyphens, underscores)
 * - No path traversal patterns
 *
 * @param groupId - Group ID to validate
 * @returns Validation result with sanitized group ID or error message
 *
 * @example
 * ```typescript
 * const result = validateGroupId('team-chat-123');
 * if (result.valid) {
 *   console.log('Valid group ID:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the group ID length (trim + pattern check)
 * @security Validates against path traversal and enforces length limits
 * @since 2026.3.13
 * @see {@link validateGroupName} For group name validation (allows spaces)
 * @see {@link containsPathTraversal} For path traversal detection logic
 */
export function validateGroupId(groupId: string): ValidationResult<string> {
  // Check for empty group ID
  if (!groupId || typeof groupId !== 'string') {
    return { valid: false, error: 'Group ID must be a non-empty string' };
  }

  const trimmed = groupId.trim();

  // Check for empty after trimming
  if (trimmed.length === 0) {
    return { valid: false, error: 'Group ID cannot be empty or whitespace only' };
  }

  // Check length
  if (trimmed.length > MAX_GROUP_ID_LENGTH) {
    return {
      valid: false,
      error: `Group ID exceeds maximum length of ${MAX_GROUP_ID_LENGTH} characters`,
    };
  }

  // Check for path traversal
  if (containsPathTraversal(trimmed)) {
    logger.warn(
      `[Security] Rejected group ID with path traversal pattern: "${trimmed.substring(0, 50)}"`
    );
    return { valid: false, error: 'Group ID contains invalid path traversal patterns' };
  }

  // Check identifier pattern
  if (!IDENTIFIER_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Group ID must contain only alphanumeric characters, hyphens, and underscores',
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Pattern for valid group names: Unicode letters, numbers, spaces, and common punctuation
 * Includes Thai script explicitly as some engines may not recognize Thai as \p{L}
 */
const GROUP_NAME_PATTERN = /^[\p{L}\p{N}\s\-_.,!?()[\]\p{Script_Extensions=Thai}]+$/u;

/**
 * Validate a group name format
 * Similar to username but allows spaces and more punctuation
 *
 * @param name - Group name to validate
 * @returns Validation result with sanitized group name or error message
 *
 * @example
 * ```typescript
 * const result = validateGroupName('Team Chat Room');
 * if (result.valid) {
 *   console.log('Valid group name:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the name length (trim + pattern check)
 * @security Validates against path traversal and enforces length limits
 * @since 2026.3.13
 * @see {@link validateGroupId} For group ID validation (stricter format)
 * @see {@link containsPathTraversal} For path traversal detection logic
 */
export function validateGroupName(name: string): ValidationResult<string> {
  // Check for empty name
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Group name must be a non-empty string' };
  }

  const trimmed = name.trim();

  // Check for empty after trimming
  if (trimmed.length === 0) {
    return { valid: false, error: 'Group name cannot be empty or whitespace only' };
  }

  // Check length (group names can be longer)
  if (trimmed.length > MAX_GROUP_ID_LENGTH) {
    return {
      valid: false,
      error: `Group name exceeds maximum length of ${MAX_GROUP_ID_LENGTH} characters`,
    };
  }

  // Check for path traversal
  if (containsPathTraversal(trimmed)) {
    logger.warn(
      `[Security] Rejected group name with path traversal pattern: "${trimmed.substring(0, 50)}"`
    );
    return { valid: false, error: 'Group name contains invalid path traversal patterns' };
  }

  // Check identifier pattern - allow Unicode letters, numbers, spaces, and common punctuation
  if (!GROUP_NAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Group name contains invalid characters',
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate message content before sending or processing
 * Checks for:
 * - Non-empty string
 * - Length within MAX_MESSAGE_LENGTH bounds
 * - No null bytes (potential injection vector)
 *
 * @param content - Message content to validate
 * @returns Validation result with original content or error message
 *
 * @example
 * ```typescript
 * const result = validateMessageContent('Hello, world!');
 * if (result.valid) {
 *   console.log('Valid message:', result.value);
 * }
 * ```
 *
 * @complexity O(n) - Where n is the content length (null byte check + length check)
 * @security Rejects null bytes that could be injection vectors
 * @since 2026.3.13
 * @see {@link MAX_MESSAGE_LENGTH} For message length limit constant
 */
export function validateMessageContent(content: string): ValidationResult<string> {
  // Check for empty content
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a non-empty string' };
  }

  // Check for null bytes (potential injection vector)
  if (content.includes('\0')) {
    logger.warn(`[Security] Rejected message content containing null bytes`);
    return { valid: false, error: 'Message content contains invalid null bytes' };
  }

  // Check length
  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return { valid: true, value: content };
}
