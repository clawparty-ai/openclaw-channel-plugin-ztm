# ADR-021: Username Validation Before Mesh Join

## Status

Accepted

## Date

2026-02-26

## Context

When a user initiates a mesh join operation, the system previously allowed any username to be sent to the ZTM network without local validation. This could result in:

- Invalid usernames reaching the mesh network
- Confusing error messages from the remote API
- Poor user experience with late failure feedback

The username is a critical identifier in the P2P mesh network and should be validated before any network call is made.

### Current Implementation Evidence

- `src/channel/gateway.ts` - Mesh join logic with username validation
- Recent commit added `isValidUsername()` check before `meshJoin()`

## Decision

Validate username locally before initiating mesh join:

```typescript
// gateway.ts - Validate before network call
async function joinMesh(config: ZTMChatConfig, accountId: string): Promise<void> {
  // Validate username locally first
  if (!isValidUsername(config.username)) {
    throw new ValidationError(`Invalid username: ${config.username}. Must be 1-50 alphanumeric characters.`);
  }

  // Only proceed to network call if local validation passes
  await apiClient.meshJoin(config.agentUrl, config.meshName, config.username);
}

function isValidUsername(username: string): boolean {
  // 1-50 characters, alphanumeric and underscore only
  const usernameRegex = /^[a-zA-Z0-9_]{1,50}$/;
  return usernameRegex.test(username);
}
```

### Validation Rules

| Rule | Constraint | Error Message |
|------|------------|---------------|
| Length | 1-50 characters | "Username must be 1-50 characters" |
| Characters | Alphanumeric + underscore only | "Username can only contain letters, numbers, and underscores" |
| Required | Non-empty | "Username is required" |

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| **Remote validation only** | Simpler code | Late feedback, wasted network calls | Poor UX |
| **No validation** | Minimal code | Invalid data propagates | Security risk |
| **Local first (chosen)** | Fast feedback, less network waste | Slight code complexity | Best user experience |

## Key Trade-offs

- **Fail-fast vs late failure**: Local validation catches errors immediately
- **Code complexity vs network efficiency**: Slight increase in code, significant reduction in failed API calls
- **Validation strictness**: Allow underscore for compatibility with existing systems

## Related Decisions

- **ADR-020**: Configuration Schema & Validation - Username format defined in schema

## Consequences

### Positive

- **Fast feedback**: Users see validation errors immediately
- **Reduced network traffic**: Invalid requests never reach the mesh
- **Clear error messages**: Specific validation failures guide correct input
- **Security improvement**: Prevents injection of malformed identifiers

### Negative

- **Validation duplication**: Schema validation + runtime validation (acceptable trade-off)
- **Maintenance**: Two places to update if username rules change

## References

- `src/channel/gateway.ts` - Gateway implementation
- `src/config/schema.ts` - Username schema definition
