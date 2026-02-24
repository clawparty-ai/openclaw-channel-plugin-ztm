# Singleton Proliferation - 统一依赖管理模式设计

## 问题描述

### Issue
The codebase exhibits pattern confusion between three different dependency management approaches:

- **DI Container Pattern** (src/di/container.ts): Symbol-based registration, type-safe lookups
- **Singleton Pattern** (src/runtime/runtime.ts): RuntimeManager singleton with static access
- **Module-Level State** (src/runtime/state.ts): AccountStateManager singleton, exported functions

### 影响范围

| 模式 | 引用次数 | 文件数 |
|------|----------|--------|
| `RuntimeManager.getInstance()` | 96 | 10 |
| `getOrCreateAccountState()` | 106 | 11 |
| `container.get()` | 8 | 3 |

### Architectural Concerns

1. **Testability**: Singletons require explicit reset between tests
2. **Lifecycle Management**: Unclear ownership - who cleans up what?
3. **Dependency Graph**: Hard to trace - some dependencies come from container, some from singletons
4. **Consistency**: New developers must understand three different patterns

---

## 设计决策

### Decision
**完全迁移到 DI Container**

- 移除 `RuntimeManager` 单例
- 移除 `AccountStateManager` 模块级单例
- 所有依赖通过 `container.get(DEPENDENCIES.XXX)` 获取

### 策略

- **一次性全部迁移**：修改所有调用点
- **完全替换**：移除旧 API，无兼容层
- **保持 API 风格一致**：新接口与旧接口行为一致

---

## 架构设计

### 1. RuntimeProvider 改造

```typescript
// src/runtime/runtime.ts

// Before: 单例模式
export class RuntimeManager {
  private static instance: RuntimeManager | null = null;

  static getInstance(): RuntimeManager { ... }
  static reset(): void { ... }

  getRuntime(): PluginRuntime { ... }
  setRuntime(runtime: PluginRuntime): void { ... }
}

// After: 工厂函数 + DI
export interface RuntimeProvider {
  setRuntime(runtime: PluginRuntime): void;
  getRuntime(): PluginRuntime;
  isInitialized(): boolean;
}

export function createRuntimeProvider(): RuntimeProvider {
  let runtime: PluginRuntime | null = null;
  return {
    setRuntime(rt: PluginRuntime) { runtime = rt; },
    getRuntime() {
      if (!runtime) throw new Error('Runtime not initialized');
      return runtime;
    },
    isInitialized() { return runtime !== null; }
  };
}
```

### 2. DI 服务创建函数改造

```typescript
// src/di/index.ts

// Before: 内部仍依赖单例
export function createRuntimeService(): () => IRuntime {
  const { RuntimeManager } = require('../runtime/runtime.js');
  const manager = RuntimeManager.getInstance();
  return () => ({
    get: () => manager.getRuntime(),
    isInitialized: () => manager.isInitialized(),
  });
}

// After: 纯 DI
export function createRuntimeService(): IRuntime {
  const provider = createRuntimeProvider();
  return {
    set: provider.setRuntime,
    get: provider.getRuntime,
    isInitialized: provider.isInitialized,
  };
}
```

### 3. AccountStateManager 改造

```typescript
// src/runtime/state.ts

// 移除模块级单例函数
// Before:
// export function getOrCreateAccountState(accountId: string): AccountRuntimeState
// export function getAccountStateManager(): AccountStateManager

// After:
// 仅导出类，通过 DI 注入使用
export class AccountStateManager { ... }
```

### 4. 调用点迁移示例

| 文件 | 旧调用 | 新调用 |
|------|--------|--------|
| `gateway.ts` | `RuntimeManager.getInstance().getRuntime()` | `container.get(DEPENDENCIES.RUNTIME).get()` |
| `watcher.ts` | `getOrCreateAccountState(accountId)` | 通过 `MessagingContext` 获取 |
| `polling.ts` | `getOrCreateAccountState(accountId)` | 通过 `MessagingContext` 获取 |

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/runtime/runtime.ts` | 移除单例，改为工厂函数 |
| `src/runtime/state.ts` | 移除模块级单例导出 |
| `src/di/index.ts` | 重构 createRuntimeService, createAccountStateManagerService |
| `src/channel/plugin.ts` | 更新初始化逻辑 |
| `src/messaging/watcher.ts` | 迁移到 DI |
| `src/messaging/polling.ts` | 迁移到 DI |
| `src/messaging/context.ts` | 确保通过 DI 获取状态 |
| 测试文件 (~10) | 更新 mock 方式 |

---

## 测试策略

### 1. 单元测试

- `RuntimeProvider` 工厂函数测试（5 个测试用例）
- DI 容器注册测试（3 个测试用例）
- 迁移验证测试（3 个测试用例，验证旧 API 已移除）

### 2. 集成测试

- 插件启动集成测试（2 个场景）
- 消息处理流水线测试（2 个场景）

### 3. 回归测试

- 所有现有测试无需修改继续通过
- 关键场景回归（单账户、多账户、错误恢复）

### 4. 测试执行计划

| 阶段 | 测试 | 预期结果 |
|------|------|----------|
| 1. 迁移前 | 运行现有测试 | 100% 通过（基线） |
| 2. 迁移中 | 单元测试 | 每个新函数 100% 覆盖 |
| 3. 迁移后 | 集成测试 | 所有场景通过 |
| 4. 完成 | 回归测试 | 0 个测试失败 |
| 5. 验证 | 迁移验证测试 | 旧 API 不存在 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 迁移范围大，可能遗漏调用点 | 迁移验证测试通过 AST 检查源码 |
| 测试覆盖不足 | 测试金字塔：单元→集成→回归 |
| 破坏现有功能 | 每个阶段验证后继续 |

---

## 成功标准

1. 所有源码中不包含 `RuntimeManager.getInstance()` 调用
2. 所有源码中不包含 `getOrCreateAccountState()` 调用
3. 所有测试通过（100%）
4. TypeScript 类型检查通过
5. Lint 检查通过
