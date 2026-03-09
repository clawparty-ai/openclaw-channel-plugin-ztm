# Configuration Reference

Complete configuration reference for the ZTM Chat Channel Plugin.

## Table of Contents

- [Configuration Schema](#configuration-schema)
- [Configuration Options](#configuration-options)
- [Default Values](#default-values)
- [Validation](#validation)
- [TypeScript Types](#typescript-types)

## Configuration Schema

The plugin uses [Zod](https://zod.dev/) for runtime type validation. The schema is defined in `src/config/schema.ts`.

## Configuration Options

### agentUrl

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Yes |
| Format | URI |
| Example | `http://localhost:7777`, `https://agent.example.com:7777` |

ZTM Agent HTTP endpoint URL for mesh communication.

```typescript
const config = {
  agentUrl: 'http://localhost:7777',
};
```

---

### permitUrl

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Yes |
| Format | URI |
| Default | `https://clawparty.flomesh.io:7779/permit` |

Permit server URL for mesh authentication and authorization.

```typescript
const config = {
  permitUrl: 'https://clawparty.flomesh.io:7779/permit',
};
```

---

### permitSource

| Property | Value |
|----------|-------|
| Type | `'server' \| 'file'` |
| Required | No |
| Default | `'server'` |

How to obtain `permit.json`:
- `'server'` - Fetch from permit server
- `'file'` - Load from local file

```typescript
const config = {
  permitSource: 'server',  // Default
};
```

```typescript
const config = {
  permitSource: 'file',
  permitFilePath: '/home/user/ztm/permit.json',
};
```

---

### permitFilePath

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Only when `permitSource` is `'file'` |
| Example | `/home/user/ztm/permit.json` |

Path to `permit.json` file when `permitSource` is `'file'`.

---

### meshName

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `'openclaw-mesh'` |
| Pattern | `^[a-zA-Z0-9_-]+$` |
| Min Length | 1 |
| Max Length | 64 |

Unique identifier for the ZTM mesh network.

```typescript
const config = {
  meshName: 'my-production-mesh',
};
```

---

### username

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `'openclaw-bot'` |
| Pattern | `^[a-zA-Z0-9_-]+$` |
| Min Length | 1 |
| Max Length | 64 |

Bot identifier used when communicating on the mesh.

```typescript
const config = {
  username: 'assistant-bot',
};
```

---

### enableGroups

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Required | No |
| Default | `true` |

Enable group messaging features (requires ZTM groups support).

```typescript
const config = {
  enableGroups: true,
};
```

---

### dmPolicy

| Property | Value |
|----------|-------|
| Type | `'allow' \| 'deny' \| 'pairing'` |
| Required | No |
| Default | `'pairing'` |

Control who can send direct messages:

| Policy | Description |
|--------|-------------|
| `'allow'` | Accept all DM messages |
| `'deny'` | Deny all DM messages |
| `'pairing'` | Require pairing approval or whitelist |

```typescript
const config = {
  dmPolicy: 'pairing',  // Default
};
```

---

### allowFrom

| Property | Value |
|----------|-------|
| Type | `string[]` |
| Required | No |
| Default | `undefined` |

Whitelist of usernames allowed to send messages when `dmPolicy` is `'pairing'`. Empty array or undefined allows all paired users.

```typescript
const config = {
  dmPolicy: 'pairing',
  allowFrom: ['alice', 'bob', 'charlie'],
};
```

---

### apiTimeout

| Property | Value |
|----------|-------|
| Type | `number` |
| Required | No |
| Default | `30000` |
| Minimum | `1000` |
| Maximum | `300000` |

Timeout in milliseconds for ZTM API requests.

```typescript
const config = {
  apiTimeout: 60000,  // 60 seconds
};
```

---

### groupPolicy

| Property | Value |
|----------|-------|
| Type | `'open' \| 'disabled' \| 'allowlist'` |
| Required | No |
| Default | `'allowlist'` |

Default policy for group messages:

| Policy | Description |
|--------|-------------|
| `'open'` | Allow all group messages |
| `'disabled'` | Block all group messages |
| `'allowlist'` | Only allow whitelisted senders |

```typescript
const config = {
  groupPolicy: 'allowlist',
};
```

---

### requireMention

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Required | No |
| Default | `true` |

Require @mention to process group messages.

```typescript
const config = {
  requireMention: true,
};
```

---

### groupPermissions

| Property | Value |
|----------|-------|
| Type | `Record<string, GroupPermissions>` |
| Required | No |

Per-group permission configuration. Key format is `creator/groupId`.

```typescript
const config = {
  groupPermissions: {
    'alice/group-123': {
      creator: 'alice',
      group: 'group-123',
      groupPolicy: 'allowlist',
      requireMention: true,
      allowFrom: ['alice', 'bob'],
      tools: {
        allow: ['read', 'write'],
        deny: ['admin'],
      },
    },
  },
};
```

#### GroupPermissions Schema

| Property | Type | Description |
|----------|------|-------------|
| `creator` | `string` | Group creator username |
| `group` | `string` | Group identifier |
| `groupPolicy` | `'open' \| 'disabled' \| 'allowlist'` | Group message policy |
| `requireMention` | `boolean` | Require @mention (default: true) |
| `allowFrom` | `string[]` | Allowed senders |
| `tools` | `GroupToolPolicy` | Allowed/denied tools |
| `toolsBySender` | `Record<string, ToolPolicy>` | Per-sender tool policies |

#### GroupToolPolicy Schema

| Property | Type | Description |
|----------|------|-------------|
| `allow` | `string[]` | List of allowed tools |
| `deny` | `string[]` | List of denied tools |

## Default Values

| Option | Default Value |
|--------|---------------|
| `agentUrl` | `http://localhost:7777` |
| `permitUrl` | `https://clawparty.flomesh.io:7779/permit` |
| `permitSource` | `'server'` |
| `meshName` | `'openclaw-mesh'` |
| `username` | `'openclaw-bot'` |
| `enableGroups` | `true` |
| `dmPolicy` | `'pairing'` |
| `allowFrom` | `undefined` |
| `apiTimeout` | `30000` (30 seconds) |
| `groupPolicy` | `'allowlist'` |
| `requireMention` | `true` |

## Validation

The plugin validates all configuration using Zod schema validation:

```typescript
import { validateZTMChatConfig, ZTMChatConfigSchema } from '@flomesh/ztm-chat/config';

const result = validateZTMChatConfig(yourConfig);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### Validation Errors

Validation errors include:

| Error Type | Description |
|------------|-------------|
| `required` | Required field is missing |
| `invalid_format` | Field format is invalid (e.g., not a valid URI) |
| `out_of_range` | Numeric value is outside allowed range |
| `type_mismatch` | Field type is incorrect |

## TypeScript Types

All configuration types are inferred from the Zod schema:

```typescript
import type { ZTMChatConfig, DMPolicy, GroupPolicy } from '@flomesh/ztm-chat/config';

const config: ZTMChatConfig = {
  agentUrl: 'http://localhost:7777',
  meshName: 'my-mesh',
  dmPolicy: 'pairing',
  // ... inferred from schema
};
```

### Type Exports

| Type | Description |
|------|-------------|
| `ZTMChatConfig` | Full configuration type |
| `DMPolicy` | `'allow' \| 'deny' \| 'pairing'` |
| `GroupPolicy` | `'open' \| 'disabled' \| 'allowlist'` |
| `ZTMChatConfigValidation` | Validation result type |
| `ConfigValidationError` | Single validation error |

## Complete Example

```typescript
import type { ZTMChatConfig } from '@flomesh/ztm-chat/config';

const config: ZTMChatConfig = {
  // Required
  agentUrl: 'http://localhost:7777',
  permitUrl: 'https://clawparty.flomesh.io:7779/permit',
  permitSource: 'server',

  // Optional - with defaults
  meshName: 'production-mesh',
  username: 'assistant-bot',
  enableGroups: true,
  dmPolicy: 'pairing',
  allowFrom: ['alice', 'bob'],
  apiTimeout: 30000,

  // Group configuration
  groupPolicy: 'allowlist',
  requireMention: true,
  groupPermissions: {
    'alice/team-group': {
      creator: 'alice',
      group: 'team-group',
      groupPolicy: 'allowlist',
      requireMention: false,
      allowFrom: ['alice', 'bob', 'charlie'],
    },
  },
};
```

## Related Documentation

- [User Guide](../user-guide.md)
- [Architecture](../architecture.md)
- [Troubleshooting](../troubleshooting.md)
