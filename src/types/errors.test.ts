// Unit tests for ZTM Error Types

import { describe, it, expect } from 'vitest';
import {
  ZTMError,
  ZTMSendError,
  ZTMWriteError,
  ZTMReadError,
  ZTMParseError,
  ZTMDiscoveryError,
  ZTMApiError,
  ZTMTimeoutError,
  ZTMRuntimeError,
  ZTMConfigError,
  toFailure,
  tryCatch,
  tryCatchAsync,
} from './errors.js';
import { isSuccess } from './common.js';

describe('ZTMError', () => {
  describe('base functionality', () => {
    it('should create error with default message', () => {
      const error = new (class extends ZTMError {})();
      expect(error.message).toBe('Unknown ZTM error');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new (class extends ZTMError {})({}, cause);
      expect(error.cause).toBe(cause);
    });

    it('should include context', () => {
      const error = new (class extends ZTMError {})({ key: 'value' });
      expect(error.context).toEqual({ key: 'value' });
    });

    it('should serialize to JSON with context', () => {
      const error = new (class extends ZTMError {})({ foo: 'bar' });
      const json = error.toJSON();

      expect(json.context).toEqual({ foo: 'bar' });
    });
  });
});

describe('ZTMSendError', () => {
  it('should create error with peer info', () => {
    const error = new ZTMSendError({
      peer: 'alice',
      messageTime: 1234567890,
    });

    expect(error.context.peer).toBe('alice');
    expect(error.context.messageTime).toBe(1234567890);
    expect(error.message).toContain('alice');
  });

  it('should include cause message', () => {
    const cause = new Error('Network error');
    const error = new ZTMSendError({
      peer: 'alice',
      messageTime: 1234567890,
      cause,
    });

    expect(error.message).toContain('Network error');
  });

  it('should include content preview', () => {
    const error = new ZTMSendError({
      peer: 'alice',
      messageTime: 1234567890,
      contentPreview: 'Hello world!',
    });

    expect(error.context.contentPreview).toBe('Hello world!');
  });

  it('should include attemptedAt timestamp', () => {
    const error = new ZTMSendError({
      peer: 'alice',
      messageTime: 1234567890,
    });

    expect(error.context.attemptedAt).toBeDefined();
  });
});

