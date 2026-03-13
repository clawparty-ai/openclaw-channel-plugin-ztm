# ZTM Chat Plugin Documentation

Welcome to the ZTM Chat Plugin documentation. This section contains comprehensive guides for developers and users.

## Documentation Structure

```
docs/
├── README.md                    # Documentation index (this file)
├── user-guide.md                # End-user guide
├── developer-quickstart.md      # Developer quick start guide
├── architecture.md              # System architecture documentation
├── integration-examples.md      # Code examples and integration guide
├── troubleshooting.md           # Troubleshooting guide
├── api/
│   ├── README.md                # API documentation index
│   ├── reference.md             # API reference
│   ├── types.md                 # TypeScript type definitions
│   └── errors.md                # Error handling
└── adr/
    └── README.md                # Architecture Decision Records
```

## Quick Links

### For Users
- [User Guide](user-guide.md) - Getting started and configuration
- [Configuration Options](user-guide.md#configuration-options)
- [Troubleshooting](troubleshooting.md) - Common issues and solutions

### For Developers
- [Developer Quick Start](developer-quickstart.md) - Get started with development
- [System Architecture](architecture.md) - Detailed system architecture
- [Integration Examples](integration-examples.md) - Code examples and patterns
- [API Reference](api/reference.md) - Complete API documentation
- [Type Definitions](api/types.md) - TypeScript types
- [Error Handling](api/errors.md) - Error codes and handling
- [Architecture Decisions](adr/) - Technical decisions and rationale

## Generating Documentation

### Prerequisites

```bash
npm install
npm install --save-dev typedoc typedoc-plugin-markdown typedoc-plugin-versions
```

### Generate API Docs

```bash
# Generate TypeDoc documentation
npm run docs

# Watch mode for development
npm run docs:watch
```

Output will be generated to `docs/typedoc/`.

## API Documentation

### Core Modules

| Module | Description |
|--------|-------------|
| `channel` | OpenClaw plugin entry point, account lifecycle |
| `messaging` | Message processing pipeline |
| `api` | ZTM Agent API clients |
| `runtime` | Runtime state management |
| `config` | Configuration schema |

### Key Classes

- `ZTMApiClient` - Main API client for ZTM Agent communication
- `ChatProcessor` - High-level chat message processing
- `notifyMessageCallbacks` - Message routing to registered callbacks

## Examples

### Basic Configuration

```typescript
import { createZTMApiClient } from '@flomesh/ztm-chat';

const client = createZTMApiClient({
  agentUrl: 'http://localhost:7777',
  dmPolicy: 'allow',
  enableGroups: true,
});
```

### Processing Messages

```typescript
import { buildMessageCallback } from '@flomesh/ztm-chat';

const handler = buildMessageCallback(async (message) => {
  const response = await myAI.process(message.content);
  return response;
});
```

## Additional Resources

- [GitHub Repository](https://github.com/flomesh-io/openclaw-channel-plugin-ztm)
- [npm Package](https://www.npmjs.com/package/@flomesh/ztm-chat)
- [OpenClaw Documentation](https://docs.openclaw.dev)
