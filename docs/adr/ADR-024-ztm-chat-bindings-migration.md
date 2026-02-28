# ADR-024: ZTM Chat Bindings Migration for OpenClaw 2026.2.26+

## Status

Accepted

## Date

2026-02-27

## Context

After upgrading OpenClaw to `2026.2.26` or higher, ZTM Chat channel configurations using non-`default` account names cause routing errors:

```
channels.ztm-chat: accounts.default is missing and no valid account-scoped binding
exists for configured accounts (openclaw-bot). Channel-only bindings (no accountId)
match only default. Add bindings[].match.accountId for one of these accounts (or "*"),
or add channels.ztm-chat.accounts.default.
```

OpenClaw `2026.2.26` introduced a new **bindings** mechanism for routing inbound messages to different agents. Key rules:

1. **Bindings without `accountId` only match the `default` account**
2. Use `accountId: "*"` to match **all accounts** on the channel
3. If a channel has non-`default` named accounts, corresponding bindings must be configured

### Current Implementation Evidence

- **ZTM Plugin** (`src/onboarding/onboarding.ts`):
  - `summary()` method saves configuration
  - Previous logic only saved `accounts.{username}` without `accounts.default` or `bindings`

## Decision

Generate `accounts.{accountId}` and `bindings[].accountId` configuration. Do NOT add `accounts.default` as it causes duplicate messages when bindings are also present.

```typescript
// onboarding.ts - summary() method changes
const channelConfig =
  (currentConfig.channels?.['ztm-chat'] as Record<string, unknown>) || {};
const accounts = (channelConfig.accounts as Record<string, unknown>) || {};

// 1. Save account config (username key only)
// Note: Do NOT add accounts.default - it causes duplicate messages with bindings
accounts[accountId] = { ...config };

// 2. Build/update bindings (required for 2026.2.26+)
const existingBindings = (currentConfig.bindings as Record<string, unknown>[]) || [];

// Separate ztm-chat bindings from other channel bindings
const otherBindings = existingBindings.filter((b: any) => {
  const match = b?.match as Record<string, unknown> | undefined;
  return match?.channel !== 'ztm-chat';
});
const ztmChatBindings = existingBindings.filter((b: any) => {
  const match = b?.match as Record<string, unknown> | undefined;
  return match?.channel === 'ztm-chat';
});

// 3. Create new binding (with accountId)
const newBinding = {
  agentId: 'main', // Default agent
  match: {
    channel: 'ztm-chat',
    accountId: accountId,
  },
};

// 4. Add binding if none exists
const updatedBindings = [...otherBindings];
if (ztmChatBindings.length === 0) {
  updatedBindings.push(newBinding);
} else {
  updatedBindings.push(...ztmChatBindings);
}
```

### Drivers

1. OpenClaw 2026.2.26+ mandates bindings configuration
2. Existing users may be using older OpenClaw versions
3. Wizard is the primary config entry point, needs to work out of the box

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| **Only add `accounts.default`** | Simple | Does not meet new version binding requirement | Fails AC2 and AC3 |
| **Only add `bindings`** | Concise | Old version may not recognize bindings | Fails AC4 |
| **Add both** (chosen) | Compatible with old/new versions | Slightly redundant config | Best balance of all requirements |

## Key Trade-offs

- **Compatibility vs Simplicity**: Using `accounts.{accountId}` + `bindings` (without `accounts.default`) avoids duplicate messages
- **New vs Old**: Must support both OpenClaw < 2026.2.26 and >= 2026.2.26
- **Duplicate Prevention**: NOT adding `accounts.default` prevents duplicate message delivery when bindings are configured

## Related Decisions

- **ADR-015**: Onboarding Pairing Flow - Related to wizard behavior

## Consequences

### Positive

- Works with both old and new OpenClaw versions
- No user migration required
- No duplicate messages (avoids `accounts.default`)

### Negative

- Config requires both `accounts.{accountId}` and `bindings` entries

## Follow-ups

- Monitor user feedback on duplicate message handling
- Consider optimizing config structure if OpenClaw version detection becomes available

## References

- `src/onboarding/onboarding.ts` - Modified configuration save logic
- `src/onboarding/onboarding.test.ts` - Test cases
- OpenClaw bindings mechanism: `~/workspace/my-projects/openclaw/src/routing/bindings.ts`
