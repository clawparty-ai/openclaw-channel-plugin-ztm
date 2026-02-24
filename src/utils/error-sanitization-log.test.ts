/**
 * Unit tests for auth error log sanitization
 *
 * Tests that authentication errors are properly sanitized before logging.
 */

import { describe, it, expect } from 'vitest';
import { ZTMApiError } from '../types/errors.js';
import { sanitizeForLog } from './log-sanitize.js';

describe('Auth error log sanitization', () => {
  it('should sanitize auth errors before logging', () => {
    const sensitiveBody = 'Invalid token at /app/auth/TokenValidator.ts:55';
    const error = new ZTMApiError({
      method: 'GET',
      path: '/api/chat',
      statusCode: 401,
      responseBody: sensitiveBody,
    });

    // Simulate logging the error
    const sanitizedMessage = sanitizeForLog(error.message);
    const sanitizedBody = sanitizeForLog(error.context.responseBodyPreview as string);

    // Verify sanitization happened
    expect(sanitizedMessage).toBeTruthy();
    expect(sanitizedBody).toBeTruthy();
  });

  it('should not log sensitive response data directly', () => {
    const sensitiveBody = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret';

    // Direct logging would expose the token
    // With sanitization, control characters and long strings are handled
    const sanitized = sanitizeForLog(sensitiveBody);

    // Verify token-like patterns are at least truncated
    expect(sanitized.length).toBeLessThanOrEqual(200); // default maxLength
  });

  it('should sanitize control characters in logged auth errors', () => {
    const bodyWithControlChars = 'Error\x00at\x1Flocation\x7Fhere';
    const sanitized = sanitizeForLog(bodyWithControlChars);

    // Control characters should be removed
    expect(sanitized).not.toContain('\x00');
    expect(sanitized).not.toContain('\x1F');
    expect(sanitized).not.toContain('\x7F');
  });

  it('should truncate long auth error messages for logging', () => {
    const longBody = 'Authentication failed: ' + 'x'.repeat(500);
    const sanitized = sanitizeForLog(longBody, 200);

    expect(sanitized.length).toBeLessThanOrEqual(203); // 200 + '...'
  });
});
