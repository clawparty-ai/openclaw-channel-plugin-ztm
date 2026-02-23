# Gateway Pipeline 设计文档

**日期**: 2026-02-23
**主题**: startAccountGateway 重构 - Pipeline 模式 + 重试机制
**状态**: 已批准

## 背景

`startAccountGateway` 函数（`src/channel/gateway.ts:295-372`）存在以下问题：
- 圈复杂度高，嵌套深（5+ 层）
- 难以测试单个步骤
- 隐式错误处理
- 代码重复（`validateAgentConnectivity` 和 `configureAgent` 都检查端口）

## 设计目标

1. 提取为 Pipeline 模式，提升可测试性和可维护性
2. 添加重试机制，提升启动成功率
3. 精简重复步骤
4. 增强可观测性

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    startAccountGateway                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Pipeline   │───▶│   Retry      │───▶│   Step       │     │
│  │   Builder    │    │   Policy     │    │   Executor   │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                                       │               │
│         ▼                                       ▼               │
│  ┌──────────────┐                      ┌──────────────┐       │
│  │   Step       │◀─────────────────────│   Context    │       │
│  │   Registry   │                      │   (mutable)   │       │
│  └──────────────┘                      └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 类型定义

```typescript
type StepContext = {
  account: { config: ZTMChatConfig; accountId: string };
  config?: ZTMChatConfig;
  endpointName?: string;
  permitPath?: string;
  permitData?: PermitData;
  state?: AccountRuntimeState;
  messageCallback?: (msg: ZTMChatMessage) => Promise<void>;
  cleanupInterval?: NodeJS.Timeout;
  log?: GatewayLogger;
  setStatus?: StatusSetter;
};

interface PipelineStep {
  name: string;
  execute(ctx: StepContext): Promise<void>;
  retryPolicy: RetryPolicy;
}

interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  isRetryable: (error: Error) => boolean;
}
```

### 2. 预定义重试策略

| 策略名称 | maxAttempts | initialDelayMs | maxDelayMs | backoffMultiplier | 适用场景 |
|----------|-------------|----------------|------------|-------------------|----------|
| NO_RETRY | 1 | 0 | 0 | 1 | 配置错误 |
| NETWORK | 3 | 1000 | 10000 | 2 | 网络连接错误 |
| API | 2 | 1000 | 2000 | 1 | API 调用错误 |
| WATCHER | 2 | 500 | 1000 | 1 | Watcher 错误 |

### 3. Pipeline 步骤定义

| 步骤 | 名称 | 职责 | 重试策略 |
|------|------|------|----------|
| 1 | validate_config | 解析和验证配置 | NO_RETRY |
| 2 | validate_connectivity | 验证 agent 端口可达 | NETWORK |
| 3 | load_permit | 加载或请求 permit | API |
| 4 | join_mesh | 加入 ZTM mesh | NETWORK |
| 5 | initialize_runtime | 初始化 runtime | API |
| 6 | preload_message_state | 预加载消息状态（非阻塞） | NO_RETRY |
| 7 | setup_callbacks | 设置消息回调和清理 | WATCHER |

### 4. 精简优化

移除 `configureAgent` 步骤（与 `validateAgentConnectivity` 重复）。

## 数据流

```
输入: GatewayContext
  │
  ▼
Step 1: validate_config ─────────────▶ Context.config, endpointName, permitPath
  │
  ▼
Step 2: validate_connectivity ───────▶ 验证通过
  │
  ▼
Step 3: load_permit ─────────────────▶ Context.permitData
  │
  ▼
Step 4: join_mesh ───────────────────▶ Mesh 加入成功
  │
  ▼
Step 5: initialize_runtime ──────────▶ Context.state 初始化
  │
  ▼
Step 6: preload_message_state ───────▶ 消息状态预加载（非阻塞）
  │
  ▼
Step 7: setup_callbacks ─────────────▶ Context.messageCallback, cleanupInterval
  │
  ▼
输出: CleanupFn
```

## 错误处理

### GatewayError

```typescript
class GatewayError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly attempts: number,
    public readonly cause: Error
  );
}
```

### 错误分类

| 错误类型 | 判断条件 | 是否重试 |
|----------|----------|----------|
| 网络错误 | ECONNREFUSED, ETIMEDOUT, Cannot connect | ✅ |
| API 错误 | 包含 "API" 或 "Failed to" | ✅ |
| 配置错误 | 验证失败 | ❌ |
| Watcher 错误 | 包含 "watch" | ✅ |

## 可观测性

### 日志输出

- 步骤开始: `[accountId] Executing step: {stepName} (attempt {n}/{max})`
- 步骤成功: `[accountId] Step {stepName} completed in {duration}ms`
- 步骤失败: `[accountId] Step {stepName} failed (attempt {n}), retrying in {delay}ms: {error}`

