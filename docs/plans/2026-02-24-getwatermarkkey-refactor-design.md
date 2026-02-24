# getWatermarkKey 重构设计文档

## 概述

重构 `src/messaging/message-processor-helpers.ts` 中的 `getWatermarkKey` 函数，从复杂的运行时类型检查改为使用 TypeScript 区分联合（Discriminated Union）模式。

## 问题描述

当前实现存在以下问题：

1. **参数类型过于复杂** - 混合了 `ZTMChatMessage`、匿名对象、`null`/`undefined`
2. **运行时类型检查** - 使用 `'peer' in messageOrGroupInfo` 这种 `in` 操作符进行类型守卫
3. **可读性差** - 代码逻辑分散在多个条件分支中，难以理解和维护

## 解决方案

使用 TypeScript 区分联合（Discriminated Union）模式，定义明确的输入类型。

### 类型定义

```typescript
/**
 * Watermark key input types - discriminated union for type-safe parameter handling
 */
export type WatermarkKeyInput =
  | { type: 'message'; data: ZTMChatMessage }
  | { type: 'group'; data: { group: string; creator: string } }
  | { type: 'peer'; data: string };
```

### 函数实现

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

### 调用方修改

#### 1. src/messaging/dispatcher.ts:80

**修改前**：
```typescript
const watermarkKey = getWatermarkKey(message);
```

**修改后**：
```typescript
const watermarkKey = getWatermarkKey({ type: 'message', data: message });
```

#### 2. src/messaging/processor.ts:63

**修改前**：
```typescript
const watermarkKey = getWatermarkKey(groupInfo, msg.sender);
```

**修改后**：
```typescript
let watermarkKey: string;
if (groupInfo.group && groupInfo.creator) {
  watermarkKey = getWatermarkKey({ type: 'group', data: groupInfo });
} else {
  watermarkKey = getWatermarkKey({ type: 'peer', data: msg.sender });
}
```

## 测试用例更新

| 测试场景 | 输入 | 期望输出 |
|---------|------|---------|
| peer 消息 | `{ type: 'message', data: { peer: 'alice' } }` | `'alice'` |
| group 消息 | `{ type: 'message', data: { isGroup: true, groupCreator: 'c1', groupId: 'g1' } }` | `'group:c1/g1'` |
| groupInfo 对象 | `{ type: 'group', data: { creator: 'c1', group: 'g1' } }` | `'group:c1/g1'` |
| peer 字符串 | `{ type: 'peer', data: 'bob' }` | `'bob'` |

需要移除以下无效输入的测试用例（由调用方保证有效性）：
- `getWatermarkKey(null, 'bob')`
- `getWatermarkKey(null)`
- `getWatermarkKey({ creator: 'creator1' })` (不完整对象)
- `getWatermarkKey(undefined)`

## 优势

1. **类型安全** - TypeScript 编译器能够检查所有分支是否被处理
2. **可维护性** - 清晰的类型定义和 switch 语句易于理解和扩展
3. **自文档化** - 函数签名本身就是最好的文档
4. **IDE 支持** - 自动补全和类型推断更加准确

## 风险与缓解

- **调用方改动** - 需要修改两处调用点，但改动简单明确
- **测试用例调整** - 移除无效输入测试，由调用方保证输入有效性
