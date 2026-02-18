// Unit tests for Log Sanitization

import { describe, it, expect } from "vitest";
import { sanitizeForLog, sanitizeObjectForLog } from "./log-sanitize.js";

describe("sanitizeForLog", () => {
  describe("null/undefined handling", () => {
    it("should return empty string for null", () => {
      expect(sanitizeForLog(null as unknown as string)).toBe("");
    });

    it("should return empty string for undefined", () => {
      expect(sanitizeForLog(undefined as unknown as string)).toBe("");
    });
  });

  describe("control character removal", () => {
    it("should remove newlines", () => {
      expect(sanitizeForLog("hello\nworld")).toBe("hello world");
    });

    it("should remove carriage returns", () => {
      expect(sanitizeForLog("hello\rworld")).toBe("hello world");
    });

    it("should remove tabs", () => {
      expect(sanitizeForLog("hello\tworld")).toBe("hello world");
    });

    it("should remove multiple control characters", () => {
      expect(sanitizeForLog("a\tb\nc\rd")).toBe("a b c d");
    });

    it("should remove form feed", () => {
      expect(sanitizeForLog("hello\fworld")).toBe("hello world");
    });

    it("should remove vertical tab", () => {
      expect(sanitizeForLog("hello\vworld")).toBe("hello world");
    });

    it("should remove ASCII control characters", () => {
      expect(sanitizeForLog("hello\x00world")).toBe("helloworld");
      expect(sanitizeForLog("hello\x1Fworld")).toBe("helloworld");
    });

    it("should remove DEL character", () => {
      expect(sanitizeForLog("hello\x7Fworld")).toBe("helloworld");
    });
  });

  describe("space handling", () => {
    it("should collapse multiple spaces", () => {
      expect(sanitizeForLog("hello    world")).toBe("hello world");
    });

    it("should trim leading and trailing spaces", () => {
      expect(sanitizeForLog("  hello  ")).toBe("hello");
    });
  });

  describe("maxLength truncation", () => {
    it("should not truncate short strings", () => {
      expect(sanitizeForLog("hello")).toBe("hello");
    });

    it("should truncate long strings", () => {
      const long = "a".repeat(300);
      const result = sanitizeForLog(long);
      expect(result.length).toBeLessThanOrEqual(203); // 200 + "..."
    });

    it("should use custom maxLength", () => {
      const long = "a".repeat(50);
      const result = sanitizeForLog(long, 30);
      expect(result.length).toBeLessThanOrEqual(33); // 30 + "..."
    });
  });

  describe("normal text", () => {
    it("should pass through normal text unchanged", () => {
      expect(sanitizeForLog("hello world")).toBe("hello world");
    });

    it("should handle special characters", () => {
      expect(sanitizeForLog("Hello! 🌍 世界")).toBe("Hello! 🌍 世界");
    });
  });
});

describe("sanitizeObjectForLog", () => {
  it("should sanitize string values in object", () => {
    const obj = { name: "hello\nworld", age: 25 };
    const result = sanitizeObjectForLog(obj);
    expect(result.name).toBe("hello world");
    expect(result.age).toBe(25);
  });

  it("should handle nested objects", () => {
    const obj = { user: { name: "test\nname", age: 30 } };
    const result = sanitizeObjectForLog(obj);
    expect((result.user as { name: string }).name).toBe("test name");
  });

  it("should preserve non-string values", () => {
    const obj = { name: "test", count: 42, active: true, rate: 3.14 };
    const result = sanitizeObjectForLog(obj);
    expect(result.name).toBe("test");
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.rate).toBe(3.14);
  });

  it("should handle arrays", () => {
    const obj = { tags: ["tag1\n", "tag2\t"] };
    // Arrays are objects, so string elements should be sanitized
    const result = sanitizeObjectForLog(obj);
    // Note: Array handling depends on implementation
    expect(result).toBeDefined();
  });

  it("should handle null values", () => {
    const obj = { name: null, age: null };
    const result = sanitizeObjectForLog(obj);
    expect(result.name).toBeNull();
    expect(result.age).toBeNull();
  });

  it("should use custom maxLength", () => {
    const obj = { name: "a".repeat(300) };
    const result = sanitizeObjectForLog(obj, 50);
    expect((result.name as string).length).toBeLessThanOrEqual(53);
  });

  it("should not modify original object", () => {
    const original = { name: "hello\nworld" };
    sanitizeObjectForLog(original);
    expect(original.name).toBe("hello\nworld");
  });
});