### 指标收集（可选）

```typescript
interface GatewayMetrics {
  stepName: string;
  attempts: number;
  durationMs: number;
  success: boolean;
  error?: string;
}
```

## 测试方案

### 1. 单元测试策略

每个 Pipeline 组件都需要独立的单元测试：

#### 1.1 测试文件结构

```
src/channel/
├── gateway.ts                    # 主实现
├── gateway.test.ts               # 现有测试（保留）
├── gateway-pipeline.ts           # 新增: Pipeline 实现
├── gateway-pipeline.test.ts      # 新增: Pipeline 单元测试
├── gateway-retry.test.ts         # 新增: 重试逻辑测试
└── gateway-steps.test.ts         # 新增: 步骤定义测试
```

#### 1.2 测试覆盖矩阵

| 组件 | 测试内容 | Mock 依赖 |
|------|----------|-----------|
| `GatewayPipeline` | 构造、执行、步骤顺序 | 无（纯单元） |
| `executeStep` | 成功路径 | Step mock |
| `executeStep` | 重试成功 | Step mock + timer |
| `executeStep` | 重试耗尽 | Step mock + timer |
| `executeStep` | 不可重试错误 | Step mock |
| `createCleanupFunction` | 清理所有资源 | Runtime mock |
| `RetryPolicy` | 指数退避计算 | 无 |
| `RetryPolicy` | isRetryable 分类 | Error mock |
| `stepValidateConfig` | 成功/失败路径 | Config mock |
| `stepValidateConnectivity` | 成功/失败路径 | Network mock |
| `stepLoadPermit` | 文件/API 两种模式 | File/API mock |
| `stepJoinMesh` | 已连接/未连接 | Mesh API mock |
| `stepInitializeRuntime` | 成功/失败 | Runtime mock |
| `stepPreloadMessageState` | 非阻塞执行 | Store mock |
| `stepSetupCallbacks` | 回调设置 | Dispatcher mock |

#### 1.3 测试用例示例

```typescript
// gateway-pipeline.test.ts

describe('GatewayPipeline', () => {
  describe('execute', () => {
    it('should execute all steps in order', async () => {
      const ctx = createMockContext();
      const stepMocks = [
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
      ];

      const pipeline = new GatewayPipeline(ctx, stepMocks);
      await pipeline.execute();

      // 验证步骤按顺序执行
      expect(stepMocks[0]).toHaveBeenCalledBefore(stepMocks[1]);
      expect(stepMocks[1]).toHaveBeenCalledBefore(stepMocks[2]);
      // ... 依此类推
    });

    it('should stop on non-retryable error', async () => {
      const ctx = createMockContext();
      const stepMocks = [
        vi.fn().mockRejectedValue(new Error('Config invalid')),
      ];

      const pipeline = new GatewayPipeline(ctx, stepMocks);

      await expect(pipeline.execute()).rejects.toThrow('Config invalid');

      // 验证只执行了一次
      expect(stepMocks[0]).toHaveBeenCalledTimes(1);
    });
  });
});

describe('RetryPolicy', () => {
  describe('NETWORK', () => {
    it('should retry on ECONNREFUSED', () => {
      const policy = RETRY_POLICIES.NETWORK;
      const error = new Error('ECONNREFUSED');

      expect(policy.isRetryable(error)).toBe(true);
    });

    it('should retry on ETIMEDOUT', () => {
      const policy = RETRY_POLICIES.NETWORK;
      const error = new Error('connect ETIMEDOUT');

      expect(policy.isRetryable(error)).toBe(true);
    });

    it('should not retry on validation error', () => {
      const policy = RETRY_POLICIES.NETWORK;
      const error = new Error('Validation failed: missing required field');

      expect(policy.isRetryable(error)).toBe(false);
    });
  });

  describe('backoff calculation', () => {
    it('should calculate exponential backoff', () => {
      const policy = RETRY_POLICIES.NETWORK;
      let delay = policy.initialDelayMs;

      // attempt 1: 1000ms
      expect(delay).toBe(1000);

      // attempt 2: 2000ms
      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelayMs);
      expect(delay).toBe(2000);

      // attempt 3: 4000ms
      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelayMs);
      expect(delay).toBe(4000);
    });

    it('should cap at maxDelayMs', () => {
      const policy = { ...RETRY_POLICIES.NETWORK, maxDelayMs: 1500 };
      let delay = 1000;

      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelayMs);
      expect(delay).toBe(1500); // capped
    });
  });
});
```

### 2. 集成测试策略

#### 2.1 测试文件

- `gateway.integration.test.ts` - 现有，扩展
- `gateway-real.integration.test.ts` - 保留

#### 2.2 集成测试场景

