// Unit tests for ZTM Error Types

import { describe, it, expect } from "vitest";
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
} from "./errors.js";

describe("ZTMError", () => {
  describe("base functionality", () => {
    it("should create error with default message", () => {
      const error = new (class extends ZTMError {})();
      expect(error.message).toBe("Unknown ZTM error");
    });

    it("should create error with cause", () => {
      const cause = new Error("Original error");
      const error = new (class extends ZTMError {})({}, cause);
      expect(error.cause).toBe(cause);
    });

    it("should include context", () => {
      const error = new (class extends ZTMError {})({ key: "value" });
      expect(error.context).toEqual({ key: "value" });
    });

    it("should serialize to JSON with context", () => {
      const error = new (class extends ZTMError {})({ foo: "bar" });
      const json = error.toJSON();

      expect(json.context).toEqual({ foo: "bar" });
    });
  });
});

describe("ZTMSendError", () => {
  it("should create error with peer info", () => {
    const error = new ZTMSendError({
      peer: "alice",
      messageTime: 1234567890,
    });

    expect(error.context.peer).toBe("alice");
    expect(error.context.messageTime).toBe(1234567890);
    expect(error.message).toContain("alice");
  });

  it("should include cause message", () => {
    const cause = new Error("Network error");
    const error = new ZTMSendError({
      peer: "alice",
      messageTime: 1234567890,
      cause,
    });

    expect(error.message).toContain("Network error");
  });

  it("should include content preview", () => {
    const error = new ZTMSendError({
      peer: "alice",
      messageTime: 1234567890,
      contentPreview: "Hello world!",
    });

    expect(error.context.contentPreview).toBe("Hello world!");
  });

  it("should include attemptedAt timestamp", () => {
    const error = new ZTMSendError({
      peer: "alice",
      messageTime: 1234567890,
    });

    expect(error.context.attemptedAt).toBeDefined();
  });
});

describe("ZTMWriteError", () => {
  it("should create error with file info", () => {
    const error = new ZTMWriteError({
      peer: "alice",
      messageTime: 1234567890,
      filePath: "/path/to/file",
    });

    expect(error.context.peer).toBe("alice");
    expect(error.context.filePath).toBe("/path/to/file");
    expect(error.context.messageTime).toBe(1234567890);
  });

  it("should include cause", () => {
    const cause = new Error("Permission denied");
    const error = new ZTMWriteError({
      peer: "alice",
      messageTime: 1234567890,
      filePath: "/path",
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe("ZTMReadError", () => {
  it("should create error with file info", () => {
    const error = new ZTMReadError({
      peer: "alice",
      filePath: "/path/to/file",
    });

    expect(error.context.peer).toBe("alice");
    expect(error.context.filePath).toBe("/path/to/file");
  });
});

describe("ZTMParseError", () => {
  it("should create error with parse context", () => {
    const error = new ZTMParseError({
      peer: "alice",
      filePath: "/path/to/file",
      parseDetails: "Unexpected token",
    });

    expect(error.context.peer).toBe("alice");
    expect(error.context.filePath).toBe("/path/to/file");
    expect(error.context.parseDetails).toBe("Unexpected token");
  });
});

describe("ZTMDiscoveryError", () => {
  it("should create error with discovery context", () => {
    const error = new ZTMDiscoveryError({
      operation: "discoverPeers",
      source: "mesh",
    });

    expect(error.context.operation).toBe("discoverPeers");
    expect(error.context.source).toBe("mesh");
  });

  it("should use default operation", () => {
    const error = new ZTMDiscoveryError({});
    expect(error.context.operation).toBe("discoverUsers");
  });
});

describe("ZTMApiError", () => {
  it("should create error with API context", () => {
    const error = new ZTMApiError({
      method: "POST",
      path: "/api/chat",
      statusCode: 500,
    });

    expect(error.context.method).toBe("POST");
    expect(error.context.path).toBe("/api/chat");
    expect(error.context.statusCode).toBe(500);
  });

  it("should include cause", () => {
    const cause = new Error("Connection refused");
    const error = new ZTMApiError({
      method: "GET",
      path: "/api/chat",
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe("ZTMTimeoutError", () => {
  it("should create error with timeout context", () => {
    const error = new ZTMTimeoutError({
      method: "POST",
      path: "/api/chat",
      timeoutMs: 5000,
    });

    expect(error.context.method).toBe("POST");
    expect(error.context.path).toBe("/api/chat");
    expect(error.context.timeoutMs).toBe(5000);
  });
});

describe("ZTMRuntimeError", () => {
  it("should create error with runtime context", () => {
    const error = new ZTMRuntimeError({
      operation: "initialize",
      reason: "failed",
    });

    expect(error.context.operation).toBe("initialize");
    expect(error.context.reason).toBe("failed");
  });
});

describe("ZTMConfigError", () => {
  it("should create error with config context", () => {
    const error = new ZTMConfigError({
      field: "username",
      value: "",
      reason: "Username is required",
    });

    expect(error.context.field).toBe("username");
    expect(error.context.value).toBe("");
    expect(error.context.reason).toBe("Username is required");
  });
});
