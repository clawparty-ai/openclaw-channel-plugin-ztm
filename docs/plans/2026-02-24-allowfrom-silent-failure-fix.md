# Fix allowFrom Silent Failure in Polling Mode

## Problem

当 `allowFromRepo.getAllowFrom()` 返回 `null` 时，polling.ts 直接 return 跳过处理，导致消息静默丢失。这与 watcher.ts 的行为不一致（watcher 使用 `getOrDefault` 继续处理）。

## Impact

- **安全影响**：当存储读取失败时，polling 模式下的消息被静默丢弃
- **不一致性**：watch 模式和 polling 模式行为不同
- **用户体验**：用户不知道有消息被丢失

## Solution

修改 `polling.ts`，使用 `getOrDefault(pollStoreAllowFrom, [])` 作为后备值，与 watcher.ts 保持一致。

## Files to Change

| File | Change |
|------|--------|
| `src/messaging/polling.ts:147-151` | 使用 `getOrDefault` 替换 null 检查 |

## Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| `getAllowFrom()` 成功 | 正常处理 | 正常处理 |
| `getAllowFrom()` 返回 `null` | 静默跳过 | 使用空数组 `[]` 后备，继续 DM Policy 检查 |

## Testing

1. 单元测试：模拟 `getAllowFrom` 返回 null 的场景
2. 集成测试：验证 polling 和 watch 模式行为一致
