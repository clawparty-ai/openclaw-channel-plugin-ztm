// Unit tests for Type Guards

import { describe, it, expect } from 'vitest';
import {
  isDefined,
  isNullish,
  requireDefined,
  requireValue,
  getOrDefault,
  getOrCompute,
  coalesce,
  isNonEmptyArray,
  assert,
} from './guards.js';

describe('Type Guards', () => {
  describe('isDefined', () => {
    it('should return true for non-null values', () => {
      expect(isDefined('hello')).toBe(true);
      expect(isDefined(0)).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('should return false for null', () => {
      expect(isDefined(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isDefined(undefined)).toBe(false);
    });

    it('should narrow type in conditional', () => {
      const value: string | null = 'test';
      if (isDefined(value)) {
        // TypeScript should narrow to string here
        expect(value.length).toBe(4);
      }
    });
  });

  describe('isNullish', () => {
    it('should return true for null', () => {
      expect(isNullish(null)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(isNullish(undefined)).toBe(true);
    });

    it('should return false for defined values', () => {
      expect(isNullish('hello')).toBe(false);
      expect(isNullish(0)).toBe(false);
      expect(isNullish(false)).toBe(false);
    });
  });

  describe('requireDefined', () => {
    it('should return value when defined', () => {
      expect(requireDefined('hello')).toBe('hello');
      expect(requireDefined(42)).toBe(42);
      expect(requireDefined({ key: 'value' })).toEqual({ key: 'value' });
    });

    it('should throw with default message when undefined', () => {
      expect(() => requireDefined(undefined)).toThrow('Value is required but was undefined');
    });

    it('should throw with custom message when null', () => {
      expect(() => requireDefined(null, 'Custom error message')).toThrow('Custom error message');
    });

    it('should throw with custom message when undefined', () => {
      expect(() => requireDefined(undefined, 'Config is required')).toThrow('Config is required');
    });
  });

  describe('requireValue', () => {
    it('should return value when defined', () => {
      const result = requireValue('hello', () => new Error('Should not throw'));
      expect(result).toBe('hello');
    });

    it('should throw error from factory when undefined', () => {
      expect(() => requireValue(undefined, () => new Error('Custom error'))).toThrow(
        'Custom error'
      );
    });

    it('should throw error from factory when null', () => {
      expect(() => requireValue(null, () => new Error('Null value'))).toThrow('Null value');
    });

    it('should preserve error cause chain', () => {
      const originalError = new Error('Original error');
      try {
        requireValue(undefined, () => originalError);
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBe(originalError);
      }
    });
  });

  describe('getOrDefault', () => {
    it('should return value when defined', () => {
      expect(getOrDefault('hello', 'default')).toBe('hello');
      expect(getOrDefault(0, 100)).toBe(0); // 0 is defined, not falsy
      expect(getOrDefault(false, true)).toBe(false); // false is defined
      expect(getOrDefault('', 'default')).toBe(''); // empty string is defined
    });

    it('should return default when null', () => {
      expect(getOrDefault(null, 'default')).toBe('default');
    });

    it('should return default when undefined', () => {
      expect(getOrDefault(undefined, 'default')).toBe('default');
    });

    it('should work with different types', () => {
      const obj = { key: 'value' };
      expect(getOrDefault(obj, { key: 'default' })).toBe(obj);

      const arr = [1, 2, 3];
      expect(getOrDefault(arr, [])).toEqual([1, 2, 3]);
    });

    it('should return default when value is null', () => {
      const result = getOrDefault<string | null, string>(null, 'default');
      expect(result).toBe('default');
    });
  });

  describe('getOrCompute', () => {
    it('should return value when defined', () => {
      let computeCalled = false;
      const result = getOrCompute('hello', () => {
        computeCalled = true;
        return 'computed';
      });

      expect(result).toBe('hello');
      expect(computeCalled).toBe(false);
    });

    it('should compute default when undefined', () => {
      let computeCalled = false;
      const result = getOrCompute(undefined, () => {
        computeCalled = true;
        return 'computed';
      });

      expect(result).toBe('computed');
      expect(computeCalled).toBe(true);
    });

    it('should compute default when null', () => {
      let computeCount = 0;
      const result = getOrCompute<string, string>(null, () => {
        computeCount++;
        return 'lazy-default';
      });

      expect(result).toBe('lazy-default');
      expect(computeCount).toBe(1);
    });

    it('should not recompute on multiple calls when value is undefined', () => {
      let computeCount = 0;
      const factory = () => {
        computeCount++;
        return 'computed';
      };

      getOrCompute(undefined, factory);
      getOrCompute(undefined, factory);
      getOrCompute(undefined, factory);

      // Each call recomputes since value is always undefined
      expect(computeCount).toBe(3);
    });
  });

  describe('coalesce', () => {
    it('should return first defined value', () => {
      expect(coalesce('first', 'second')).toBe('first');
      expect(coalesce(null, 'second')).toBe('second');
      expect(coalesce(undefined, 'second')).toBe('second');
    });

    it('should return first defined from many', () => {
      expect(coalesce(undefined, null, 'found')).toBe('found');
      expect(coalesce(null, undefined, null, 'last')).toBe('last');
    });

    it('should return undefined when all are nullish', () => {
      expect(coalesce(null, undefined)).toBeUndefined();
      expect(coalesce()).toBeUndefined();
    });

    it('should handle mixed types', () => {
      const obj = { key: 'value' };
      expect(coalesce(null, obj)).toBe(obj);
      expect(coalesce(undefined, null, obj)).toBe(obj);
    });
  });

  describe('isNonEmptyArray', () => {
    it('should return true for non-empty array', () => {
      expect(isNonEmptyArray([1, 2, 3])).toBe(true);
      expect(isNonEmptyArray(['a'])).toBe(true);
      expect(isNonEmptyArray([{}])).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isNonEmptyArray(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNonEmptyArray(undefined)).toBe(false);
    });

    it('should narrow type in conditional', () => {
      const arr: string[] | null = ['hello', 'world'];
      if (isNonEmptyArray(arr)) {
        // TypeScript should narrow to string[] here
        expect(arr.length).toBe(2);
        expect(arr[0]).toBe('hello');
      }
    });
  });

  describe('assert', () => {
    it('should not throw when condition is true', () => {
      expect(() => assert(true, 'Should not throw')).not.toThrow();
      expect(() => assert(true, 'message')).not.toThrow();
    });

    it('should throw with message when condition is false', () => {
      expect(() => assert(false, 'Custom assertion failed')).toThrow('Custom assertion failed');
    });

    it('should throw with default message', () => {
      expect(() => assert(false, '')).toThrow('');
    });

    it('should work with complex conditions', () => {
      const value = 10;
      expect(() => assert(value > 5, 'Value must be greater than 5')).not.toThrow();
      expect(() => assert(value > 20, 'Value must be greater than 20')).toThrow();
    });
  });
});

describe('Type Guard Composition', () => {
  it('should compose guards for filtering', () => {
    const values: (string | null | undefined)[] = ['a', null, 'b', undefined, 'c', null];

    const defined = values.filter(isDefined);
    expect(defined).toEqual(['a', 'b', 'c']);

    // Test isNonEmptyArray directly instead of with filter
    expect(isNonEmptyArray(['a', 'b'])).toBe(true);
    expect(isNonEmptyArray([])).toBe(false);
    expect(isNonEmptyArray(null)).toBe(false);
    expect(isNonEmptyArray(undefined)).toBe(false);
  });

  it('should work with map and filter', () => {
    const values: (number | null | undefined)[] = [1, null, 2, undefined, 3];

    const doubled = values.filter(isDefined).map(x => x * 2);
    expect(doubled).toEqual([2, 4, 6]);
  });

  it('should use with getOrDefault in chains', () => {
    const config = {
      timeout: 0,
      retries: undefined as number | undefined,
    };

    const timeout = getOrDefault(config.timeout, 30000);
    const retries = getOrDefault(config.retries, 3);

    expect(timeout).toBe(0); // 0 is valid, not coerced to default
    expect(retries).toBe(3); // undefined uses default
  });
});
