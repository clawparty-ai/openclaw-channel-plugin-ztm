# Design: ZTMMeshInfo username Field Enhancement

## Overview

Enhance ZTM mesh join logic to verify username identity, preventing incorrect skip when agent joined mesh with a different username.

## Problem

Current `joinMeshIfNeeded` only checks `connected === true` to skip join. This causes issues when:
- ZTM Agent previously joined mesh with a different username
- Config is updated with new username
- System incorrectly thinks it's already connected and skips join

## Solution

### 1. Update ZTMMeshInfo Type

**File**: `src/types/api.ts`

```typescript
// Before
interface ZTMMeshInfo {
  name: string;
  connected: boolean;
  endpoints?: number;  // REMOVE
  errors?: Array<{ time: string; message: string }>;
}

// After
interface ZTMMeshInfo {
  name: string;
  connected: boolean;
  username: string;    // ADD - from .agent.username
  errors?: Array<{ time: string; message: string }>;
}
```

### 2. Update API Response Mapping

**File**: `src/api/mesh-api.ts`

Update `getMeshInfo` to map `.agent.username` to the new field.

### 3. Update joinMeshIfNeeded Logic

**File**: `src/channel/connectivity-manager.ts`

```typescript
// Before
if (alreadyConnected) {
  ctx.log?.info(`Already connected to mesh ${config.meshName}, skipping join`);
  return;
}

// After
if (alreadyConnected) {
  const meshUsername = preCheckResult.value.username;
  if (meshUsername === config.username) {
    ctx.log?.info(`Already connected to mesh ${config.meshName} as ${meshUsername}, skipping join`);
    return;
  }
  ctx.log?.info(`Connected as ${meshUsername}, but config expects ${config.username}, re-joining...`);
}
```

## Error Handling

- If API call fails or username is missing → treat as "need to join" (strict mode per user requirement)

## Testing

- Unit test for `joinMeshIfNeeded` with matching username (skip join)
- Unit test for `joinMeshIfNeeded` with mismatched username (re-join)
- Unit test for `joinMeshIfNeeded` with API error (re-join)

## Files to Modify

1. `src/types/api.ts` - ZTMMeshInfo type
2. `src/api/mesh-api.ts` - API response mapping
3. `src/channel/connectivity-manager.ts` - join logic
