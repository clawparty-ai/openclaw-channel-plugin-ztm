# Core Module

The Core module provides business logic for direct messages (DM) and group policies.

## Purpose

- DM policy enforcement
- Group policy management
- Message routing based on policies
- Access control for messages

## Key Exports

| Export | Description |
|--------|-------------|
| `DMPolicy` | Direct message policy |
| `GroupPolicy` | Group messaging policy |
| `createDMPolicy` | Create DM policy instance |
| `createGroupPolicy` | Create group policy instance |
| `evaluatePolicy` | Evaluate message against policy |
| `isMessageAllowed` | Check if message is allowed |
| `DMPolicyConfig` | DM policy configuration |
| `GroupPolicyConfig` | Group policy configuration |

## Policy Types

### DMPolicy
- Direct message access control
- Sender/recipient validation
- Rate limiting

### GroupPolicy
- Group membership validation
- Group admin permissions
- Message broadcast control

## Source Files

- `src/core/dm-policy.ts` - Direct message policy
- `src/core/group-policy.ts` - Group policy

## Usage Example

```typescript
import { createDMPolicy, isMessageAllowed } from './core/index.js';

const policy = createDMPolicy(config);
const allowed = await isMessageAllowed(policy, message);
```

## Related Documentation

- [Architecture - Core Policies](../architecture.md)
- [ADR-013 - Functional Policy Engine](../adr/ADR-013-functional-policy-engine.md)
