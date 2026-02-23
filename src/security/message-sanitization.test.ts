/**
 * Security tests for message sanitization
 *
 * Tests defense against XSS and injection attacks in messages:
 * - HTML tag filtering
 * - JavaScript protocol handling
 * - HTML entity encoding
 * - Unicode normalization
 * - Control character filtering
 * - Combination character attacks
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../utils/validation.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';

describe('Message Sanitization Security', () => {
  describe('HTML tag filtering (escapeHtml)', () => {
    it('should escape script tags', () => {
      const input = '<script>alert(1)</script>';
      const result = escapeHtml(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should escape onmouseover events', () => {
      const input = '<img src=x onmouseover="alert(1)">';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;img');
      expect(result).toContain('onmouseover');
    });

    it('should escape inline event handlers', () => {
      const input = '<div onclick="malicious()">Click</div>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;div');
      expect(result).toContain('onclick');
    });

    it('should escape style with expression', () => {
      const input = '<div style="expression(alert(1))">Test</div>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;div');
      expect(result).toContain('style');
    });

    it('should escape iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe>';
      const result = escapeHtml(input);
      expect(result).not.toContain('<iframe>');
      expect(result).toContain('&lt;iframe');
    });

    it('should escape object and embed tags', () => {
      const input = '<object data="evil.swf"></object>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;object');
    });

    it('should escape SVG tags', () => {
      const input = '<svg onload="alert(1)"></svg>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;svg');
    });
  });

  describe('JavaScript protocol handling', () => {
    it('should escape javascript: in attributes', () => {
      const input = '<a href="javascript:alert(1)">click</a>';
      const result = escapeHtml(input);
      expect(result).toContain('javascript');
      // After escaping, the javascript: should be harmlessly displayed
      expect(result).not.toContain('<a href="javascript:');
    });

    it('should escape data: URLs', () => {
      const input = '<img src="data:text/html,<script>alert(1)</script>">';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;img');
    });

    it('should escape vbscript: protocol', () => {
      const input = '<a href="vbscript:msgbox(1)">click</a>';
      const result = escapeHtml(input);
      expect(result).toContain('vbscript');
      expect(result).not.toContain('<a href="vbscript:');
    });
  });

  describe('HTML entity encoding', () => {
    it('should encode existing HTML entities', () => {
      const input = '&lt;script&gt;';
      const result = escapeHtml(input);
      expect(result).toContain('&amp;lt;');
      expect(result).toContain('&amp;gt;');
    });

    it('should encode quotes', () => {
      const input = '<div class="test" id=\'x\'>text</div>';
      const result = escapeHtml(input);
      expect(result).toContain('&quot;');
      expect(result).toContain('&#039;');
    });

    it('should encode ampersands', () => {
      const input = 'foo & bar';
      const result = escapeHtml(input);
      expect(result).toBe('foo &amp; bar');
    });

    it('should handle numeric entity evasion attempts', () => {
      // &#60; is encoded <
      const input = '<img src=x &#60;script>alert(1)</script>';
      const result = escapeHtml(input);
      expect(result).toContain('&amp;#60;');
    });
  });

  describe('Unicode normalization', () => {
    it('should preserve Unicode characters in escapeHtml', () => {
      const input = 'Hello 世界 🌍';
      const result = escapeHtml(input);
      expect(result).toBe('Hello 世界 🌍');
    });

    it('should preserve emoji in escapeHtml', () => {
      const input = 'Hello 👨‍👩‍👧‍👦 World';
      const result = escapeHtml(input);
      expect(result).toBe('Hello 👨‍👩‍👧‍👦 World');
    });

    it('should handle homograph attacks - Latin a vs Greek alpha', () => {
      // Greek alpha (α) looks like Latin 'a'
      const latinA = 'google.com';
      const greekAlpha = 'googλe.com'; // using lambda which looks similar

      // Both should be preserved as-is (the issue is more about display)
      expect(escapeHtml(latinA)).toBe('google.com');
      expect(escapeHtml(greekAlpha)).toBe('googλe.com');
    });

    it('should handle right-to-left override characters', () => {
      // RTL override can flip text direction
      const input = 'google.com\u202Ejscript:\u202C';
      const result = escapeHtml(input);
      // The RTL marks should be preserved (not escaped)
      expect(result).toContain('\u202E');
    });
  });

  describe('Control character filtering (sanitizeForLog)', () => {
    it('should filter null character', () => {
      const input = 'hello\x00world';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\x00');
    });

    it('should filter SOH (0x01)', () => {
      const input = 'hello\x01world';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\x01');
    });

    it('should filter all C0 control characters (0x00-0x1F)', () => {
      // Build string with all C0 control characters (0x00-0x1F)
      // Using String.fromCharCode to avoid escape sequence issues with \x0A etc.
      const input = String.fromCharCode(
        0x61, 0x00, 0x62, 0x01, 0x63, 0x02, 0x64, 0x03, 0x65, 0x04,
        0x66, 0x05, 0x67, 0x06, 0x68, 0x07, 0x69, 0x08, 0x6A, 0x09,
        0x6B, 0x0A, 0x6C, 0x0B, 0x6D, 0x0C, 0x6E, 0x0E, 0x6F, 0x0F,
        0x70, 0x10, 0x71, 0x11, 0x72, 0x12, 0x73, 0x13, 0x74, 0x14,
        0x75, 0x15, 0x76, 0x16, 0x77, 0x17, 0x78, 0x18, 0x79, 0x19,
        0x7A, 0x1A, 0x61, 0x1B, 0x62, 0x1C, 0x63, 0x1D, 0x64, 0x1E, 0x65, 0x1F
      );

      const result = sanitizeForLog(input);
      expect(result).not.toMatch(/[\x00-\x1F]/);
    });

    it('should filter DEL character (0x7F)', () => {
      const input = 'hello\x7Fworld';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\x7F');
    });

    it('should preserve visible ASCII characters', () => {
      const input = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const result = sanitizeForLog(input);
      expect(result).toBe(input);
    });

    it('should filter vertical tab and form feed', () => {
      const input = 'hello\vworld\ftest';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\v');
      expect(result).not.toContain('\f');
    });
  });

  describe('Combination character attacks', () => {
    it('should handle combining diacritical marks', () => {
      // Combining acute accent (U+0301) after 'a' looks like 'á'
      const input = 'test\u0301';
      const result = escapeHtml(input);
      expect(result).toBe('test\u0301');
    });

    it('should handle zero-width characters', () => {
      // Zero-width joiner, zero-width non-joiner, zero-width space (U+2000-U+200F)
      // These are Unicode Format characters (Cf), NOT C0 control characters
      // Current sanitizeForLog only filters 0x00-0x1F, so these pass through
      const input = 'test\u200D\u200E\u200F';
      const result = sanitizeForLog(input);
      // Note: Zero-width characters are NOT filtered by current implementation
      // as they are outside the C0 control character range (0x00-0x1F)
      expect(result).toContain('\u200D');
      expect(result).toContain('\u200E');
      expect(result).toContain('\u200F');
    });

    it('should handle intermixed normalization forms', () => {
      // NFD (decomposed) vs NFC (composed) - both should be preserved
      const composed = '\u00e9'; // é as single character
      const decomposed = 'e\u0301'; // é as e + combining acute

      expect(escapeHtml(composed)).toBe('\u00e9');
      expect(escapeHtml(decomposed)).toBe('e\u0301');
    });
  });

  describe('edge cases and regression tests', () => {
    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
      expect(sanitizeForLog('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeForLog(null as unknown as string)).toBe('');
      expect(sanitizeForLog(undefined as unknown as string)).toBe('');
    });

    it('should handle strings with only dangerous characters', () => {
      const input = '<script></script>';
      const result = escapeHtml(input);
      expect(result).toBe('&lt;script&gt;&lt;/script&gt;');
    });

    it('should handle deeply nested tags', () => {
      const input = '<div><span><p><script>alert(1)</script></p></span></div>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;div&gt;');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should handle encoded attack vectors', () => {
      // HTML entity encoded - should be double-encoded
      const input1 = '&lt;script&gt;';
      const result1 = escapeHtml(input1);
      expect(result1).not.toBe(input1);
      expect(result1).toContain('&amp;lt;');

      // Numeric entity encoded - should be double-encoded
      const input2 = '&#60;script&#62;';
      const result2 = escapeHtml(input2);
      expect(result2).not.toBe(input2);
      expect(result2).toContain('&amp;#60;');

      // Hex entity encoded - should be double-encoded
      const input3 = '&#x3C;script&#x3E;';
      const result3 = escapeHtml(input3);
      expect(result3).not.toBe(input3);
      expect(result3).toContain('&amp;#x3C;');
    });

    it('should not decode URL encoding', () => {
      // URL-encoded strings (%3C = <) are NOT transformed by escapeHtml
      // This is expected - URL decoding is a separate concern
      const input = '%3Cscript%3E';
      const result = escapeHtml(input);
      expect(result).toBe('%3Cscript%3E'); // Passes through unchanged
    });
  });
});
