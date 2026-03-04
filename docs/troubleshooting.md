# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the ZTM Chat Channel Plugin.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Connection Issues](#connection-issues)
- [Message Issues](#message-issues)
- [Configuration Issues](#configuration-issues)
- [Performance Issues](#performance-issues)
- [Testing Issues](#testing-issues)
- [Debug Mode](#debug-mode)

## Quick Diagnostics

### Health Check Script

```typescript
import {
  getAllAccountStates,
  type AccountRuntimeState
} from "@flomesh/ztm-chat/runtime";

function checkHealth(): void {
  const states = getAllAccountStates();

  if (states.length === 0) {
    console.log("❌ No accounts configured");
    return;
  }

  states.forEach((state: AccountRuntimeState) => {
    console.log(`\nAccount: ${state.accountId}`);
    console.log(`  Connected: ${state.connected ? "✅" : "❌"}`);
    console.log(`  Mesh: ${state.meshConnected ? "✅" : "❌"}`);
    console.log(`  API Client: ${state.apiClient ? "✅" : "❌"}`);
    console.log(`  Callbacks: ${state.messageCallbacks.size}`);
    console.log(`  Watch Active: ${state.watchInterval ? "✅" : "❌"}`);
  });
}
```

### Common Status Checks

```bash
# Check if ZTM Agent is running
curl http://localhost:8888/health

# Check plugin status
npm run test

# Check logs
tail -f /var/log/ztm-chat/plugin.log
```

## Connection Issues

### Issue: Cannot Connect to ZTM Agent

**Symptoms:**
- `ECONNREFUSED` errors
- Timeout errors
- "Agent unavailable" messages

**Diagnosis:**

```typescript
import { createZTMApiClient } from "@flomesh/ztm-chat/api";

const apiClient = createZTMApiClient({
  baseUrl: "http://localhost:8888",
  timeout: 5000,
});

const healthResult = await apiClient.checkHealth();
if (!healthResult.success) {
  console.error("Agent health check failed:", healthResult.error);
}
```

**Solutions:**

1. **Verify Agent URL:**
```bash
# Check if agent is running
curl http://localhost:8888/health

# Or with custom port
curl http://localhost:9999/health
```

2. **Check Firewall:**
```bash
# Allow port 8888
sudo ufw allow 8888/tcp
```

3. **Verify Configuration:**
```typescript
const config = {
  agentUrl: process.env.ZTM_AGENT_URL || "http://localhost:8888",
  // Ensure URL is correct and includes protocol (http/https)
};
```

4. **Increase Timeout:**
```typescript
const config = {
  agentUrl: "http://localhost:8888",
  apiTimeout: 60000,  // Increase to 60 seconds
};
```

### Issue: Watch Mode Fails with Backoff

**Symptoms:**
- "Watch error, increasing backoff" messages
- Increasing message delivery latency due to backoff
- Watch error count increased

**Diagnosis:**

```typescript
import { getOrCreateAccountState } from "@flomesh/ztm-chat/runtime";

const state = getOrCreateAccountState("my-account");
console.log("Watch errors:", state.watchErrorCount);
console.log("Mode:", state.watchInterval ? "Watch" : "Polling");
```

**Solutions:**

1. **Check Agent Watch Support:**
```bash
# Test watch endpoint
curl -X POST http://localhost:8888/api/watch \
  -H "Content-Type: application/json" \
  -d '{}'
```

2. **Verify Watch Configuration:**
```typescript
const config = {
  agentUrl: "http://localhost:8888",
  // Reduce error threshold for faster fallback (default: 5)
  watchErrorThreshold: 3,
  // Adjust watch interval (default: 1000ms)
  watchInterval: 2000,
};
```

3. **Check Network Stability:**
```typescript
// Add retry logic for watch connections
import { retryWithBackoff } from "@flomesh/ztm-chat/utils";

await retryWithBackoff(
  async () => await startWatchMode(),
  { maxRetries: 5, initialDelay: 2000 }
);
```

### Issue: Mesh Connection Lost

**Symptoms:**
- "Mesh disconnected" errors
- Cannot send/receive messages
- `meshConnected: false`

**Diagnosis:**

```typescript
import { getOrCreateAccountState } from "@flomesh/ztm-chat/runtime";

const state = getOrCreateAccountState("my-account");
console.log("Mesh connected:", state.meshConnected);

// Check mesh status via API
const meshStatus = await state.apiClient?.getMeshStatus();
console.log("Mesh status:", meshStatus);
```

**Solutions:**

1. **Restart Mesh:**
```bash
# ZTM CLI
ztm mesh restart

# Or via API
curl -X POST http://localhost:8888/api/mesh/restart
```

2. **Verify Pairing:**
```bash
# List paired peers
ztm peer list

# Pair with new peer
ztm pair invite <peer-id>
```

3. **Enable Auto-Reconnect:**
```typescript
const config = {
  agentUrl: "http://localhost:8888",
  autoReconnect: true,
  reconnectInterval: 5000,
};
```

## Message Issues

### Issue: Messages Not Being Received

**Symptoms:**
- No message callbacks triggered
- Messages visible in ZTM Agent but not in plugin
- Watermark stuck

**Diagnosis:**

```typescript
import { getOrCreateAccountState } from "@flomesh/ztm-chat/runtime";

const state = getOrCreateAccountState("my-account");

// Check if watcher is active
console.log("Watch active:", !!state.watchInterval);

// Check message callbacks
console.log("Callbacks registered:", state.messageCallbacks.size);

// Check watermark
import { MessageStateStore } from "@flomesh/ztm-chat/runtime";
const store = new MessageStateStore();
const watermark = await store.getWatermark("my-account", "chat-id");
console.log("Watermark:", watermark);
```

**Solutions:**

1. **Verify Callbacks Registered:**
```typescript
import { buildMessageCallback } from "@flomesh/ztm-chat/channel";

const callback = buildMessageCallback(async (message) => {
  console.log("Received:", message);
});

// Ensure callback is added to state
state.messageCallbacks.add(callback);
```

2. **Check Watermark:**
```typescript
// Reset watermark to force reprocessing
await store.setWatermark("my-account", "chat-id", {
  lastMessageTimestamp: 0,
  lastProcessedId: null,
});
```

3. **Verify DM Policy:**
```typescript
// Check if messages are being filtered
if (message.chatType === "dm") {
  const policyResult = checkDmPolicy(message.sender, config, []);
  console.log("Policy result:", policyResult);
  // { allowed: boolean, reason: string, action: string }
}
```

4. **Check Group Policy:**
```typescript
import { checkGroupPermission } from "@flomesh/ztm-chat/core";

if (message.chatType === "group") {
  const result = checkGroupPermission({
    groupCreator: message.groupInfo?.creator,
    sender: message.sender,
    groupConfig: config,
  });
  console.log("Group permission:", result);
}
```

### Issue: Duplicate Messages

**Symptoms:**
- Same message received multiple times
- Callback triggered more than once

**Diagnosis:**

```typescript
import { processIncomingMessage } from "@flomesh/ztm-chat/messaging";

// Check if deduplication is working
const result1 = processIncomingMessage(rawMessage, context);
const result2 = processIncomingMessage(rawMessage, context);

// Second call should return null (already processed)
console.log("First call:", result1);  // Should be message
console.log("Second call:", result2); // Should be null
```

**Solutions:**

1. **Verify Watermark Updates:**
```typescript
import { MessageStateStore } from "@flomesh/ztm-chat/runtime";

const store = new MessageStateStore();

// Ensure watermark is being updated after processing
await store.setWatermark(accountId, chatId, {
  lastMessageTimestamp: message.timestamp,
  lastProcessedId: message.id,
});
```

2. **Check Store Persistence:**
```typescript
// Verify store is working correctly
const watermark = await store.getWatermark(accountId, chatId);
console.log("Current watermark:", watermark);

// If watermark is not persisting, check file permissions
// Default path: ~/.ztm-openclaw/messages/
```

3. **Enable Debug Logging:**
```typescript
const config = {
  agentUrl: "http://localhost:8888",
  logLevel: "debug",  // Enable detailed logging
};
```

### Issue: Message Send Fails

**Symptoms:**
- `ZTMSendError` thrown
- "Failed to send message" errors
- Timeout on send

**Diagnosis:**

```typescript
import { sendZTMMessage, isSuccess } from "@flomesh/ztm-chat/messaging";

const result = await sendZTMMessage({
  account: "my-account",
  peerId: "peer-id",
  content: "Hello",
});

if (!isSuccess(result)) {
  console.error("Send error:", result.error);
  console.error("Context:", result.error.context);
  console.error("Status:", result.error.statusCode);
}
```

**Solutions:**

1. **Verify Peer Exists:**
```bash
# List known peers
ztm peer list

# Check if peer is online
ztm peer status <peer-id>
```

2. **Check Message Length:**
```typescript
import { MAX_MESSAGE_LENGTH } from "@flomesh/ztm-chat/constants";

if (content.length > MAX_MESSAGE_LENGTH) {
  throw new Error(`Message too long: ${content.length} > ${MAX_MESSAGE_LENGTH}`);
}
```

3. **Verify Message Content:**
```typescript
// Sanitize message content
import { sanitizeMessageContent } from "@flomesh/ztm-chat/utils";

const sanitized = sanitizeMessageContent(rawContent);
console.log("Sanitized:", sanitized);
```

4. **Increase Timeout:**
```typescript
const config = {
  agentUrl: "http://localhost:8888",
  apiTimeout: 60000,  // 60 seconds
};
```

## Configuration Issues

### Issue: Invalid Configuration

**Symptoms:**
- `ZTMConfigError` thrown
- Plugin fails to start
- "Invalid configuration" messages

**Diagnosis:**

```typescript
import { validateZTMChatConfig } from "@flomesh/ztm-chat/config";

const result = validateZTMChatConfig(yourConfig);

if (!result.success) {
  console.error("Validation errors:", result.errors);
  // Array of validation errors with field paths
}
```

**Solutions:**

1. **Use Configuration Schema:**
```typescript
import type { ZTMChatConfig } from "@flomesh/ztm-chat/types";

const config: ZTMChatConfig = {
  agentUrl: "http://localhost:8888",
  dmPolicy: "allow",  // Must be "allow" | "deny" | "pairing"
  enableGroups: true,
  // ... Type checking will help catch errors
};
```

2. **Validate Before Use:**
```typescript
import { validateZTMChatConfig } from "@flomesh/ztm-chat/config";

const validated = validateZTMChatConfig(yourConfig);
if (!validated.success) {
  throw new Error(`Invalid config: ${validated.errors.join(", ")}`);
}
```

3. **Use Defaults:**
```typescript
import { getDefaultConfig } from "@flomesh/ztm-chat/config";

const config = {
  ...getDefaultConfig(),
  agentUrl: "http://localhost:8888",
  // Override only what you need
};
```

### Issue: DM Policy Not Working

**Symptoms:**
- Messages from blocked peers still arrive
- Allowed peers are blocked

**Diagnosis:**

```typescript
import { checkDmPolicy } from "@flomesh/ztm-chat/core";

const result = checkDmPolicy(
  "peer-id",
  { dmPolicy: "pairing", allowFrom: ["peer-1", "peer-2"] },
  []
);

console.log("Allowed:", result.allowed);
console.log("Reason:", result.reason);
console.log("Action:", result.action);
// "process" | "ignore" | "request_pairing"
```

**Solutions:**

1. **Verify Policy Setting:**
```typescript
const config = {
  dmPolicy: "pairing",  // Correct
  // NOT: "pairingmode" or "pairing_mode"
};
```

2. **Check Allowlist:**
```typescript
const config = {
  dmPolicy: "pairing",
  allowFrom: ["peer-1", "peer-2"],  // Must be array of peer IDs
};
```

3. **Test Policy:**
```typescript
import { checkDmPolicy } from "@flomesh/ztm-chat/core";

// Test each peer
const peers = ["peer-1", "peer-2", "peer-3"];
peers.forEach(peer => {
  const result = checkDmPolicy(peer, config, []);
  console.log(`${peer}: ${result.action}`);
});
```

## Performance Issues

### Issue: High Memory Usage

**Symptoms:**
- Memory grows over time
- GC pauses
- OOM errors

**Diagnosis:**

```typescript
import { ZTMCache } from "@flomesh/ztm-chat/runtime";

const cache = new ZTMCache({ maxSize: 1000 });
console.log("Cache size:", cache.size);
console.log("Cache keys:", Array.from(cache.keys()));
```

**Solutions:**

1. **Limit Cache Size:**
```typescript
import { ZTMCache } from "@flomesh/ztm-chat/runtime";

const cache = new ZTMCache({
  maxSize: 500,  // Reduce from default 1000
  ttl: 300000,   // 5 minutes TTL
});
```

2. **Clear Old State:**
```typescript
import { removeAccountState } from "@flomesh/ztm-chat/runtime";

// Remove accounts no longer in use
await removeAccountState("old-account-id");
```

3. **Monitor Memory:**
```typescript
setInterval(() => {
  const usage = process.memoryUsage();
  console.log("Memory:", {
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
  });
}, 60000); // Every minute
```

### Issue: Slow Message Processing

**Symptoms:**
- High latency in message delivery
- Messages queue up
- Callback delays

**Diagnosis:**

```typescript
import { getOrCreateAccountState } from "@flomesh/ztm-chat/runtime";

const state = getOrCreateAccountState("my-account");

// Check semaphore permits (concurrent processing)
console.log("Active permits:", state.messageSemaphore?.toString());
```

**Solutions:**

1. **Increase Concurrent Processing:**
```typescript
import { MESSAGE_SEMAPHORE_PERMITS } from "@flomesh/ztm-chat/constants";

// Note: This is a constant, may require code modification
// Default is 10 concurrent message processing
```

2. **Optimize Callbacks:**
```typescript
// Use async callbacks properly
const callback = buildMessageCallback(async (message) => {
  // Don't block! Use await for async operations
  await processAsync(message);

  // Avoid heavy synchronous work
  setImmediate(() => {
    heavyProcessing(message);
  });
});
```

3. **Monitor Processing Time:**
```typescript
import { logger } from "@flomesh/ztm-chat/utils";

const callback = buildMessageCallback(async (message) => {
  const start = Date.now();
  await processMessage(message);
  const duration = Date.now() - start;

  if (duration > 1000) {
    logger.warn(`Slow message processing: ${duration}ms`);
  }
});
```

## Testing Issues

### Issue: Tests Failing

**Symptoms:**
- Unit tests fail
- Integration tests timeout
- Flaky tests

**Diagnosis:**

```bash
# Run tests with verbose output
npm test -- --reporter=verbose

# Run specific test file
npm test -- src/messaging/processor.test.ts

# Run with coverage
npm run test:coverage
```

**Solutions:**

1. **Check Test Setup:**
```typescript
// Ensure test environment is set up
import { describe, it, expect, beforeEach } from "vitest";

describe("My Test", () => {
  beforeEach(() => {
    // Reset state before each test
    vi.clearAllMocks();
    RuntimeManager.reset();
  });

  it("should work", async () => {
    // Test implementation
  });
});
```

2. **Fix Timeouts:**
```typescript
// Increase test timeout if needed
it("should complete within time", async () => {
  // Test implementation
}, 30000); // 30 second timeout
```

3. **Mock External Dependencies:**
```typescript
import { vi } from "vitest";

vi.mock("@flomesh/ztm-chat/api", () => ({
  createZTMApiClient: vi.fn(() => mockClient),
}));
```

## Debug Mode

### Enable Debug Logging

```typescript
const config = {
  agentUrl: "http://localhost:8888",
  logLevel: "debug",  // Enable debug logging
};
```

### Enable Trace Logging

```typescript
import { logger } from "@flomesh/ztm-chat/utils";

// Override log level at runtime
logger.setLevel("trace");

// Trace all message processing
logger.trace("Processing message:", message);
```

### Debug Flags

```bash
# Enable Node.js debug mode
NODE_DEBUG=* npm test

# Enable TypeScript source map support
NODE_OPTIONS="--enable-source-maps" npm test

# Debug with VS Code
# Use .vscode/launch.json configuration
```

---

**Still Having Issues?**

- 📮 Email: support@flomesh.io
- 💬 Discussions: [GitHub Discussions](https://github.com/flomesh-io/openclaw-channel-plugin-ztm/discussions)
- 🐛 Report: [GitHub Issues](https://github.com/flomesh-io/openclaw-channel-plugin-ztm/issues)

**Related Documentation:**
- [Developer Quick Start](developer-quickstart.md)
- [System Architecture](architecture.md)
- [Integration Examples](integration-examples.md)
