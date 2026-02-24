/**
 * Unit tests for ZTMApiError sanitization
 *
 * Tests defense against sensitive information leakage in authentication error responses.
 */

import { describe, it, expect } from 'vitest';
import { ZTMApiError } from './errors.js';

describe('ZTMApiError sanitization', () => {
  describe('401 Unauthorized response body', () => {
    it('should truncate long response bodies to 500 chars', () => {
      const longBody = 'x'.repeat(1000);
      const error = new ZTMApiError({
        method: 'GET',
        path: '/api/chat',
        statusCode: 401,
        responseBody: longBody,
      });

      const preview = error.context.responseBodyPreview as string;
      expect(preview.length).toBeLessThanOrEqual(500);
    });

    it('should not contain raw response body in message', () => {
      const error = new ZTMApiError({
        method: 'GET',
        path: '/api/chat',
        statusCode: 401,
        statusText: 'Unauthorized',
        responseBody: 'Detailed error info',
      });

      expect(error.message).not.toContain('Detailed error info');
    });
  });

  describe('403 Forbidden response body', () => {
    it('should truncate long response bodies to 500 chars', () => {
      const longBody = 'y'.repeat(1000);
      const error = new ZTMApiError({
        method: 'GET',
        path: '/api/chat',
        statusCode: 403,
        responseBody: longBody,
      });

      const preview = error.context.responseBodyPreview as string;
      expect(preview.length).toBeLessThanOrEqual(500);
    });
  });

  describe('response body handling', () => {
    it('should store response body preview in context', () => {
      const body = 'Error: invalid token';
      const error = new ZTMApiError({
        method: 'GET',
        path: '/api/chat',
        statusCode: 401,
        responseBody: body,
      });

      const preview = error.context.responseBodyPreview as string;
      expect(preview).toBe(body);
    });

    it('should truncate very long response bodies', () => {
      const longBody = 'x'.repeat(1000);
      const error = new ZTMApiError({
        method: 'GET',
        path: '/api/chat',
        statusCode: 401,
        responseBody: longBody,
      });

      const preview = error.context.responseBodyPreview as string;
      expect(preview.length).toBe(500);
      expect(preview).toBe('x'.repeat(500));
    });
  });
});