| 场景 | 描述 | 预期结果 |
|------|------|----------|
| 完整启动流程 | 所有步骤正常执行 | 启动成功，返回 cleanupFn |
| 配置无效 | validateConfig 失败 | 抛出配置错误，不重试 |
| Agent 不可达 | validateConnectivity 失败 | 重试 3 次后失败 |
| Permit 获取失败 | loadPermit 失败 | 重试 2 次后失败 |
| Mesh 加入失败 | joinMesh 失败 | 重试 3 次后失败 |
| Runtime 初始化失败 | initializeRuntime 返回 false | 抛出初始化错误 |
| 部分成功后重启 | 在步骤 4 失败后重试 | 从头重试整个流程 |
| Cleanup 函数 | 调用 cleanupFn | 清理所有资源 |

#### 2.3 集成测试示例

```typescript
// gateway-pipeline.integration.test.ts

describe('GatewayPipeline Integration', () => {
  const accountId = 'test-account';

  beforeEach(() => {
    vi.useFakeTimers();
    // Setup mocks
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('should complete full pipeline on happy path', async () => {
    const ctx = createMockContext();
    const cleanupFn = await startAccountGateway(ctx);

    // 验证所有步骤都已执行
    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('validate_config')
    );
    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('validate_connectivity')
    );
    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('load_permit')
    );
    // ... 其他步骤

    // 验证 cleanupFn 可用
    expect(cleanupFn).toBeDefined();
    expect(typeof cleanupFn).toBe('function');
  });

  it('should retry on network failure at connectivity check', async () => {
    const ctx = createMockContext();

    // Mock: 第一次失败，第二次成功
    mockCheckPortOpen
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(true);

    await expect(startAccountGateway(ctx)).rejects.toThrow();

    // 验证重试了 3 次
    expect(mockCheckPortOpen).toHaveBeenCalledTimes(3);
  });

  it('should not retry on configuration error', async () => {
    const ctx = createMockContext({
      config: { ...validConfig, username: '' }, // 无效配置
    });

    await expect(startAccountGateway(ctx)).rejects.toThrow('validation');

    // 验证没有重试
    expect(mockCheckPortOpen).not.toHaveBeenCalled();
  });
});
```

### 3. E2E 测试策略

#### 3.1 测试场景

| 场景 | 环境 | 描述 |
|------|------|------|
| 真实 ZTM Agent | Real | 连接真实 ZTM Agent，完整流程 |
| 模拟网络故障 | Mock | 使用 Mock 模拟各种失败场景 |

#### 3.2 E2E 测试覆盖

```typescript
// gateway.e2e.test.ts

describe('Gateway E2E', () => {
  it('should connect to real ZTM mesh', async () => {
    // 需要真实的 ZTM Agent 配置
    const config = getRealZTMConfig();
    const ctx = createContext(config);

    const cleanup = await startAccountGateway(ctx);

    // 验证连接成功
    const state = getAccountState(config.accountId);
    expect(state.connected).toBe(true);

    // 清理
    await cleanup();
    expect(state.connected).toBe(false);
  }, 30000); // 30s timeout
});
```

### 4. 测试 Mock 策略

#### 4.1 Mock 层级

| 层级 | Mock 内容 | 工具 |
|------|-----------|------|
| 网络层 | `checkPortOpen`, API 调用 | `vi.fn()` |
| 文件系统 | `fs.existsSync`, `fs.readFileSync` | `vi.mock()` |
| Runtime | `initializeRuntime`, `stopRuntime` | `vi.mock()` |
| 消息 | `startMessageWatcher` | `vi.fn()` |

#### 4.2 Mock 示例

```typescript
// test-utils/mocks/gateway-mocks.ts

export const createMockCheckPortOpen = () => {
  return vi.fn().mockResolvedValue(true);
};

export const createMockLoadPermit = (permit?: PermitData) => {
  return vi.fn().mockImplementation((path: string) => {
    if (permit) return Promise.resolve(permit);
    return Promise.reject(new Error('Permit not found'));
  });
};

export const createMockJoinMesh = () => {
  return vi.fn().mockResolvedValue(true);
};
```

## 实现计划

详见 `docs/plans/2026-02-23-gateway-pipeline-implementation.md`

## 验收标准

1. [ ] Pipeline 模式正确实现，7 个步骤按顺序执行
2. [ ] 重试机制在可重试错误时正常工作
3. [ ] 不可重试错误立即抛出
4. [ ] 移除重复的 configureAgent 调用
5. [ ] 日志清晰展示步骤执行和重试状态
6. [ ] 单元测试覆盖所有步骤（≥15 个测试用例）
7. [ ] 集成测试覆盖完整流程（≥8 个场景）
8. [ ] E2E 测试验证真实环境
