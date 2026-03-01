# ZTM Chat Onboarding Adapter

## Overview

The Onboarding Adapter provides standardized configuration management for the ZTM Chat channel, integrated with OpenClaw's onboarding system. It implements the `ChannelOnboardingAdapter` interface from the OpenClaw SDK.

## Features

### 1. Channel Status (`getStatus`)

Query current configuration status:

```typescript
const status = await adapter.getStatus({ cfg, accountOverrides, options });

// Returns:
// {
//   channel: 'ztm-chat',
//   configured: boolean,
//   statusLines: string[],
//   selectionHint: 'ZTM Chat (P2P)'
// }
```

**Status Lines** (when configured):
- Agent URL
- Username
- Mesh name

### 2. Non-interactive Configuration (`configure`)

Validates and returns existing configuration:

```typescript
const result = await adapter.configure({ cfg, runtime, prompter, ... });

// Returns: { cfg, accountId } if valid
// Returns: { cfg } if invalid or no account
```

**Use Cases**:
- Validate existing configuration on startup
- Return accountId for auto-connect scenarios
- Non-destructive validation (never modifies config)

### 3. Interactive Configuration (`configureInteractive`)

Full wizard-driven configuration:

```typescript
const result = await adapter.configureInteractive({
  cfg, runtime, prompter, label, configured, ...
});

// Returns: { cfg, accountId } on success
// Returns: 'skip' if user cancels or chooses to keep existing config
```

**Workflow**:
1. If already configured, prompts user to Keep or Update
2. If Update or not configured, runs ZTMChatWizard (6 steps)
3. Validates username for security
4. Returns new configuration with semantic accountId

### 4. Configuration Management (`configureWhenConfigured`)

Manage existing configuration:

```typescript
const result = await adapter.configureWhenConfigured({
  cfg, prompter, label, ...
});

// Returns: { cfg, accountId } after test
// Returns: 'skip' for update/remove (caller handles)
```

**Options**:
- **Test Connection**: Validates ZTM Agent connectivity
- **Update Configuration**: Returns 'skip' to trigger `configureInteractive`
- **Remove Configuration**: Displays removal instructions

### 5. Account Lifecycle (`onAccountRecorded`)

Called when account is successfully recorded:

```typescript
adapter.onAccountRecorded(accountId, options);
```

**Responsibilities**:
- Initializes runtime state via `AccountStateManager`
- Records audit log (with noop logger fallback)
- Gracefully handles DI container unavailability

## Command Line Usage

### Check Status

```bash
openclaw channels list
# Output includes: ZTM Chat (P2P) - Configured/Unconfigured
```

### Configure Channel

```bash
# Interactive (recommended)
openclaw onboard

# Select "ZTM Chat" from channel list
# Follow 6-step wizard:
# 1. Agent URL
# 2. Permit Source
# 3. Bot Username
# 4. Security Settings (DM Policy + Allow From)
# 5. Group Chat Settings
# 6. Summary & Confirm
```

### Test Connection

```bash
# Via onboard command
openclaw onboard
# Select "ZTM Chat" -> "Manage" -> "Test Connection"

# Or via channels command (when available)
openclaw channels test ztm-chat
```

### Remove Configuration

```bash
openclaw channels remove ztm-chat
```

## DM Policy

The adapter supports DM policy configuration:

| Policy | Description |
|--------|-------------|
| `pairing` | Only paired users can DM (default) |
| `allow` | Anyone can DM |
| `deny` | No one can DM |

```bash
openclaw channels set-dm-policy ztm-chat --policy allow
```

## Integration Points

| OpenClaw Command | Adapter Method | Description |
|-----------------|----------------|-------------|
| `openclaw channels list` | `getStatus()` | Display channel status |
| `openclaw onboard` | `configureInteractive()` | Full wizard flow |
| `openclaw channels configure` | `configure()` | Non-interactive validation |
| Channel management | `configureWhenConfigured()` | Test/update/remove options |
| Account created | `onAccountRecorded()` | Initialize runtime state |
| Channel removal | `disable()` | Remove channel config |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No config | Returns `configured: false` in status |
| Invalid config | Returns `{ cfg }` without accountId |
| Connection test fails | Shows sanitized error message (no internal details) |
| Wizard cancelled | Returns `'skip'` to cancel flow |
| DI container unavailable | Uses noop logger fallback (no crash) |

## Security Features

1. **Username Validation**: Defense-in-depth validation via `validateUsername()`
2. **Error Sanitization**: Internal errors never leaked to users
3. **Audit Logging**: All account recordings logged for security audit
4. **DI Container Safety**: Graceful degradation when dependencies unavailable

## Implementation Details

### Wizard Adapter Pattern

The adapter uses a bridge pattern to integrate OpenClaw's `WizardPrompter` with ZTM's `WizardPrompts` interface:

```typescript
function createWizardPrompterAdapter(prompter: WizardPrompter): WizardPrompts {
  return {
    ask: (q, def) => prompter.text({ message: q, initialValue: def }),
    select: (q, opts, labels) => prompter.select({ message: q, options: mapped }),
    confirm: (q, def) => prompter.confirm({ message: q, initialValue: def }),
    // ... other methods
  };
}
```

This ensures all 6 wizard steps are reused without duplication.

### Semantic Account IDs

The adapter uses the validated username as the accountId:

```typescript
const accountId = wizardResult.accountId; // = validated username
```

This provides semantic, readable account identifiers instead of UUIDs.

### State Initialization

Runtime state is initialized via `AccountStateManager`:

```typescript
void getOrCreateAccountState(accountId);
```

The state object is pre-populated with all required defaults (started: false, callbacks: Set, etc.).
