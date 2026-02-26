# Glossary

Project-specific terminology and definitions for the ZTM Chat Channel Plugin.

## Table of Contents

- [Core Terms](#core-terms)
- [ZTM Terms](#ztm-terms)
- [OpenClaw Terms](#openclaw-terms)
- [Message Pipeline Terms](#message-pipeline-terms)
- [Configuration Terms](#configuration-terms)
- [Security Terms](#security-terms)

## Core Terms

### ZTM (Zero Trust Mesh)

A decentralized peer-to-peer messaging network that provides secure, trustless communication between nodes. ZTM uses cryptographic identities and end-to-end encryption.

### ZTM Chat Plugin

A plugin for OpenClaw that integrates ZTM Chat functionality, enabling OpenClaw agents to send and receive messages through the ZTM mesh network.

### Channel Plugin

An OpenClaw extension point that provides a specific communication channel (like ZTM Chat, Slack, Discord). The plugin handles account lifecycle, message receiving, and message sending.

---

## ZTM Terms

### ZTM Agent

The local agent running on a node that provides HTTP API access to the ZTM mesh network. Default port is 7777.

### Mesh Network

A decentralized network of ZTM nodes that can communicate with each other directly (P2P) without central servers.

### Pairing

The process of establishing a trusted connection between two ZTM peers. After pairing, peers can exchange messages securely.

### Permit

Authentication credentials required to join a ZTM mesh network. Can be obtained from a permit server or loaded from a file.

### Permit Server

A server that issues permits for mesh authentication. Default: `https://clawparty.flomesh.io:7779/permit`

### Mesh Name

A unique identifier for a ZTM mesh network. All nodes in the same mesh use the same mesh name.

### Peer

Another node in the ZTM mesh network that can communicate with your node.

### Peer ID

A unique identifier for a peer in the ZTM network.

---

## OpenClaw Terms

### OpenClaw

A framework for building AI agents with extensible channel integrations. Provides plugin architecture for adding new communication channels.

### Account

In OpenClaw context, an account represents a single configuration for a channel plugin. Each account has its own credentials, settings, and runtime state.

### Account Lifecycle

The phases an account goes through: creation, initialization, running, and shutdown. The plugin's Gateway manages this lifecycle.

### Callback

A function registered to handle incoming messages. Multiple callbacks can be registered per account.

### Message Callback

A callback function invoked when a new message is received. The callback receives the processed message and returns a response.

---

## Message Pipeline Terms

### Message Watcher

Component that long-polls or watches the ZTM Agent for new messages. Located in `src/messaging/watcher.ts`.

### Message Processor

Component that validates, deduplicates, and normalizes incoming messages. Located in `src/messaging/processor.ts`.

### Message Dispatcher

Component that delivers processed messages to registered callbacks. Located in `src/messaging/dispatcher.ts`.

### Watermark

A marker tracking the last processed message timestamp/ID. Used for deduplication to prevent reprocessing old messages.

### Deduplication

The process of filtering out duplicate messages using watermarks and LRU caching.

### Outbound Messages

Messages sent from the bot to ZTM mesh peers. Handled by `src/messaging/outbound.ts`.

---

## Configuration Terms

### DM Policy

Controls who can send direct messages to the bot:

| Policy | Description |
|--------|-------------|
| `allow` | Accept all DM messages |
| `deny` | Deny all DM messages |
| `pairing` | Only accept from whitelisted or paired users |

### Group Policy

Controls group message handling:

| Policy | Description |
|--------|-------------|
| `open` | Allow all group messages |
| `disabled` | Block all group messages |
| `allowlist` | Only allow whitelisted senders |

### Require Mention

When enabled, group messages must @mention the bot to be processed.

### Allowlist

A list of allowed senders. Used with `dmPolicy: 'pairing'` or `groupPolicy: 'allowlist'`.

### API Timeout

Maximum time (in milliseconds) to wait for ZTM Agent API responses.

---

## Security Terms

### TypeBox

A runtime type validation library used for configuration schema validation. Provides type safety at runtime.

### Schema Validation

Process of validating configuration against a defined schema using TypeBox.

### Exponential Backoff

A retry strategy that increases wait time between retries (1s, 2s, 4s, 8s...) to prevent request storms.

### Rate Limiting

Controlled by the ZTM Agent, limits the number of requests to prevent abuse.

---

## Architecture Terms

### Gateway

Component that manages the account lifecycle: initialization, connection, message handling, and shutdown. Located in `src/channel/gateway.ts`.

### Runtime State

In-memory state managed per account, including:
- API client instance
- Connection status
- Message callbacks
- Watch intervals
- Cache entries

### Runtime Manager

Singleton that manages all account states. Located in `src/runtime/manager.ts`.

### LRU Cache

Least Recently Used cache for deduplication. Automatically evicts oldest entries when full.

### TTL (Time To Live)

Expiration time for cache entries. After TTL expires, entries are automatically removed.

### Semaphore

Concurrency control mechanism limiting simultaneous message processing. Default: 10 concurrent.

---

## API Terms

### API Client

Client for communicating with ZTM Agent. Created with `createZTMApiClient()`.

### Health Check

API call to verify ZTM Agent connectivity. Returns agent status and version.

### Long Poll

A polling method where the server holds the request until new data is available, reducing request frequency.

### Watch Mode

Real-time message delivery using server-sent events or long polling. Preferred over simple polling.

---

## Error Terms

### ZTMError

Base error class for all ZTM-related errors.

### ZTMConfigError

Error thrown when configuration validation fails.

### ZTMConnectionError

Error thrown when connection to ZTM Agent fails.

### ZTMSendError

Error thrown when sending a message fails.

---

## File Locations

| Term | File Path |
|------|-----------|
| Plugin entry | `src/channel/plugin.ts` |
| Gateway | `src/channel/gateway.ts` |
| Message watcher | `src/messaging/watcher.ts` |
| Message processor | `src/messaging/processor.ts` |
| Message dispatcher | `src/messaging/dispatcher.ts` |
| Outbound messages | `src/messaging/outbound.ts` |
| Config schema | `src/config/schema.ts` |
| Config defaults | `src/config/defaults.ts` |
| Runtime manager | `src/runtime/manager.ts` |
| API client | `src/api/client.ts` |

---

## Related Documentation

- [Architecture](architecture.md)
- [Configuration Reference](configuration/reference.md)
- [Security Overview](security/overview.md)
- [User Guide](user-guide.md)
