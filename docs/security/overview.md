# Security Overview

This document describes the security architecture and practices for the ZTM Chat Channel Plugin.

## Table of Contents

- [Security Principles](#security-principles)
- [Input Validation](#input-validation)
- [API Security](#api-security)
- [Data Handling](#data-handling)
- [Dependency Security](#dependency-security)
- [Best Practices](#best-practices)

## Security Principles

The plugin follows these core security principles:

1. **Defense in Depth** - Multiple layers of security controls
2. **Least Privilege** - Minimal permissions required for operation
3. **Fail Secure** - Default to secure behavior on errors
4. **Input Validation** - Validate all external inputs
5. **No Sensitive Data** - Plugin does not handle credentials or secrets

## Input Validation

### Configuration Validation

All configuration is validated at runtime using TypeBox schema validation:

```typescript
import { validateZTMChatConfig } from '@flomesh/ztm-chat/config';

const result = validateZTMChatConfig(userConfig);

if (!result.valid) {
  // Reject invalid configuration
  throw new ConfigValidationError(result.errors);
}
```

### Validation Rules

| Field | Validation |
|-------|------------|
| `agentUrl` | Must be valid URI format |
| `permitUrl` | Must be valid URI format |
| `meshName` | Alphanumeric, underscore, hyphen only (1-64 chars) |
| `username` | Alphanumeric, underscore, hyphen only (1-64 chars) |
| `apiTimeout` | Must be between 1000ms and 300000ms |
| `dmPolicy` | Must be one of: `'allow'`, `'deny'`, `'pairing'` |
| `groupPolicy` | Must be one of: `'open'`, `'disabled'`, `'allowlist'` |

### Message Input Validation

Incoming messages are validated and sanitized:

```typescript
import { normalizeIncomingMessage } from '@flomesh/ztm-chat/messaging';

// Validates message structure
// Sanitizes content
// Normalizes field formats
const normalized = normalizeIncomingMessage(rawMessage);
```

## API Security

### HTTPS Enforcement

All external API calls support HTTPS:

```typescript
const config = {
  agentUrl: 'https://agent.example.com:7777',  // Recommended
  permitUrl: 'https://permit.example.com:7779/permit',
};
```

### Request Timeout Protection

All API requests have configurable timeouts to prevent hanging:

```typescript
const config = {
  apiTimeout: 30000,  // 30 second timeout
};
```

### Retry Protection

Exponential backoff prevents request storms:

```typescript
import { retryWithBackoff } from '@flomesh/ztm-chat/utils';

await retryWithBackoff(
  async () => await apiClient.fetchMessages(),
  {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
  }
);
```

### Auth Error Non-Retry Policy

Authentication errors are not retried to prevent credential leakage:

```typescript
// Auth errors (401, 403) are not retried
// Only network errors and 5xx errors trigger retry
const shouldRetry = !isAuthError(error.statusCode);
```

## Data Handling

### No Sensitive Data Storage

The plugin does NOT handle:
- User passwords
- API keys
- Authentication tokens
- Payment information
- Personal identifiable information (PII)

### Message Content

Message content is processed in memory and not persisted:
- Processed messages are validated and normalized
- Content is passed to registered callbacks
- No message content is logged by default

### Runtime State

Runtime state (in `src/runtime/`) manages:
- Message watermarks (timestamps only)
- Connection status
- Callback registries
- Cache entries (configurable TTL)

State can be cleared on shutdown:

```typescript
import { clearAllAccountStates } from '@flomesh/ztm-chat/runtime';

await clearAllAccountStates();
```

### Persistence Layer

Data is persisted only for operational needs:

| Data | Storage | Location |
|------|---------|----------|
| Message watermarks | JSON files | `~/.ztm-openclaw/messages/` |
| Cache entries | In-memory | LRU with TTL |

## Dependency Security

### Dependency Management

Dependencies are locked to exact versions:

```json
{
  "openclaw": "2026.3.7",
  "zod": "4.3.6",
  "typescript": "5.9.3"
}
```

### Security Audit

Run periodic security audits:

```bash
npm audit
```

### Known Vulnerabilities

The plugin minimizes attack surface by:
- Using well-maintained dependencies
- Avoiding deprecated APIs
- Minimal external dependencies

## Best Practices

### Configuration Security

1. **Use HTTPS in Production**
   ```typescript
   const config = {
     agentUrl: 'https://ztm-agent.example.com:7777',
   };
   ```

2. **Set Appropriate Timeouts**
   ```typescript
   const config = {
     apiTimeout: 30000,  // 30 seconds for production
   };
   ```

3. **Restrict DM Policy**
   ```typescript
   const config = {
     dmPolicy: 'pairing',  // Only accept from whitelist
     allowFrom: ['trusted-user-1', 'trusted-user-2'],
   };
   ```

### Network Security

1. **Firewall Rules**
   ```bash
   # Allow only necessary ports
   ufw allow 7777/tcp  # ZTM Agent
   ```

2. **Network Segmentation**
   - Run ZTM Agent in isolated network segment
   - Use VPN for mesh communication

### Monitoring

1. **Log Monitoring**
   ```bash
   # Monitor for security events
   tail -f /var/log/ztm-chat/plugin.log | grep -i error
   ```

2. **Health Checks**
   ```typescript
   import { getAllAccountStates } from '@flomesh/ztm-chat/runtime';

   const states = getAllAccountStates();
   states.forEach(state => {
     console.log(`Account: ${state.accountId}`);
     console.log(`Connected: ${state.connected}`);
     console.log(`Mesh: ${state.meshConnected}`);
   });
   ```

## Security Considerations

### Trusted vs Untrusted Input

| Input Type | Trust Level | Validation |
|------------|-------------|------------|
| ZTM Agent API | Medium | Schema validation |
| User Configuration | High | TypeBox validation |
| Message Content | Low | Content normalization |
| Peer Messages | Low | Policy enforcement |

### Threat Model

The plugin addresses these threats:

| Threat | Mitigation |
|--------|------------|
| Invalid configuration | TypeBox schema validation |
| Message injection | Input normalization |
| API abuse | Rate limiting (via ZTM Agent) |
| Replay attacks | Watermark deduplication |
| Malicious peers | DM/Group policy enforcement |

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue
2. Email: security@flomesh.io
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Related Documentation

- [Configuration Reference](../configuration/reference.md)
- [Troubleshooting](../troubleshooting.md)
- [Architecture](../architecture.md)
