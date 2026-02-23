// Unit tests for common types and Result utilities

import { describe, it, expect, vi } from 'vitest';
import {
  success,
  failure,
  isSuccess,
  isFailure,
  unwrap,
  unwrapOr,
  maybe,
  map,
  mapErr,
  flatMap,
} from './common.js';
import type { Result } from './common.js';

describe('Result type factories', () => {
  describe('success', () => {
    it('should create a success Result', () => {
      const result = success('hello');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('hello');
    });
  });

  describe('failure', () => {
    it('should create a failure Result', () => {
      const testError = new Error('fail');
      const result = failure(testError);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(testError);
    });
  });
});

describe('Type guards', () => {
  describe('isSuccess', () => {
    it('should return true for success Result', () => {
      expect(isSuccess(success('hello'))).toBe(true);
    });

    it('should return false for failure Result', () => {
      expect(isSuccess(failure(new Error('fail')))).toBe(false);
    });
  });

  describe('isFailure', () => {
    it('should return true for failure Result', () => {
      expect(isFailure(failure(new Error('fail')))).toBe(true);
    });

    it('should return false for success Result', () => {
      expect(isFailure(success('hello'))).toBe(false);
    });
  });
});

describe('Unwrap methods', () => {
  describe('unwrap', () => {
    it('should return value on success', () => {
      expect(unwrap(success('hello'))).toBe('hello');
    });

    it('should throw on failure', () => {
      expect(() => unwrap(failure(new Error('fail')))).toThrow('fail');
    });

    it('should throw with default message when error is undefined', () => {
      const result: Result<string> = { ok: false };
      expect(() => unwrap(result)).toThrow('Result was None');
    });
  });

  describe('unwrapOr', () => {
    it('should return value on success', () => {
      expect(unwrapOr(success('hello'), 'default')).toBe('hello');
    });

    it('should return default on failure', () => {
      expect(unwrapOr(failure(new Error('fail')), 'default')).toBe('default');
    });
  });

  describe('maybe', () => {
    it('should return value on success', () => {
      expect(maybe(success('hello'))).toBe('hello');
    });

    it('should return undefined on failure', () => {
      expect(maybe(failure(new Error('fail')))).toBeUndefined();
    });
  });
});

describe('Mapping methods', () => {
  describe('map', () => {
    it('should transform success value', () => {
      const result = map(success(5), v => v * 2);
      expect(result.value).toBe(10);
    });

    it('should propagate error', () => {
      const result = map(failure<number>(new Error('fail')), v => v * 2);
      expect(result.ok).toBe(false);
    });
  });

  describe('mapErr', () => {
    it('should transform error', () => {
      const result = mapErr(failure(new Error('original')), _e => new Error('transformed'));
      expect(result.error?.message).toBe('transformed');
    });

    it('should leave success unchanged', () => {
      const result = mapErr(success('hello'), _e => new Error('transformed'));
      expect(result.value).toBe('hello');
    });
  });

  describe('flatMap', () => {
    it('should transform and flatten success', () => {
      const result = flatMap(success(5), v => success(v * 2));
      expect(result.value).toBe(10);
    });

    it('should propagate error from transformation', () => {
      const result = flatMap(success(5), () => failure(new Error('transform failed')));
      expect(result.ok).toBe(false);
    });

    it('should short-circuit on error', () => {
      const transform = vi.fn((v: number) => success(v * 2));
      flatMap(failure<number>(new Error('fail')), transform);
      expect(transform).not.toHaveBeenCalled();
    });
  });
});
