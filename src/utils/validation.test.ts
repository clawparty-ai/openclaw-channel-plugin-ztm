// Unit tests for validation utilities

import { describe, it, expect } from "vitest";
import {
  validationError,
  isValidUrl,
  validateUrl,
  validateHttpsUrl,
  escapeHtml,
  normalizeUsername,
} from "./validation.js";
import type { ConfigValidationError, ValidationErrorReason } from "../types/config.js";

describe("validation utilities", () => {
  describe("validationError", () => {
    it("should create a validation error with all fields", () => {
      const reason: ValidationErrorReason = "invalid_format";
      const error = validationError("url", reason, "invalid", "Invalid URL format");

      expect(error.field).toBe("url");
      expect(error.reason).toBe("invalid_format");
      expect(error.value).toBe("invalid");
      expect(error.message).toBe("Invalid URL format");
    });
  });

  describe("isValidUrl", () => {
    it("should return true for valid http URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("http://localhost:7777")).toBe(true);
      expect(isValidUrl("http://127.0.0.1:8080")).toBe(true);
    });

    it("should return true for valid https URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://ztm-portal.flomesh.io:7779")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });

    it("should return false for URLs with invalid protocols", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("ws://example.com")).toBe(false);
      expect(isValidUrl("mailto://example.com")).toBe(false);
    });
  });

  describe("validateUrl", () => {
    it("should return valid result for valid URLs", () => {
      const result = validateUrl("https://example.com");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe("https://example.com");
      }
    });

    it("should return invalid result for invalid URLs", () => {
      const result = validateUrl("not-a-url");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.field).toBe("url");
        expect(result.error.reason).toBe("invalid_format");
      }
    });
  });

  describe("validateHttpsUrl", () => {
    it("should return valid for https URLs", () => {
      const result = validateHttpsUrl("https://example.com");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe("https://example.com");
      }
    });

    it("should return valid for http URLs", () => {
      const result = validateHttpsUrl("http://localhost:7777");
      expect(result.valid).toBe(true);
    });

    it("should return invalid for URLs without protocol", () => {
      const result = validateHttpsUrl("example.com");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.message).toBe("URL must start with https:// or http://");
      }
    });

    it("should return invalid for other protocols", () => {
      const result = validateHttpsUrl("ftp://example.com");
      expect(result.valid).toBe(false);
    });
  });

  // ============================================
  // Security Tests - Input Sanitization
  // ============================================

  describe("escapeHtml - XSS Prevention", () => {
    it("should escape ampersand character", () => {
      expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("should escape less-than character", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    });

    it("should escape greater-than character", () => {
      expect(escapeHtml("2 > 1")).toBe("2 &gt; 1");
    });

    it("should escape double quote character", () => {
      expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
    });

    it("should escape single quote character", () => {
      expect(escapeHtml("it's fine")).toBe("it&#039;s fine");
    });

    it("should handle empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("should handle null/undefined-like input", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("should escape complete XSS attack payload", () => {
      const malicious = '<script>alert("xss")</script>';
      expect(escapeHtml(malicious)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });

    it("should escape HTML entities in user input", () => {
      expect(escapeHtml("User &amp; Co")).toBe("User &amp;amp; Co");
      expect(escapeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    });

    it("should handle strings with only special characters", () => {
      expect(escapeHtml('<>"&')).toBe("&lt;&gt;&quot;&amp;");
    });
  });

  describe("normalizeUsername - Input Normalization", () => {
    it("should convert uppercase to lowercase", () => {
      expect(normalizeUsername("ALICE")).toBe("alice");
    });

    it("should trim leading whitespace", () => {
      expect(normalizeUsername("  alice")).toBe("alice");
    });

    it("should trim trailing whitespace", () => {
      expect(normalizeUsername("alice  ")).toBe("alice");
    });

    it("should handle mixed case and whitespace", () => {
      expect(normalizeUsername("  Alice  ")).toBe("alice");
    });

    it("should handle empty string", () => {
      expect(normalizeUsername("")).toBe("");
    });

    it("should handle whitespace-only string", () => {
      expect(normalizeUsername("   ")).toBe("");
    });

    it("should preserve numbers and special chars in username", () => {
      expect(normalizeUsername("user_123")).toBe("user_123");
      expect(normalizeUsername("test-user")).toBe("test-user");
    });
  });

  describe("Security - URL validation edge cases", () => {
    it("should reject javascript: protocol", () => {
      expect(isValidUrl("javascript:alert(1)")).toBe(false);
    });

    it("should reject data: protocol", () => {
      expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });

    it("should reject file: protocol", () => {
      expect(isValidUrl("file:///etc/passwd")).toBe(false);
    });

    it("should reject URLs with newlines", () => {
      expect(isValidUrl("http://example.com\n")).toBe(false);
      expect(isValidUrl("http://example.com\r")).toBe(false);
    });
  });
});
