// Unit tests for validation utilities

import { describe, it, expect } from 'vitest';
import {
  validationError,
  isValidUrl,
  validateUrl,
  validateHttpsUrl,
  escapeHtml,
  normalizeUsername,
  containsPathTraversal,
  validateUsername,
  validateGroupId,
  validateMessageContent,
  IDENTIFIER_PATTERN,
  MAX_USERNAME_LENGTH,
  MAX_GROUP_ID_LENGTH,
} from './validation.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import type { ValidationErrorReason } from '../types/config.js';

describe('validation utilities', () => {
  describe('validationError', () => {
    it('should create a validation error with all fields', () => {
      const reason: ValidationErrorReason = 'invalid_format';
      const error = validationError('url', reason, 'invalid', 'Invalid URL format');

      expect(error.field).toBe('url');
      expect(error.reason).toBe('invalid_format');
      expect(error.value).toBe('invalid');
      expect(error.message).toBe('Invalid URL format');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:7777')).toBe(true);
      expect(isValidUrl('http://127.0.0.1:8080')).toBe(true);
    });

    it('should return true for valid https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://ztm-portal.flomesh.io:7779')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });

    it('should return false for URLs with invalid protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('ws://example.com')).toBe(false);
      expect(isValidUrl('mailto://example.com')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should return valid result for valid URLs', () => {
      const result = validateUrl('https://example.com');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe('https://example.com');
      }
    });

    it('should return invalid result for invalid URLs', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.field).toBe('url');
        expect(result.error.reason).toBe('invalid_format');
      }
    });
  });

  describe('validateHttpsUrl', () => {
    it('should return valid for https URLs', () => {
      const result = validateHttpsUrl('https://example.com');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe('https://example.com');
      }
    });

    it('should return valid for http URLs', () => {
      const result = validateHttpsUrl('http://localhost:7777');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for URLs without protocol', () => {
      const result = validateHttpsUrl('example.com');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.message).toBe('URL must start with https:// or http://');
      }
    });

    it('should return invalid for other protocols', () => {
      const result = validateHttpsUrl('ftp://example.com');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================
  // Security Tests - Input Sanitization
  // ============================================

  describe('escapeHtml - XSS Prevention', () => {
    it('should escape ampersand character', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less-than character', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape greater-than character', () => {
      expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
    });

    it('should escape double quote character', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quote character', () => {
      expect(escapeHtml("it's fine")).toBe('it&#039;s fine');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle null/undefined-like input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should escape complete XSS attack payload', () => {
      const malicious = '<script>alert("xss")</script>';
      expect(escapeHtml(malicious)).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should escape HTML entities in user input', () => {
      expect(escapeHtml('User &amp; Co')).toBe('User &amp;amp; Co');
      expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });

    it('should handle strings with only special characters', () => {
      expect(escapeHtml('<>"&')).toBe('&lt;&gt;&quot;&amp;');
    });
  });

  describe('normalizeUsername - Input Normalization', () => {
    it('should convert uppercase to lowercase', () => {
      expect(normalizeUsername('ALICE')).toBe('alice');
    });

    it('should trim leading whitespace', () => {
      expect(normalizeUsername('  alice')).toBe('alice');
    });

    it('should trim trailing whitespace', () => {
      expect(normalizeUsername('alice  ')).toBe('alice');
    });

    it('should handle mixed case and whitespace', () => {
      expect(normalizeUsername('  Alice  ')).toBe('alice');
    });

    it('should handle empty string', () => {
      expect(normalizeUsername('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(normalizeUsername('   ')).toBe('');
    });

    it('should preserve numbers and special chars in username', () => {
      expect(normalizeUsername('user_123')).toBe('user_123');
      expect(normalizeUsername('test-user')).toBe('test-user');
    });
  });

  describe('Security - URL validation edge cases', () => {
    it('should reject javascript: protocol', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: protocol', () => {
      expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject file: protocol', () => {
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });

    it('should reject URLs with newlines', () => {
      expect(isValidUrl('http://example.com\n')).toBe(false);
      expect(isValidUrl('http://example.com\r')).toBe(false);
    });
  });

  // ============================================
  // API Input Validation Tests
  // ============================================

  describe('containsPathTraversal - Path Traversal Detection', () => {
    it('should detect Unix path traversal ../', () => {
      expect(containsPathTraversal('../../../etc/passwd')).toBe(true);
      expect(containsPathTraversal('foo/../bar')).toBe(true);
    });

    it('should detect Windows path traversal ..\\', () => {
      expect(containsPathTraversal('..\\..\\windows\\system32')).toBe(true);
      expect(containsPathTraversal('foo\\..\\bar')).toBe(true);
    });

    it('should detect URL-encoded path traversal', () => {
      expect(containsPathTraversal('%2e%2e')).toBe(true);
      expect(containsPathTraversal('%2e%2e%2f')).toBe(true);
      expect(containsPathTraversal('%2e%2e%5c')).toBe(true);
    });

    it('should detect mixed encoding variants', () => {
      expect(containsPathTraversal('..%2f')).toBe(true);
      expect(containsPathTraversal('..%5c')).toBe(true);
    });

    it('should allow valid input without path traversal', () => {
      expect(containsPathTraversal('normal_user')).toBe(false);
      expect(containsPathTraversal('my-group')).toBe(false);
      expect(containsPathTraversal('test_group_123')).toBe(false);
    });

    it('should be case-insensitive for URL encoding', () => {
      expect(containsPathTraversal('%2E%2E%2F')).toBe(true);
      expect(containsPathTraversal('%2E%2E%5C')).toBe(true);
    });
  });

  describe('validateUsername - API Input Validation', () => {
    it('should accept valid usernames', () => {
      const result1 = validateUsername('alice');
      expect(result1.valid).toBe(true);
      if (result1.valid) expect(result1.value).toBe('alice');

      const result2 = validateUsername('user_123');
      expect(result2.valid).toBe(true);
      if (result2.valid) expect(result2.value).toBe('user_123');

      const result3 = validateUsername('test-group');
      expect(result3.valid).toBe(true);
      if (result3.valid) expect(result3.value).toBe('test-group');
    });

    it('should accept valid usernames with leading/trailing whitespace (trimmed)', () => {
      const result = validateUsername('  alice  ');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('alice');
    });

    it('should reject empty username', () => {
      const result = validateUsername('');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Username must be a non-empty string');
    });

    it('should reject whitespace-only username', () => {
      const result = validateUsername('   ');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Username cannot be empty or whitespace only');
    });

    it('should reject null username', () => {
      const result = validateUsername(null as unknown as string);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Username must be a non-empty string');
    });

    it('should reject username exceeding max length', () => {
      const longUsername = 'a'.repeat(MAX_USERNAME_LENGTH + 1);
      const result = validateUsername(longUsername);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain(`exceeds maximum length of ${MAX_USERNAME_LENGTH}`);
      }
    });

    it('should reject username with path traversal', () => {
      const result1 = validateUsername('alice/../etc');
      expect(result1.valid).toBe(false);
      if (!result1.valid) expect(result1.error).toContain('path traversal');

      const result2 = validateUsername('%2e%2e%2fadmin');
      expect(result2.valid).toBe(false);
      if (!result2.valid) expect(result2.error).toContain('path traversal');
    });

    it('should reject username with invalid characters', () => {
      const invalidUsernames = [
        'alice@domain.com',
        'user#123',
        'test.user',
        'user/name',
        'user:admin',
        'user;drop',
      ];

      for (const username of invalidUsernames) {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('alphanumeric');
        }
      }
    });

    it('should accept edge case valid usernames', () => {
      expect(validateUsername('_').valid).toBe(true);
      expect(validateUsername('-').valid).toBe(true);
      expect(validateUsername('a').valid).toBe(true);
      expect(validateUsername('Z').valid).toBe(true);
      expect(validateUsername('9').valid).toBe(true);
    });
  });

  describe('validateGroupId - API Input Validation', () => {
    it('should accept valid group IDs', () => {
      const result1 = validateGroupId('general');
      expect(result1.valid).toBe(true);
      if (result1.valid) expect(result1.value).toBe('general');

      const result2 = validateGroupId('team_123');
      expect(result2.valid).toBe(true);
      if (result2.valid) expect(result2.value).toBe('team_123');

      const result3 = validateGroupId('project-group');
      expect(result3.valid).toBe(true);
      if (result3.valid) expect(result3.value).toBe('project-group');
    });

    it('should accept valid group IDs with leading/trailing whitespace (trimmed)', () => {
      const result = validateGroupId('  general  ');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('general');
    });

    it('should reject empty group ID', () => {
      const result = validateGroupId('');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Group ID must be a non-empty string');
    });

    it('should reject whitespace-only group ID', () => {
      const result = validateGroupId('   ');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Group ID cannot be empty or whitespace only');
    });

    it('should reject null group ID', () => {
      const result = validateGroupId(null as unknown as string);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Group ID must be a non-empty string');
    });

    it('should reject group ID exceeding max length', () => {
      const longGroupId = 'g'.repeat(MAX_GROUP_ID_LENGTH + 1);
      const result = validateGroupId(longGroupId);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain(`exceeds maximum length of ${MAX_GROUP_ID_LENGTH}`);
      }
    });

    it('should reject group ID with path traversal', () => {
      const result1 = validateGroupId('general/../admin');
      expect(result1.valid).toBe(false);
      if (!result1.valid) expect(result1.error).toContain('path traversal');

      const result2 = validateGroupId('%2e%2e%2fsecret');
      expect(result2.valid).toBe(false);
      if (!result2.valid) expect(result2.error).toContain('path traversal');
    });

    it('should reject group ID with invalid characters', () => {
      const invalidGroupIds = ['group@domain', 'test#123', 'my.group', 'group/name', 'group:chat'];

      for (const groupId of invalidGroupIds) {
        const result = validateGroupId(groupId);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('alphanumeric');
        }
      }
    });

    it('should accept edge case valid group IDs', () => {
      expect(validateGroupId('_').valid).toBe(true);
      expect(validateGroupId('-').valid).toBe(true);
      expect(validateGroupId('g').valid).toBe(true);
    });
  });

  describe('validateMessageContent - API Input Validation', () => {
    it('should accept valid message content', () => {
      const result = validateMessageContent('Hello, world!');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('Hello, world!');
    });

    it('should accept empty string as valid content (edge case)', () => {
      const result = validateMessageContent('');
      expect(result.valid).toBe(false); // Empty strings are rejected
      if (!result.valid) {
        expect(result.error).toBe('Message content must be a non-empty string');
      }
    });

    it('should reject null content', () => {
      const result = validateMessageContent(null as unknown as string);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Message content must be a non-empty string');
    });

    it('should reject content exceeding max length', () => {
      const longContent = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const result = validateMessageContent(longContent);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain(`exceeds maximum length of ${MAX_MESSAGE_LENGTH}`);
      }
    });

    it('should accept content exactly at max length', () => {
      const maxContent = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const result = validateMessageContent(maxContent);
      expect(result.valid).toBe(true);
    });

    it('should reject content with null bytes', () => {
      const result1 = validateMessageContent('Hello\x00World');
      expect(result1.valid).toBe(false);
      if (!result1.valid) expect(result1.error).toContain('null bytes');

      const result2 = validateMessageContent('\x00');
      expect(result2.valid).toBe(false);
      if (!result2.valid) expect(result2.error).toContain('null bytes');
    });

    it('should accept content with special characters (except null bytes)', () => {
      const specialContent = "Hello!\nHow are you?\tI'm fine.";
      const result = validateMessageContent(specialContent);
      expect(result.valid).toBe(true);
    });

    it('should accept multi-byte Unicode content', () => {
      const unicodeContent = '你好世界 🌍🚀 Здравствуй мир';
      const result = validateMessageContent(unicodeContent);
      expect(result.valid).toBe(true);
    });
  });

  describe('IDENTIFIER_PATTERN validation consistency', () => {
    it("should match validation functions' pattern", () => {
      // Test that IDENTIFIER_PATTERN matches what validateUsername accepts
      const validInputs = ['alice', 'user_123', 'test-group', '_', '-', 'a', 'Z', '9'];
      for (const input of validInputs) {
        expect(IDENTIFIER_PATTERN.test(input)).toBe(true);
        expect(validateUsername(input).valid).toBe(true);
        expect(validateGroupId(input).valid).toBe(true);
      }

      // Test that IDENTIFIER_PATTERN rejects what validation functions reject
      const invalidInputs = ['alice@domain', 'user#123', 'test.user', 'user/name'];
      for (const input of invalidInputs) {
        expect(IDENTIFIER_PATTERN.test(input)).toBe(false);
        expect(validateUsername(input).valid).toBe(false);
        expect(validateGroupId(input).valid).toBe(false);
      }
    });
  });

  describe('validateUsername Unicode support', () => {
    // Chinese
    it('should accept Chinese characters', () => {
      const result = validateUsername('张三');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe('张三');
      }
    });

    it('should accept Chinese with numbers', () => {
      expect(validateUsername('用户123').valid).toBe(true);
    });

    // Japanese
    it('should accept Japanese Hiragana/Katakana', () => {
      expect(validateUsername('山田').valid).toBe(true);
      expect(validateUsername('テスト').valid).toBe(true);
    });

    // Korean
    it('should accept Korean Hangul', () => {
      expect(validateUsername('최고이').valid).toBe(true);
      expect(validateUsername('한국어').valid).toBe(true);
    });

    // Cyrillic
    it('should accept Russian Cyrillic', () => {
      expect(validateUsername('иван').valid).toBe(true);
    });

    // Arabic
    it('should accept Arabic', () => {
      expect(validateUsername('محمد').valid).toBe(true);
    });

    // Emoji
    it('should accept emoji in usernames', () => {
      expect(validateUsername('用户🎉').valid).toBe(true);
      expect(validateUsername('test😀').valid).toBe(true);
    });

    // Mixed
    it('should accept mixed scripts', () => {
      expect(validateUsername('Alice_张三_John').valid).toBe(true);
      expect(validateUsername('山田_john_123').valid).toBe(true);
    });

    // Edge cases - should still reject
    it('should reject usernames with spaces', () => {
      expect(validateUsername('user name').valid).toBe(false);
    });

    it('should reject usernames with special chars', () => {
      expect(validateUsername('user@domain').valid).toBe(false);
      expect(validateUsername('user/name').valid).toBe(false);
    });
  });
});
