# ZTM Chat Plugin User Guide

This guide provides detailed usage instructions for the ZTM Chat Plugin.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [DM Policy](#dm-policy)
- [Group Chat](#group-chat)
- [Message Processing](#message-processing)
- [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Install the Plugin

```bash
npm install @flomesh/ztm-chat
```

### 2. Run Setup Wizard

```bash
openclaw ztm-chat-wizard
```

The wizard will prompt you for:
- ZTM Agent URL (e.g., `http://localhost:7777`)
- DM policy (allow/deny/pairing)
- Whether to enable group chat

### 3. Auto-Discover Configuration

If you have an existing ZTM setup:

```bash
openclaw ztm-chat-discover
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentUrl` | string | required | ZTM Agent URL |
| `dmPolicy` | string | `"allow"` | DM policy: `allow`, `deny`, `pairing` |
| `allowFrom` | string[] | `[]` | Whitelist for pairing mode |
| `enableGroups` | boolean | `true` | Enable group chats |
| `autoReply` | string | - | Auto-reply message |
| `messagePath` | string | - | Message storage path |
| `apiTimeout` | number | `30000` | API timeout (ms) |

### Configuration Example

```typescript
const config = {
  agentUrl: 'http://localhost:7777',
  dmPolicy: 'allow',
  enableGroups: true,
  apiTimeout: 60000,
};
```

## DM Policy

### allow

Accept all DM messages:

```typescript
{ dmPolicy: 'allow' }
```

### deny

Deny all DM messages:

```typescript
{ dmPolicy: 'deny' }
```

### pairing

Only accept DMs from whitelisted users:

```typescript
{
  dmPolicy: 'pairing',
  allowFrom: ['alice', 'bob', 'charlie']
}
```

Pairing requests expire after 1 hour.

## Group Chat

### Enable Groups

```typescript
{
  enableGroups: true
}
```

### Group Permission Policy

| Policy | Description |
|--------|-------------|
| `all_members` | All group members can send messages |
| `only_mentioned` | Only @mentioned users can send |
| `admins` | Only admins can send |

### Usage Example

```typescript
const config = {
  agentUrl: 'http://localhost:7777',
  enableGroups: true,
  groupPolicy: {
    'my-group': { policy: 'only_mentioned' }
  }
};
```

## Message Processing

### Register Message Callback

```typescript
import { buildMessageCallback } from '@flomesh/ztm-chat';

const callback = buildMessageCallback(async (message) => {
  console.log('Received message:', message.content);

  // Process message and generate response
  const response = await myAI.process(message.content);

  return response;
});
```

### Send Message

```typescript
import { sendZTMMessage } from '@flomesh/ztm-chat';

await sendZTMMessage({
  peer: 'alice',
  message: 'Hello!',
  accountId: 'my-account'
});
```

## Troubleshooting

### Common Issues

#### 1. Connection Failed

**Problem**: Cannot connect to ZTM Agent

**Solutions**:
- Verify ZTM Agent is running: `ztm status`
- Check URL is correct
- Verify firewall settings

#### 2. Messages Not Received

**Problem**: Sent messages not received by recipient

**Solutions**:
- Check pairing status: `openclaw pairing list ztm-chat`
- Verify DM policy settings are correct
- Check logs: `openclaw logs ztm-chat`

#### 3. Timeout Errors

**Problem**: API request timeout

**Solutions**:
- Increase `apiTimeout` config value
- Check network connection
- Verify ZTM Agent load

### Log Levels

Adjust log verbosity:

```typescript
const config = {
  agentUrl: 'http://localhost:7777',
  logLevel: 'debug', // 'error', 'warn', 'info', 'debug'
};
```

### Get Help

- GitHub Issues: https://github.com/flomesh-io/openclaw-channel-plugin-ztm/issues
- Documentation: https://docs.ztm.chat
