# Integration Examples

This document provides practical code examples for integrating and using the ZTM Chat Channel Plugin.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Sending Messages](#sending-messages)
- [Receiving Messages](#receiving-messages)
- [Configuration Examples](#configuration-examples)
- [Advanced Usage](#advanced-usage)
- [Error Handling](#error-handling)
- [Testing](#testing)

## Basic Setup

### Minimal Example

```typescript
import { ztmChatPlugin, startAccountGateway } from "@flomesh/ztm-chat";

// Plugin is automatically registered when imported
// You just need to configure and start an account

const accountId = "my-ztm-account";

const config = {
  agentUrl: "http://localhost:8888",
  dmPolicy: "allow",
  enableGroups: true,
};

// Start the account gateway
await startAccountGateway(accountId, config);
```

### With OpenClaw Core

```typescript
import { OpenClaw } from "@openclaw/core";
import { ztmChatPlugin } from "@flomesh/ztm-chat";

const openclaw = new OpenClaw({
  plugins: [ztmChatPlugin],
});

// Configure your account
await openclaw.accounts.configure("ztm-chat", {
  agentUrl: "http://localhost:8888",
  dmPolicy: "pairing",
  allowFrom: ["peer1", "peer2"],
});

// Start listening for messages
await openclaw.accounts.start("ztm-chat");
```

## Sending Messages

### Basic Message Send

```typescript
import { sendZTMMessage } from "@flomesh/ztm-chat/messaging";

const result = await sendZTMMessage({
  account: "my-ztm-account",
  peerId: "peer-id-here",
  content: "Hello from ZTM Chat!",
});

if (result.success) {
  console.log("Message sent:", result.data.messageId);
} else {
  console.error("Failed to send:", result.error);
}
```

### Sending to a Group

```typescript
import { sendZTMMessage } from "@flomesh/ztm-chat/messaging";

const result = await sendZTMMessage({
  account: "my-ztm-account",
  groupId: "group-id-here",
  content: "Hello group!",
});

if (result.success) {
  console.log("Group message sent:", result.data.messageId);
}
```

### Sending with Options

```typescript
import { sendZTMMessage } from "@flomesh/ztm-chat/messaging";

const result = await sendZTMMessage({
  account: "my-ztm-account",
  peerId: "peer-id-here",
  content: "Message with options",
  options: {
    replyTo: "original-message-id",
    files: ["file-id-1", "file-id-2"],
  },
});
```

## Receiving Messages

### Using Message Callbacks

```typescript
import { buildMessageCallback, startAccountGateway } from "@flomesh/ztm-chat/channel";

// Build a message callback
const handleMessage = buildMessageCallback(async (message) => {
  console.log("Received message:", message.content);
  console.log("From:", message.sender);
  console.log("Type:", message.chatType);

  // Process the message
  await processMessage(message);

  // Optionally reply
  if (message.chatType === "dm") {
    await sendZTMMessage({
      account: message.accountId,
      peerId: message.sender,
      content: "Got your message!",
    });
  }
});

// Start account with callback
await startAccountGateway("my-account", config, handleMessage);
```

### Advanced Message Processing

```typescript
import { buildMessageCallback } from "@flomesh/ztm-chat/channel";
import type { ZTMChatMessage } from "@flomesh/ztm-chat/types";

const handleMessage = buildMessageCallback(async (message: ZTMChatMessage) => {
  // Filter by message type
  if (message.chatType === "group") {
    // Handle group messages
    await handleGroupMessage(message);
  } else if (message.chatType === "dm") {
    // Handle direct messages
    await handleDirectMessage(message);
  }

  // Access metadata
  console.log("Message ID:", message.id);
  console.log("Timestamp:", message.timestamp);
  console.log("Is reply:", message.isReply);

  // Access group info if available
  if (message.chatType === "group" && message.groupInfo) {
    console.log("Group name:", message.groupInfo.name);
    console.log("Group creator:", message.groupInfo.creator);
    console.log("Group policy:", message.groupInfo.policy);
  }
});
```

### Multiple Callbacks

```typescript
import {
  startAccountGateway,
  getOrCreateAccountState
} from "@flomesh/ztm-chat/channel";

const accountId = "my-account";
const state = getOrCreateAccountState(accountId);

// Register multiple callbacks
state.messageCallbacks.add(async (message) => {
  console.log("Callback 1: Logging message");
  await logToDatabase(message);
});

state.messageCallbacks.add(async (message) => {
  console.log("Callback 2: Processing with AI");
  await processWithAI(message);
});

state.messageCallbacks.add(async (message) => {
  console.log("Callback 3: Sending notifications");
  await sendNotification(message);
});

// All callbacks will be invoked for each message
```

## Configuration Examples

### Allow All DMs

```typescript
const config = {
  agentUrl: "http://localhost:8888",
  dmPolicy: "allow",  // Accept all direct messages
  enableGroups: true,
};
```

### Deny All DMs

```typescript
const config = {
  agentUrl: "http://localhost:8888",
  dmPolicy: "deny",  // Reject all direct messages
  enableGroups: false,
};
```

### Pairing Mode (Allowlist)

```typescript
const config = {
  agentUrl: "http://localhost:8888",
  dmPolicy: "pairing",  // Only accept from allowlist
  allowFrom: ["peer-id-1", "peer-id-2", "peer-id-3"],
  enableGroups: true,
};
```

### Full Configuration

```typescript
const config = {
  // Required
  agentUrl: "http://localhost:8888",

  // DM Policy: "allow" | "deny" | "pairing"
  dmPolicy: "pairing",

  // Allowlist for pairing mode
  allowFrom: ["trusted-peer-1", "trusted-peer-2"],

  // Group settings
  enableGroups: true,
  groupPolicy: "all_members",  // or "only_mentioned", "admins"

  // Message settings
  messagePath: "/var/ztm/messages",
  autoReply: false,

  // Timing settings
  apiTimeout: 30000,      // milliseconds

  // Logging
  logLevel: "info",  // "debug" | "info" | "warn" | "error"
};
```

### Programmatic Configuration

```typescript
import { resolveZTMChatAccount } from "@flomesh/ztm-chat/channel";

const config = await resolveZTMChatAccount({
  // Base URL
  agentUrl: process.env.ZTM_AGENT_URL || "http://localhost:8888",

  // Dynamic allowlist
  dmPolicy: "pairing",
  allowFrom: await getTrustedPeersFromDatabase(),

  // Feature flags
  enableGroups: process.env.ENABLE_GROUPS === "true",
  groupPolicy: process.env.GROUP_POLICY || "all_members",
});
```

## Advanced Usage

### Custom Message Processing Pipeline

```typescript
import {
  ChatProcessor,
  type MessagingContext
} from "@flomesh/ztm-chat/messaging";
import type { ZTMChat } from "@flomesh/ztm-chat/api";

class CustomChatProcessor extends ChatProcessor {
  protected async shouldProcessMessage(
    chat: ZTMChat,
    context: MessagingContext
  ): Promise<boolean> {
    // Add custom filtering logic
    if (chat.lastMessage?.content.includes("[SKIP]")) {
      return false;
    }

    // Call parent implementation
    return super.shouldProcessMessage(chat, context);
  }

  protected async postProcess(
    chats: ZTMChat[],
    context: MessagingContext
  ): Promise<void> {
    // Custom post-processing
    await this.analyzeChatPatterns(chats);

    // Call parent implementation
    await super.postProcess(chats, context);
  }

  private async analyzeChatPatterns(chats: ZTMChat[]): Promise<void> {
    // Your custom logic here
  }
}

// Use custom processor
const processor = new CustomChatProcessor(config, accountId);
await processor.process(chat);
```

### Direct API Client Usage

```typescript
import { createZTMApiClient } from "@flomesh/ztm-chat/api";

const apiClient = createZTMApiClient({
  baseUrl: "http://localhost:8888",
  timeout: 30000,
});

// List chats
const chatsResult = await apiClient.listChats();
if (chatsResult.success) {
  console.log("Chats:", chatsResult.data);
}

// Send message
const sendResult = await apiClient.sendMessage({
  peerId: "peer-id",
  content: "Hello!",
});
```

### Custom State Store Implementation

```typescript
import {
  type MessageStateStore,
  type MessageWatermark
} from "@flomesh/ztm-chat/runtime";

class CustomStateStore implements MessageStateStore {
  async getWatermark(
    accountId: string,
    chatId: string
  ): Promise<MessageWatermark | null> {
    // Your custom storage logic (e.g., Redis, database)
    return await redis.get(`watermark:${accountId}:${chatId}`);
  }

  async setWatermark(
    accountId: string,
    chatId: string,
    watermark: MessageWatermark
  ): Promise<void> {
    await redis.set(`watermark:${accountId}:${chatId}`, watermark);
  }

  // Implement other required methods...
}
```

### Runtime Integration

```typescript
import {
  RuntimeManager,
  setZTMRuntime,
  type Runtime
} from "@flomesh/ztm-chat/runtime";

// Create custom runtime
const customRuntime: Runtime = {
  getLogger: () => customLogger,
  getStore: () => customStateStore,
  getCache: () => customCache,
};

// Set the runtime
setZTMRuntime(customRuntime);

// Use the runtime
const runtime = RuntimeManager.getInstance().getRuntime();
const logger = runtime.getLogger();
```

## Error Handling

### Try-Catch Pattern

```typescript
import {
  sendZTMMessage,
  ZTMSendError
} from "@flomesh/ztm-chat";

try {
  const result = await sendZTMMessage({
    account: "my-account",
    peerId: "peer-id",
    content: "Hello",
  });

  if (result.success) {
    console.log("Sent:", result.data);
  } else {
    console.error("Error:", result.error);
  }
} catch (error) {
  if (error instanceof ZTMSendError) {
    console.error("Send failed:", error.message);
    console.error("Context:", error.context);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Result Type Pattern

```typescript
import { isSuccess, failure } from "@flomesh/ztm-chat/utils";
import { ZTMApiError } from "@flomesh/ztm-chat/types";

const result = await someOperation();

if (isSuccess(result)) {
  // Handle success
  console.log("Data:", result.data);
} else {
  // Handle error with type checking
  if (result.error instanceof ZTMApiError) {
    console.error("API Error:", result.error.statusCode);
    console.error("Endpoint:", result.error.endpoint);
  } else {
    console.error("Unknown error:", result.error);
  }
}
```

### Retry with Exponential Backoff

```typescript
import { retryWithBackoff } from "@flomesh/ztm-chat/utils";

const result = await retryWithBackoff(
  async () => {
    return await sendZTMMessage({
      account: "my-account",
      peerId: "peer-id",
      content: "Hello",
    });
  },
  {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
  }
);
```

## Testing

### Unit Test Example

```typescript
import { describe, it, expect, vi } from "vitest";
import { processIncomingMessage } from "@flomesh/ztm-chat/messaging";
import { testConfig, testAccountId } from "@flomesh/ztm-chat/test-utils";

describe("Message Processing", () => {
  it("should validate and normalize messages", async () => {
    const rawMessage = {
      id: "msg-1",
      peer: "peer-1",
      content: "Hello!",
      timestamp: Date.now(),
    };

    const normalized = processIncomingMessage(rawMessage, {
      config: testConfig,
      storeAllowFrom: [],
      accountId: testAccountId,
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.content).toBe("Hello!");
    expect(normalized?.sender).toBe("peer-1");
  });

  it("should filter messages based on DM policy", async () => {
    const rawMessage = {
      id: "msg-2",
      peer: "unknown-peer",
      content: "Hello!",
      timestamp: Date.now(),
    };

    const config = { ...testConfig, dmPolicy: "deny" };

    const normalized = processIncomingMessage(rawMessage, {
      config,
      storeAllowFrom: [],
      accountId: testAccountId,
    });

    expect(normalized).toBeNull();
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startAccountGateway, logoutAccountGateway } from "@flomesh/ztm-chat/channel";
import { sendZTMMessage } from "@flomesh/ztm-chat/messaging";

describe("Message Integration", () => {
  const accountId = "test-account";

  beforeAll(async () => {
    await startAccountGateway(accountId, {
      agentUrl: "http://localhost:8888",
      dmPolicy: "allow",
    });
  });

  afterAll(async () => {
    await logoutAccountGateway(accountId);
  });

  it("should send and receive messages", async () => {
    const result = await sendZTMMessage({
      account: accountId,
      peerId: "test-peer",
      content: "Test message",
    });

    expect(result.success).toBe(true);
  }, 10000);
});
```

### Mock API Client

```typescript
import { vi } from "vitest";
import type { ZTMApiClient } from "@flomesh/ztm-chat/api";

export const mockApiClient: ZTMApiClient = {
  listChats: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
  sendMessage: vi.fn().mockResolvedValue({
    success: true,
    data: { messageId: "mock-msg-1" },
  }),
  getChatHistory: vi.fn().mockResolvedValue({
    success: true,
    data: { messages: [] },
  }),
  // ... other methods
};
```

---

**Related Documentation:**
- [API Reference](api/README.md)
- [Developer Quick Start](developer-quickstart.md)
- [System Architecture](architecture.md)
