// Unit tests for Result handling utilities

import { describe, it, expect, vi } from 'vitest';
import { handleResult, mustResult, pipeResult } from './result.js';
import { success, failure } from '../types/common.js';

describe('Result handling utilities', () => {
  describe('handleResult', () => {
    it('should return value on success', () => {
      const result = success('hello');
      const value = handleResult(result, { operation: 'test' });
      expect(value).toBe('hello');
    });

    it('should call onSuccess callback on success', () => {
      const result = success('hello');
      const onSuccess = vi.fn();
      handleResult(result, { operation: 'test', onSuccess });
      expect(onSuccess).toHaveBeenCalledWith('hello');
    });

    it('should return defaultValue on failure', () => {
      const result = failure<string>(new Error('fail'));
      const value = handleResult(result, { operation: 'test', defaultValue: 'default' });
      expect(value).toBe('default');
    });

    it('should return null on failure without defaultValue', () => {
      const result = failure<string>(new Error('fail'));
      const value = handleResult(result, { operation: 'test' });
      expect(value).toBeNull();
    });

    it('should call onError callback on failure', () => {
      const err = new Error('fail');
      const result = failure<string>(err);
      const onError = vi.fn();
      handleResult(result, { operation: 'test', onError });
      expect(onError).toHaveBeenCalledWith(err);
    });

    it('should log at specified logLevel', () => {
      const result = failure<string>(new Error('fail'));
      const logger = { warn: vi.fn() };
      handleResult(result, { operation: 'test', logger, logLevel: 'warn' });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should include peer context in log message', () => {
      const result = failure<string>(new Error('fail'));
      const logger = { debug: vi.fn() };
      handleResult(result, { operation: 'test', peer: 'my-bot', logger });
      expect(logger.debug).toHaveBeenCalledWith('[my-bot] test failed: fail');
    });
  });

  describe('mustResult', () => {
    it('should return value on success', () => {
      const result = success('hello');
      const value = mustResult(result, { operation: 'test' });
      expect(value).toBe('hello');
    });

    it('should throw on failure', () => {
      const result = failure<string>(new Error('fail'));
      expect(() => mustResult(result, { operation: 'test' })).toThrow('fail');
    });

    it('should throw original error and log with context', () => {
      const result = failure<string>(new Error('original'));
      const logger = { error: vi.fn() };
      expect(() => mustResult(result, { operation: 'test', peer: 'bot', logger })).toThrow(
        'original'
      );
      expect(logger.error).toHaveBeenCalledWith('[bot] test failed: original');
    });
  });

  describe('pipeResult', () => {
    it('should transform success value', () => {
      const result = success(5);
      const piped = pipeResult(result, v => success(v * 2));
      expect(piped.ok).toBe(true);
      expect(piped.value).toBe(10);
    });

    it('should propagate error on transformation failure', () => {
      const result = success(5);
      const piped = pipeResult(result, () => failure(new Error('transform failed')));
      expect(piped.ok).toBe(false);
      expect(piped.error?.message).toBe('transform failed');
    });

    it('should short-circuit on error', () => {
      const result = failure<number>(new Error('original'));
      const transform = vi.fn((v: number) => success(v * 2));
      const piped = pipeResult(result, transform);
      expect(transform).not.toHaveBeenCalled();
      expect(piped.ok).toBe(false);
    });
  });
});
