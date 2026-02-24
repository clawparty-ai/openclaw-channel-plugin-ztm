# getWatermarkKey 重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 使用 TypeScript 区分联合模式重构 getWatermarkKey 函数，替代复杂的运行时类型检查

**Architecture:** 定义 WatermarkKeyInput 区分联合类型，包含 message、group、peer 三种变体，使用 switch 语句处理每种情况

**Tech Stack:** TypeScript, Vitest

---

### Task 1: 添加 WatermarkKeyInput 类型定义

**Files:**
- Modify: `src/messaging/message-processor-helpers.ts:18-35`

**Step 1: 在 import 语句后添加类型定义**

在第 17 行 `import type { ZTMChatMessage } from '../types/messaging.js';` 后添加：

```typescript
/**
 * Watermark key input types - discriminated union for type-safe parameter handling
 */
export type WatermarkKeyInput =
  | { type: 'message'; data: ZTMChatMessage }
  | { type: 'group'; data: { group: string; creator: string } }
  | { type: 'peer'; data: string };
```

**Step 2: 提交**

```bash
git add src/messaging/message-processor-helpers.ts
git commit -m "feat: add WatermarkKeyInput discriminated union type"
```

---

### Task 2: 重写 getWatermarkKey 函数

**Files:**
- Modify: `src/messaging/message-processor-helpers.ts:35-60`

**Step 1: 替换 getWatermarkKey 函数实现**

将现有函数：

```typescript
export function getWatermarkKey(
  messageOrGroupInfo: ZTMChatMessage | { group?: string; creator?: string } | null | undefined,
  peer?: string
): string {
  // Handle ZTMChatMessage type (from dispatcher) - has 'peer' property
  if (messageOrGroupInfo && 'peer' in messageOrGroupInfo) {
    const msg = messageOrGroupInfo as ZTMChatMessage;
    // Check for group message
    if (msg.isGroup && msg.groupCreator && msg.groupId) {
      return `group:${msg.groupCreator}/${msg.groupId}`;
    }
    // Peer message - use peer field
    return msg.peer;
  }

  // Handle groupInfo object (from processor) - has 'group' and 'creator' properties
  if (messageOrGroupInfo && 'group' in messageOrGroupInfo && 'creator' in messageOrGroupInfo) {
    const groupInfo = messageOrGroupInfo as { group?: string; creator?: string };
    if (groupInfo.group && groupInfo.creator) {
      return `group:${groupInfo.creator}/${groupInfo.group}`;
    }
  }

  // Handle peer messages - use provided peer or fall back to empty string
  return peer || '';
}
```

替换为：

```typescript
/**
 * Generate a watermark key for message deduplication.
 * Uses discriminated union for type-safe parameter handling.
 *
 * @param input - Discriminated union containing message, group, or peer info
 * @returns Watermark key: "group:{creator}/{groupId}" for groups, or peer identifier
 */
export function getWatermarkKey(input: WatermarkKeyInput): string {
  switch (input.type) {
    case 'message': {
      const msg = input.data;
      if (msg.isGroup && msg.groupCreator && msg.groupId) {
        return `group:${msg.groupCreator}/${msg.groupId}`;
      }
      return msg.peer;
    }
    case 'group':
      return `group:${input.data.creator}/${input.data.group}`;
    case 'peer':
      return input.data;
  }
}
```

**Step 2: 运行测试验证**

```bash
npm test -- src/messaging/message-processor-helpers.test.ts 2>&1 | head -50
```

预期：编译错误，因为调用方还在使用旧签名

**Step 3: 提交**

```bash
git add src/messaging/message-processor-helpers.ts
git commit -m "refactor: rewrite getWatermarkKey with discriminated union"
```

---

### Task 3: 更新 dispatcher.ts 调用

**Files:**
- Modify: `src/messaging/dispatcher.ts:80`

**Step 1: 更新调用方式**

找到第 80 行：
```typescript
const watermarkKey = getWatermarkKey(message);
```

替换为：
```typescript
const watermarkKey = getWatermarkKey({ type: 'message', data: message });
```

**Step 2: 运行测试验证**

```bash
npm test -- src/messaging/dispatcher.test.ts 2>&1 | head -30
```

预期：PASS 或编译错误（取决于测试文件）

**Step 3: 提交**

```bash
git add src/messaging/dispatcher.ts
git commit -m "refactor: update getWatermarkKey call to use discriminated union"
```

---

### Task 4: 更新 processor.ts 调用

**Files:**
- Modify: `src/messaging/processor.ts:63`

**Step 1: 查看当前代码**

```bash
sed -n '60,70p' src/messaging/processor.ts
```

**Step 2: 更新调用方式**

找到第 63 行：
```typescript
const watermarkKey = getWatermarkKey(groupInfo, msg.sender);
```

替换为：
```typescript
let watermarkKey: string;
if (groupInfo.group && groupInfo.creator) {
  watermarkKey = getWatermarkKey({ type: 'group', data: groupInfo });
} else {
  watermarkKey = getWatermarkKey({ type: 'peer', data: msg.sender });
}
```

**Step 3: 运行测试验证**

```bash
npm test -- src/messaging/processor.test.ts 2>&1 | head -30
```

预期：PASS 或编译错误

**Step 4: 提交**

```bash
git add src/messaging/processor.ts
git commit -m "refactor: update getWatermarkKey call to use discriminated union"
```

---

### Task 5: 更新测试用例

**Files:**
- Modify: `src/messaging/message-processor-helpers.test.ts:52-103`

**Step 1: 替换测试用例**

将原有的 7 个测试用例替换为 4 个新测试：

```typescript
describe('getWatermarkKey', () => {
  it('should return peer from ZTMChatMessage', () => {
    const msg: ZTMChatMessage = {
      id: 'msg-1',
      content: 'hello',
      sender: 'alice',
      senderId: 'alice',
      timestamp: new Date(1000),
      peer: 'alice',
    };
    expect(getWatermarkKey({ type: 'message', data: msg })).toBe('alice');
  });

  it('should return group key for group message', () => {
    const msg: ZTMChatMessage = {
      id: 'msg-1',
      content: 'hello',
      sender: 'alice',
      senderId: 'alice',
      timestamp: new Date(1000),
      peer: 'alice',
      isGroup: true,
      groupCreator: 'creator1',
      groupId: 'group1',
    };
    expect(getWatermarkKey({ type: 'message', data: msg })).toBe('group:creator1/group1');
  });

  it('should return group key from groupInfo object', () => {
    const groupInfo = { creator: 'creator1', group: 'group1' };
    expect(getWatermarkKey({ type: 'group', data: groupInfo })).toBe('group:creator1/group1');
  });

  it('should return peer string directly', () => {
    expect(getWatermarkKey({ type: 'peer', data: 'bob' })).toBe('bob');
  });
});
```

**Step 2: 运行测试验证**

```bash
npm test -- src/messaging/message-processor-helpers.test.ts -t "getWatermarkKey" 2>&1
```

预期：所有 4 个测试 PASS

**Step 3: 提交**

```bash
git add src/messaging/message-processor-helpers.test.ts
git commit -m "test: update getWatermarkKey tests for discriminated union"
```

---

### Task 6: 运行完整测试套件

**Step 1: 运行完整测试**

```bash
npm test 2>&1 | tail -30
```

预期：所有测试 PASS

**Step 2: 提交**

```bash
git add -A
git commit -m "refactor: complete getWatermarkKey discriminated union migration"
```

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-02-24-getwatermarkkey-refactor-implementation-plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
