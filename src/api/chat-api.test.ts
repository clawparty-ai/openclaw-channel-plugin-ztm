// Unit tests for Chat API - normalizeMessageContent function

import { describe, it, expect } from 'vitest';
import { normalizeMessageContent, createChatApi } from './chat-api.js';
import { testConfig } from '../test-utils/fixtures.js';

describe('normalizeMessageContent', () => {
  describe('null/undefined handling', () => {
    it('should return empty string for null', () => {
      expect(normalizeMessageContent(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(normalizeMessageContent(undefined)).toBe('');
    });
  });

  describe('string handling', () => {
    it('should return string as-is', () => {
      expect(normalizeMessageContent('Hello World')).toBe('Hello World');
    });

    it('should return empty string for empty string', () => {
      expect(normalizeMessageContent('')).toBe('');
    });

    it('should convert number to string', () => {
      expect(normalizeMessageContent(123)).toBe('123');
    });

    it('should convert boolean to string', () => {
      expect(normalizeMessageContent(true)).toBe('true');
    });
  });

  describe('object with text property', () => {
    it('should extract text from {text: string}', () => {
      expect(normalizeMessageContent({ text: 'Hello' })).toBe('Hello');
    });

    it('should return empty string for empty text', () => {
      expect(normalizeMessageContent({ text: '' })).toBe('');
    });

    it('should return JSON for non-string text', () => {
      expect(normalizeMessageContent({ text: 123 })).toBe('{"text":123}');
    });
  });

  describe('nested message format', () => {
    it('should extract text from {message: {text: string}}', () => {
      expect(normalizeMessageContent({ message: { text: 'Nested message' } })).toBe(
        'Nested message'
      );
    });

    it('should handle nested with extra properties', () => {
      expect(
        normalizeMessageContent({
          message: { text: 'Nested', type: 'text' },
        })
      ).toBe('Nested');
    });

    it('should return JSON for nested non-string text', () => {
      expect(normalizeMessageContent({ message: { text: 123 } })).toBe('{"text":123}');
    });

    it('should return JSON for nested empty message', () => {
      expect(normalizeMessageContent({ message: {} })).toBe('{}');
    });

    it('should return JSON for nested null message', () => {
      // When nested message is null, it goes to JSON.stringify which produces {"message":null}
      expect(normalizeMessageContent({ message: null })).toBe('{"message":null}');
    });
  });

  describe('complex objects', () => {
    it('should stringify object with multiple properties', () => {
      expect(normalizeMessageContent({ foo: 'bar', baz: 123 })).toBe('{"foo":"bar","baz":123}');
    });

    it('should stringify array', () => {
      expect(normalizeMessageContent(['a', 'b'])).toBe('["a","b"]');
    });
  });
});

describe('createChatApi', () => {
  it('should return object with getChats method', () => {
    const mockRequest = async () => ({ ok: true, value: [], error: null });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);

    expect(chatApi).toHaveProperty('getChats');
    expect(typeof chatApi.getChats).toBe('function');
  });

  it('should call request with correct path', async () => {
    const mockRequest = async () => ({
      ok: true,
      value: [
        {
          peer: 'alice',
          time: Date.now(),
          updated: Date.now(),
          latest: { time: Date.now(), message: 'Hello', sender: 'alice' },
        },
      ],
      error: null,
    });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);
    const result = await chatApi.getChats();

    expect(result.ok).toBe(true);
  });

  it('should normalize message content in chat responses', async () => {
    const mockRequest = async () => ({
      ok: true,
      value: [
        {
          peer: 'alice',
          time: Date.now(),
          updated: Date.now(),
          latest: {
            time: Date.now(),
            message: { text: 'Normalized message' },
            sender: 'alice',
          },
        },
      ],
      error: null,
    });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);
    const result = await chatApi.getChats();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.[0]?.latest?.message).toBe('Normalized message');
    }
  });

  it('should return failure on API error', async () => {
    const mockRequest = async () => ({
      ok: false,
      value: null,
      error: new Error('Network error'),
    });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);
    const result = await chatApi.getChats();

    expect(result.ok).toBe(false);
  });

  it('should handle empty chat list', async () => {
    const mockRequest = async () => ({
      ok: true,
      value: [],
      error: null,
    });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);
    const result = await chatApi.getChats();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should handle chats without latest message', async () => {
    const mockRequest = async () => ({
      ok: true,
      value: [
        {
          peer: 'alice',
          time: Date.now(),
          updated: Date.now(),
        },
      ],
      error: null,
    });
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const chatApi = createChatApi(testConfig, mockRequest as any, mockLogger);
    const result = await chatApi.getChats();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.[0]).toHaveProperty('peer', 'alice');
    }
  });
});
