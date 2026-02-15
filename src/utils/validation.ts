import type { ConfigValidationError, ValidationErrorReason } from "../types/config.js";

// ============================================
// Pattern Constants (centralized definitions)
// ============================================

/** Pattern for valid usernames and mesh names: alphanumeric, hyphens, underscores */
export const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

// ============================================
// Username Normalization
// ============================================

/**
 * Normalize a username for consistent comparison
 * Trims whitespace and converts to lowercase
 */
export function normalizeUsername(username: string): string {
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
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
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
      error: validationError("url", "invalid_format", url, "Invalid URL format"),
    };
  }
}

/**
 * Validate a URL must start with http:// or https://
 */
export function validateHttpsUrl(
  url: string
): { valid: true; value: string } | { valid: false; error: ConfigValidationError } {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return {
      valid: false,
      error: validationError(
        "url",
        "invalid_format",
        url,
        "URL must start with https:// or http://"
      ),
    };
  }
  return validateUrl(url);
}
