// Unit tests for validation utilities

import { describe, it, expect } from "vitest";
import {
  validationError,
  isValidUrl,
  validateUrl,
  validateHttpsUrl,
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
});
