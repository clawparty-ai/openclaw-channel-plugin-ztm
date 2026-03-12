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
// Username Normalization
// ============================================

/**
 * Normalize a username for consistent comparison
 * Trims whitespace and converts to lowercase
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
 * Validate a URL string and return a Result
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
  ];

  const lowerInput = input.toLowerCase();
  return pathTraversalPatterns.some(pattern => lowerInput.includes(pattern));
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
