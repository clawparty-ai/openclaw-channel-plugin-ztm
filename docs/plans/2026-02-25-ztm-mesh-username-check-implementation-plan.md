# ZTMMeshInfo Username Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance ZTM mesh join logic to verify username identity, preventing incorrect skip when agent joined mesh with a different username.

**Architecture:** Update ZTMMeshInfo type to include username, modify API response mapping, and update joinMeshIfNeeded to check both connected status and username match.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Update ZTMMeshInfo Type

**Files:**
- Modify: `src/types/api.ts:44-49`

**Step 1: Modify the type**

```typescript
// Before (lines 44-49)
export interface ZTMMeshInfo {
  name: string;
  connected: boolean;
  endpoints?: number;
  errors?: Array<{ time: string; message: string }>;
}

// After
export interface ZTMMeshInfo {
  name: string;
  connected: boolean;
  username: string;
  errors?: Array<{ time: string; message: string }>;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors related to this change)

**Step 3: Commit**

```bash
git add src/types/api.ts
git commit -m "refactor(api): replace endpoints with username in ZTMMeshInfo"
```

---

## Task 2: Update mesh-api.ts to Map username

**Files:**
- Modify: `src/api/mesh-api.ts:25-27`

**Step 1: Modify getMeshInfo to map username from response**

The API returns `.agent.username`, we need to map it to the top-level `username` field.

```typescript
// Before (lines 25-27)
async function getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError | ZTMTimeoutError>> {
  return request<ZTMMeshInfo>('GET', `/api/meshes/${config.meshName}`);
}

// After
async function getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError | ZTMTimeoutError>> {
  const result = await request<{
    name: string;
    connected: boolean;
    agent: { username: string };
    errors?: Array<{ time: string; message: string }>;
  }>('GET', `/api/meshes/${config.meshName}`);

  if (!result.ok) {
    return result as Result<ZTMMeshInfo, ZTMApiError | ZTMTimeoutError>;
  }

  return success({
    name: result.value.name,
    connected: result.value.connected,
    username: result.value.agent.username,
    errors: result.value.errors,
  });
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 4: Run tests**

Run: `npm test -- src/api/mesh-api.test.ts`
Expected: PASS (may need to update existing tests)

**Step 5: Commit**

```bash
git add src/api/mesh-api.ts
git commit -m "feat(api): map username from agent.username in getMeshInfo"
```

---

## Task 3: Update joinMeshIfNeeded Logic

**Files:**
- Modify: `src/channel/connectivity-manager.ts:136-163`

**Step 1: Read current implementation**

```typescript
export async function joinMeshIfNeeded(
  config: ZTMChatConfig,
  endpointName: string,
  permitData: PermitData,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): Promise<void> {
  // Create API client directly
  const preCheckClient = createZTMApiClient(config);
  let alreadyConnected = false;
  const preCheckResult = await preCheckClient.getMeshInfo();
  if (isSuccess(preCheckResult)) {
    alreadyConnected = preCheckResult.value.connected;
  }

  if (alreadyConnected) {
    ctx.log?.info(`Already connected to mesh ${config.meshName}, skipping join`);
    return;
  }

  ctx.log?.info(`Joining mesh ${config.meshName} as ${endpointName} via API...`);
  const joinSuccess = await joinMesh(config.agentUrl, config.meshName, endpointName, permitData);
  if (!joinSuccess) {
    throw new Error('Failed to join mesh');
  }
}
```

**Step 2: Modify to check username**

Replace the `alreadyConnected` check section with:

```typescript
  if (alreadyConnected) {
    const meshUsername = preCheckResult.value.username;
    if (meshUsername === config.username) {
      ctx.log?.info(`Already connected to mesh ${config.meshName} as ${meshUsername}, skipping join`);
      return;
    }
    ctx.log?.info(`Connected as ${meshUsername}, but config expects ${config.username}, re-joining...`);
  }
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/channel/connectivity-manager.ts
git commit -m "fix: check username match before skipping join mesh"
```

---

## Task 4: Update Tests

**Files:**
- Test: `src/channel/gateway-steps.test.ts` or related test files

**Step 1: Find existing tests for joinMeshIfNeeded**

Run: `grep -r "joinMeshIfNeeded" src --include="*.test.ts"`
Expected: List of test files using this function

**Step 2: Update or add tests for username check**

Create tests verifying:
- When connected && username matches → skip join
- When connected && username mismatches → re-join
- When API fails → re-join (strict mode)

**Step 3: Run tests**

Run: `npm test -- src/channel/gateway-steps.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/
git commit -m "test: add username check tests for joinMeshIfNeeded"
```

---

## Final Verification

Run all checks:
```bash
npm run typecheck && npm run lint && npm test
```

Expected: All pass

---

## Plan Complete

Execute each task sequentially. Commit after each task passes all checks.
