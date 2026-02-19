// Unit tests for Error Utilities

import { describe, it, expect } from 'vitest';
import { extractErrorMessage, extractErrorStack, wrapError } from './error.js';

describe('Error Utilities', () => {
  describe('extractErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      expect(extractErrorMessage(error)).toBe('Test error message');
    });

    it('should extract message from Error with custom name', () => {
      const error = new Error('Custom error');
      error.name = 'CustomError';
      expect(extractErrorMessage(error)).toBe('Custom error');
    });

    it('should handle string error', () => {
      expect(extractErrorMessage('String error')).toBe('String error');
    });

    it('should handle null', () => {
      expect(extractErrorMessage(null)).toBe('null');
    });

    it('should handle undefined', () => {
      expect(extractErrorMessage(undefined)).toBe('undefined');
    });

    it('should handle number', () => {
      expect(extractErrorMessage(404)).toBe('404');
    });

    it('should handle object', () => {
      const obj = { code: 'ERR001', reason: 'Test' };
      expect(extractErrorMessage(obj)).toBe('[object Object]');
    });

    it('should handle object with toString', () => {
      const obj = {
        toString() {
          return 'Custom toString result';
        },
      };
      expect(extractErrorMessage(obj)).toBe('Custom toString result');
    });

    it('should handle empty string', () => {
      expect(extractErrorMessage('')).toBe('');
    });

    it('should handle boolean false', () => {
      expect(extractErrorMessage(false)).toBe('false');
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      expect(extractErrorMessage(sym)).toBe('Symbol(test)');
    });

    it('should handle complex error with nested cause', () => {
      const innerError = new Error('Inner error');
      const outerError = new Error('Outer error');
      outerError.cause = innerError;

      expect(extractErrorMessage(outerError)).toBe('Outer error');
    });
  });

  describe('extractErrorStack', () => {
    it('should extract stack from Error instance', () => {
      const error = new Error('Test error');
      const stack = extractErrorStack(error);

      expect(stack).toBeDefined();
      expect(stack).toContain('Test error');
    });

    it('should return undefined for non-Error', () => {
      expect(extractErrorStack('string error')).toBeUndefined();
      expect(extractErrorStack(null)).toBeUndefined();
      expect(extractErrorStack(undefined)).toBeUndefined();
      expect(extractErrorStack({})).toBeUndefined();
    });

    it('should handle Error without stack', () => {
      const error = new Error('No stack');
      // In some environments, stack might not be available
      // The function should still return what Error provides
      const stack = extractErrorStack(error);
      // Either stack exists or is undefined
      expect(stack === undefined || typeof stack === 'string').toBe(true);
    });
  });

  describe('wrapError', () => {
    it('should wrap Error instance as cause', () => {
      const cause = new Error('Original error');
      const wrapped = wrapError('Context message', cause);

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBe(cause);
    });

    it('should wrap string as cause', () => {
      const wrapped = wrapError('Context message', 'String error');

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe('String error');
    });

    it('should wrap null as cause', () => {
      const wrapped = wrapError('Context message', null);

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe('null');
    });

    it('should wrap undefined as cause', () => {
      const wrapped = wrapError('Context message', undefined);

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe('undefined');
    });

    it('should wrap object as cause', () => {
      const cause = { code: 'ERR001', reason: 'Test' };
      const wrapped = wrapError('Context message', cause);

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe('[object Object]');
    });

    it('should preserve error chain', () => {
      const original = new Error('Original');
      const wrapped1 = wrapError('Intermediate', original);
      const wrapped2 = wrapError('Final', wrapped1);

      expect(wrapped2.message).toBe('Final');
      expect(wrapped2.cause).toBe(wrapped1);
      expect((wrapped2.cause as Error).cause).toBe(original);
    });

    it('should handle number as cause', () => {
      const wrapped = wrapError('Context message', 404);

      expect(wrapped.message).toBe('Context message');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe('404');
    });

    it('should create new Error object (not modify original)', () => {
      const cause = new Error('Original');
      const wrapped = wrapError('Wrapped', cause);

      // Should be a new object
      expect(wrapped).not.toBe(cause);
      // But cause should be the same reference
      expect(wrapped.cause).toBe(cause);
    });
  });
});

describe('Error Handling Patterns', () => {
  it('should work in try-catch blocks', () => {
    function throwsError(): never {
      throw new Error('Test error');
    }

    let caughtError: Error | null = null;

    try {
      throwsError();
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(extractErrorMessage(caughtError!)).toBe('Test error');
  });

  it('should handle unknown error types in catch', () => {
    function throwsUnknown() {
      throw 'string error';
    }

    let caughtError: unknown;

    try {
      throwsUnknown();
    } catch (e) {
      caughtError = e;
    }

    expect(extractErrorMessage(caughtError)).toBe('string error');
  });

  it('should wrap errors in async context', async () => {
    async function failingAsyncOperation(): Promise<never> {
      await Promise.resolve();
      throw new Error('Async failure');
    }

    try {
      await failingAsyncOperation();
    } catch (e) {
      const wrapped = wrapError('Operation failed', e);
      expect(wrapped.message).toBe('Operation failed');
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect(extractErrorMessage(wrapped.cause as Error)).toBe('Async failure');
    }
  });
});
