# Review Scope

## Target

整个项目 src/ 目录的全面代码审查。

## Files

### 源代码目录
- `src/api/` - API 通信层 (chat-api, file-api, mesh-api, message-api, ztm-api, request)
- `src/channel/` - 插件通道模块 (config, plugin, state, index)
- `src/config/` - 配置模块 (defaults, index)
- `src/core/` - 核心模块 (dm-policy, group-policy)
- `src/di/` - 依赖注入容器 (container, example-usage, index)
- `src/messaging/` - 消息处理核心 (dispatcher, inbound, processor, polling, watcher)
- `src/mocks/` - 模拟模块 (ztm-client)
- `src/onboarding/` - 入职模块 (index)
- `src/runtime/` - 运行时模块 (runtime, state, pairing-store, store)
- `src/test-utils/` - 测试工具 (mocks, index)
- `src/types/` - 类型定义 (api, common, config, errors, messaging, runtime)
- `src/utils/` - 工具函数 (concurrency, logger, result, retry, validation)

### 项目配置
- `tsconfig.json` - TypeScript 配置

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: TypeScript

## Review Phases

1. Code Quality & Architecture - 代码质量与架构审查
2. Security & Performance - 安全与性能审查
3. Testing & Documentation - 测试与文档审查
4. Best Practices & Standards - 最佳实践与标准审查
5. Consolidated Report - 综合报告
