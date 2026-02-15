# Phase 4: Best Practices & Standards

## Framework & Language Findings

### Critical Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Duplicate `normalizeUsername`** | `src/core/dm-policy.ts`, `src/core/group-policy.ts` | 相同函数在两处定义 |
| **Unsafe Type Assertions** | `src/config/validation.ts:308,352,370` | 使用 `as` 无类型守卫 |

### High Priority Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **CommonJS require() in ESM** | `src/di/index.ts:39-42,52,65,82,102,118` | 在 ESM 上下文中使用 require() |
| **Long Function startAccountGateway** | `src/channel/gateway.ts:333-500` | 170 行函数需拆分 |
| **Synchronous File I/O** | `src/runtime/store.ts:134-136,147,197-200` | 阻塞事件循环 |
| **No Rate Limiting** | Multiple API files | 缺少请求限流 |

### Medium Priority Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Memory Cleanup Missing** | `src/runtime/state.ts:55` | pendingPairings Map 无清理 |
| **any type in retry.ts** | `src/utils/retry.ts:155` | 使用 any 而非 unknown |
| **Type Safety** | Multiple | 缺少 readonly 修饰符 |

### Low Priority Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Build Config** | tsconfig.json | 可添加 `verbatimModuleSyntax` |
| **Missing readonly** | Multiple arrays | 可添加 readonly 修饰符 |

---

## CI/CD & DevOps Findings

### Critical Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **Swallowed Polling Errors** | Critical | polling.ts 无完整 try-catch |

### High Priority Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **No Metrics/Observability** | High | 无计数器、日志聚合、监控面板 |
| **No Runbooks** | High | 无运维文档 |
| **No Rate Limiting** | High | API 调用无限流 |
| **Sync File I/O** | High | 阻塞事件循环 |

### Medium Priority Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **No Security Scanning** | Medium | CI 无 SAST/依赖扫描 |
| **No Deployment Automation** | Medium | 手动 npm publish |
| **No IaC** | Medium | 无基础设施配置 |
| **Path Validation** | Medium | 环境变量路径未验证 |

### Low Priority Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **No Health Checks** | Low | 无 /health 端点 |
| **Coverage Upload** | Low | 仅在 Node 22 上传覆盖率 |

---

## Positive Observations

1. **Good TypeScript strict mode** - `strict: true` in tsconfig
2. **Result pattern** - 一致的错误处理
3. **Dependency Injection** - 设计良好的 DI 容器
4. **Test coverage** - 全面测试文件
5. **Abstract filesystem** - Store 使用接口便于测试
6. **Modern ESM** - 正确使用 .js 扩展名
7. **No deprecated APIs** - 无弃用 API

---

## Priority Recommendations

### Framework/Language
1. **提取共享工具函数** - normalizeUsername 到 src/utils/string.ts
2. **替换 require() 为 import()** - DI 模块
3. **拆分长函数** - startAccountGateway
4. **添加速率限制器**

### DevOps
1. **添加 metrics 收集**
2. **创建运维 runbook**
3. **添加安全扫描到 CI**
4. **实现异步文件 I/O**