describe('ZTMWriteError', () => {
  it('should create error with file info', () => {
    const error = new ZTMWriteError({
      peer: 'alice',
      messageTime: 1234567890,
      filePath: '/path/to/file',
    });

    expect(error.context.peer).toBe('alice');
    expect(error.context.filePath).toBe('/path/to/file');
    expect(error.context.messageTime).toBe(1234567890);
  });

  it('should include cause', () => {
    const cause = new Error('Permission denied');
    const error = new ZTMWriteError({
      peer: 'alice',
      messageTime: 1234567890,
      filePath: '/path',
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe('ZTMReadError', () => {
  it('should create error with file info', () => {
    const error = new ZTMReadError({
      peer: 'alice',
      filePath: '/path/to/file',
    });

    expect(error.context.peer).toBe('alice');
    expect(error.context.filePath).toBe('/path/to/file');
  });
});

describe('ZTMParseError', () => {
  it('should create error with parse context', () => {
    const error = new ZTMParseError({
      peer: 'alice',
      filePath: '/path/to/file',
      parseDetails: 'Unexpected token',
    });

    expect(error.context.peer).toBe('alice');
    expect(error.context.filePath).toBe('/path/to/file');
    expect(error.context.parseDetails).toBe('Unexpected token');
  });
});

describe('ZTMDiscoveryError', () => {
  it('should create error with discovery context', () => {
    const error = new ZTMDiscoveryError({
      operation: 'discoverPeers',
      source: 'mesh',
    });

    expect(error.context.operation).toBe('discoverPeers');
    expect(error.context.source).toBe('mesh');
  });

  it('should use default operation', () => {
    const error = new ZTMDiscoveryError({});
    expect(error.context.operation).toBe('discoverUsers');
  });
});

describe('ZTMApiError', () => {
  it('should create error with API context', () => {
    const error = new ZTMApiError({
      method: 'POST',
      path: '/api/chat',
      statusCode: 500,
    });

    expect(error.context.method).toBe('POST');
    expect(error.context.path).toBe('/api/chat');
    expect(error.context.statusCode).toBe(500);
  });

  it('should include cause', () => {
    const cause = new Error('Connection refused');
    const error = new ZTMApiError({
      method: 'GET',
      path: '/api/chat',
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe('ZTMTimeoutError', () => {
  it('should create error with timeout context', () => {
    const error = new ZTMTimeoutError({
      method: 'POST',
      path: '/api/chat',
      timeoutMs: 5000,
    });

    expect(error.context.method).toBe('POST');
    expect(error.context.path).toBe('/api/chat');
    expect(error.context.timeoutMs).toBe(5000);
  });
});

describe('ZTMRuntimeError', () => {
  it('should create error with runtime context', () => {
    const error = new ZTMRuntimeError({
      operation: 'initialize',
      reason: 'failed',
    });

    expect(error.context.operation).toBe('initialize');
    expect(error.context.reason).toBe('failed');
  });
});

describe('ZTMConfigError', () => {
  it('should create error with config context', () => {
    const error = new ZTMConfigError({
      field: 'username',
      value: '',
      reason: 'Username is required',
    });

    expect(error.context.field).toBe('username');
    expect(error.context.value).toBe('');
    expect(error.context.reason).toBe('Username is required');
  });
});

describe('toFailure', () => {
  it('should convert Error to failed Result', () => {
    const error = new Error('Test error');
    const result = toFailure(error);

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect((result as any).error.message).toBe('Test error');
    }
  });
});

describe('tryCatch', () => {
  it('should return success when function succeeds', () => {
    const result = tryCatch(() => {
      return 'success value';
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('success value');
    }
  });

  it('should return failure when function throws Error', () => {
    const result = tryCatch(() => {
      throw new Error('Function failed');
    });

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect((result as any).error.message).toBe('Function failed');
    }
  });

  it('should return failure when function throws non-Error', () => {
    const result = tryCatch(() => {
      throw 'string error';
    });

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect((result as any).error.message).toBe('string error');
    }
  });

  it('should use custom error constructor when provided', () => {
    class CustomError extends Error {
      constructor(
        message: string,
        public readonly extra: string,
        cause?: Error
      ) {
        super(message, { cause });
        this.name = 'CustomError';
      }
    }

    const result = tryCatch(() => {
      throw new Error('Original error');
    }, CustomError as any);

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect(result.error).toBeInstanceOf(CustomError);
      expect((result as any).error.message).toBe('Original error');
    }
  });
});

describe('tryCatchAsync', () => {
  it('should return success when async function succeeds', async () => {
    const result = await tryCatchAsync(async () => {
      return 'async success';
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('async success');
    }
  });

  it('should return failure when async function throws Error', async () => {
    const result = await tryCatchAsync(async () => {
      throw new Error('Async function failed');
    });

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect((result as any).error.message).toBe('Async function failed');
    }
  });

  it('should return failure when async function throws non-Error', async () => {
    const result = await tryCatchAsync(async () => {
      throw { code: 'ERR_CODE' };
    });

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect((result as any).error.message).toContain('[object Object]');
    }
  });

  it('should use custom error constructor when provided', async () => {
    class ApiError extends Error {
      constructor(
        message: string,
        public readonly status: number,
        cause?: Error
      ) {
        super(message, { cause });
        this.name = 'ApiError';
      }
    }

    const result = await tryCatchAsync(async () => {
      throw new Error('API failed');
    }, ApiError as any);

    expect(isSuccess(result)).toBe(false);
    if (!isSuccess(result)) {
      expect(result.error).toBeInstanceOf(ApiError);
      expect((result as any).error.message).toBe('API failed');
    }
  });
});
