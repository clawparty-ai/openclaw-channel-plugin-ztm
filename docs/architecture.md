# System Architecture

This document provides a detailed explanation of the ZTM Chat Channel Plugin system architecture.

## Table of Contents

- [System Overview](#system-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Message Processing Pipeline](#message-processing-pipeline)
- [State Management](#state-management)
- [Dependency Injection](#dependency-injection)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)

## System Overview

```mermaid
graph TB
    subgraph "External Systems"
        ZTMAgent["ZTM Agent<br/>(HTTP API)"]
        OpenClaw["OpenClaw Core<br/>(AI Agent Framework)"]
    end

    subgraph "ZTM Chat Plugin"
        subgraph "Channel Layer"
            Plugin["plugin.ts<br/>Plugin Registration"]
            Gateway["gateway.ts<br/>Account Lifecycle"]
            Channel["channel.ts<br/>Channel Implementation"]
        end

        subgraph "Messaging Pipeline"
            Watcher["watcher.ts<br/>Long-polling Watcher"]
            Poller["polling.ts<br/>Polling Fallback"]
            ChatProc["chat-processor.ts<br/>Chat Orchestration"]
            Processor["processor.ts<br/>Message Processing"]
            Dispatcher["dispatcher.ts<br/>Message Dispatch"]
            Outbound["outbound.ts<br/>Message Sending"]
        end

        subgraph "Core Logic"
            DMPolicy["dm-policy.ts<br/>DM Policy"]
            GroupPolicy["group-policy.ts<br/>Group Policy"]
        end

        subgraph "Runtime Layer"
            RuntimeMgr["runtime.ts<br/>Runtime Manager"]
            AccountState["state.ts<br/>Account State"]
            StateStore["store.ts<br/>Persistent State"]
            Cache["cache.ts<br/>In-Memory Cache"]
        end

        subgraph "API Layer"
            ZTMApi["ztm-api.ts<br/>API Client"]
            ChatAPI["chat-api.ts<br/>Chat API"]
            MeshAPI["mesh-api.ts<br/>Mesh API"]
        end

        subgraph "DI Container"
            DIContainer["container.ts<br/>DI Container"]
        end
    end

    ZTMAgent <-->|HTTP/JSON| Watcher
    ZTMAgent <-->|HTTP/JSON| Poller
    ZTMAgent <-->|HTTP/JSON| ZTMApi
    ZTMApi --> ChatAPI
    ZTMApi --> MeshAPI

    Watcher --> ChatProc
    Poller --> ChatProc
    ChatProc --> Processor
    Processor --> Dispatcher
    Dispatcher -->|callback| OpenClaw
    OpenClaw --> Outbound
    Outbound --> ZTMApi

    Dispatcher --> DMPolicy
    Dispatcher --> GroupPolicy

    Gateway --> Channel
    Channel --> Watcher
    Channel --> RuntimeMgr
    RuntimeMgr --> AccountState
    AccountState --> StateStore
    AccountState --> Cache

    DIContainer -.->|provides| ZTMApi
    DIContainer -.->|provides| RuntimeMgr
    DIContainer -.->|provides| StateStore

    OpenClaw <-->|Plugin API| Plugin
    Plugin --> Gateway

    style ZTMAgent fill:#e1f5fe
    style OpenClaw fill:#f3e5f5
    style Watcher fill:#fff9c4
    style Poller fill:#fff9c4
    style Processor fill:#c8e6c9
    style Dispatcher fill:#c8e6c9
    style RuntimeMgr fill:#ffccbc
    style DIContainer fill:#d1c4e9
```

## Core Components

### 1. Channel Layer

| Component | Responsibility | Main Interfaces |
|-----------|----------------|-----------------|
| `plugin.ts` | Register plugin with OpenClaw | `registerPlugin()` |
| `gateway.ts` | Manage account lifecycle | `startAccountGateway()`, `stopAccountGateway()` |
| `channel.ts` | Implement channel interface | `onMessage()`, `sendMessage()` |
| `config.ts` | Resolve account configuration | `resolveZTMChatAccount()` |
| `state.ts` | Manage account state | `getOrCreateAccountState()` |

### 2. Messaging Pipeline

```mermaid
flowchart LR
    subgraph "Receive Stage"
        A[Watcher/Poller] --> B[ChatProcessor]
        B --> C[Processor]
    end

    subgraph "Process Stage"
        C --> D{Validate}
        D -->|Pass| E{Dedup Check}
        D -->|Fail| F[Discard]
        E -->|New| G[Normalize]
        E -->|Processed| F
    end

    subgraph "Dispatch Stage"
        G --> H[Dispatcher]
        H --> I{DM Policy}
        I -->|Allow| J{Group Policy}
        I -->|Deny| F
        J -->|Allow| K[Notify Callback]
        J -->|Deny| F
    end

    subgraph "Response Stage"
        K --> L[AI Agent]
        L --> M[Outbound]
        M --> N[ZTM Agent]
    end

    style A fill:#e3f2fd
    style C fill:#fff9c4
    style H fill:#c8e6c9
    style K fill:#f8bbd0
```

### 3. Runtime Layer

```mermaid
classDiagram
    class RuntimeManager {
        <<singleton>>
        -instance: RuntimeManager
        -runtime: Runtime
        +getInstance()
        +setRuntime()
        +getRuntime()
    }

    class Runtime {
        <<interface>>
        +getLogger()
        +getStore()
        +getCache()
    }

    class AccountRuntimeState {
        +accountId: string
        +config: ZTMChatConfig
        +apiClient: ZTMApiClient
        +messageCallbacks: Set
        +watermark: MessageWatermark
    }

    class MessageStateStore {
        +getWatermark()
        +setWatermark()
        +getFileMetadata()
    }

    class ZTMCache {
        -cache: Map
        +get()
        +set()
        +has()
        +delete()
    }

    RuntimeManager --> Runtime
    Runtime --> AccountRuntimeState
    AccountRuntimeState --> MessageStateStore
    AccountRuntimeState --> ZTMCache
```

## Data Flow

### Message Receive Flow

```mermaid
sequenceDiagram
    autonumber
    participant Agent as ZTM Agent
    participant Watcher as Message Watcher
    participant Proc as Message Processor
    participant Disp as Dispatcher
    participant AI as AI Agent

    Note over Agent,AI: Normal Message Receive Flow

    Agent->>Watcher: POST /watch (new message)
    activate Watcher
    Watcher->>Watcher: Extract message list
    Watcher->>Proc: processIncomingMessage()
    activate Proc
    Proc->>Proc: Validate message format
    Proc->>Proc: Check watermark deduplication
    Proc->>Proc: Normalize to ZTMChatMessage
    Proc->>Disp: notifyMessageCallbacks()
    activate Disp
    Disp->>Disp: Check DM policy
    Disp->>Disp: Check group policy
    alt Policy Pass
        Disp->>AI: Trigger message callback
        activate AI
        AI-->>Disp: Callback complete
        deactivate AI
    else Policy Deny
        Disp-->>Disp: Log rejection reason
    end
    deactivate Disp
    deactivate Proc
    deactivate Watcher

    Note over Agent,AI: Message processing complete
```

### Message Send Flow

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Agent
    participant Outbound as Outbound
    participant API as Chat API
    participant Agent as ZTM Agent

    Note over AI,Agent: Message Send Flow

    AI->>Outbound: sendZTMMessage()
    activate Outbound
    Outbound->>Outbound: Validate message content
    Outbound->>Outbound: Check message length
    Outbound->>API: sendChatMessage()
    activate API
    API->>API: Build request body
    API->>Agent: POST /chat/send
    activate Agent
    Agent-->>API: 200 OK (message ID)
    deactivate Agent
    API-->>Outbound: Result.success(messageId)
    deactivate API
    Outbound-->>AI: Send success
    deactivate Outbound

    alt Send Failure
        API--x API: Network error
        API->>API: Exponential backoff retry
        API->>API: Max retries reached
        API-->>Outbound: Result.failure(error)
        Outbound-->>AI: ZTMSendError
    end
```

### Watch + Polling Mode Switching

```mermaid
stateDiagram-v2
    [*] --> Idle: Start
    Idle --> WatchMode: Begin watching
    WatchMode --> WatchMode: Normal polling
    WatchMode --> PollingMode: Consecutive failures > threshold
    PollingMode --> WatchMode: Recovery success
    WatchMode --> [*]: Stop
    PollingMode --> [*]: Stop

    note right of WatchMode
        Long-polling mode
        High real-time
        Interval: 1s
    end note

    note right of PollingMode
        Polling fallback mode
        High reliability
        Interval: 2s (configurable)
    end note
```

## Message Processing Pipeline

### Processing Stages Detail

```mermaid
graph TB
    subgraph "Stage 1: Message Fetch"
        A1[Watcher<br/>Long-polling]
        A2[Poller<br/>Polling fallback]
    end

    subgraph "Stage 2: Chat Processing"
        B1[ChatProcessor<br/>Orchestration]
        B2[Classification<br/>DM/Group]
    end

    subgraph "Stage 3: Message Processing"
        C1[Validation<br/>Format check]
        C2[Deduplication<br/>Watermark]
        C3[Normalization<br/>Unified format]
    end

    subgraph "Stage 4: Policy Check"
        D1[DM Policy<br/>allow/deny/pairing]
        D2[Group Policy<br/>Permission check]
    end

    subgraph "Stage 5: Message Dispatch"
        E1[Callback Notification]
        E2[Concurrency Control<br/>Semaphore]
    end

    A1 --> B1
    A2 --> B1
    B1 --> B2
    B2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> D1
    D1 --> D2
    D2 --> E1
    E1 --> E2

    style A1 fill:#e3f2fd
    style A2 fill:#e3f2fd
    style B1 fill:#fff9c4
    style C1 fill:#ffe0b2
    style C2 fill:#ffe0b2
    style C3 fill:#ffe0b2
    style D1 fill:#c8e6c9
    style D2 fill:#c8e6c9
    style E1 fill:#f8bbd0
    style E2 fill:#f8bbd0
```

### Message Processing Helper Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `classifyChatType()` | `message-processor-helpers.ts` | Classify DM/Group messages |
| `getGroupInfo()` | `message-processor-helpers.ts` | Extract group information |
| `buildMessagingContext()` | `message-processor-helpers.ts` | Build processing context |

## State Management

### State Hierarchy

```mermaid
graph TB
    subgraph "Global State"
        RM[RuntimeManager<br/>Singleton]
        RT[Runtime<br/>Interface]
    end

    subgraph "Account State Pool"
        AS1[AccountState 1]
        AS2[AccountState 2]
        AS3[AccountState N]
    end

    subgraph "Single Account State"
        Config[Configuration]
        APIClient[API Client]
        Callbacks[Message Callback Set]
        WatchState[Watch State]
        MeshState[Mesh Connection State]
    end

    subgraph "Persistent Storage"
        MS[MessageStateStore]
        WS[Watermark Storage]
        FS[File Metadata]
        PS[Pairing Request Storage]
    end

    subgraph "In-Memory Cache"
        Cache[ZTMCache<br/>LRU]
    end

    RM --> RT
    RT --> AS1
    RT --> AS2
    RT --> AS3

    AS1 --> Config
    AS1 --> APIClient
    AS1 --> Callbacks
    AS1 --> WatchState
    AS1 --> MeshState

    AS1 --> MS
    MS --> WS
    MS --> FS
    MS --> PS

    AS1 --> Cache

    style RM fill:#d1c4e9
    style MS fill:#ffccbc
    style Cache fill:#c8e6c9
```

### Watermark Mechanism

```mermaid
flowchart LR
    subgraph "Watermark Update"
        A[Receive Message] --> B{Message timestamp<br/>> Watermark?}
        B -->|Yes| C[Process Message]
        B -->|No| D[Skip Processing]
        C --> E[Update Watermark]
        E --> F[Persist Storage]
    end

    subgraph "Watermark Structure"
        G[MessageWatermark]
        H[peerWatermarks<br/>Map<peerId, timestamp>]
        I[groupWatermarks<br/>Map<groupId, timestamp>]
        G --> H
        G --> I
    end

    style E fill:#c8e6c9
    style F fill:#ffccbc
```

## Dependency Injection

### DI Container Architecture

```mermaid
classDiagram
    class DIContainer {
        -services: Map
        +register()
        +resolve()
        +has()
        +dispose()
    }

    class ServiceDescriptor {
        +factory: FactoryFunction
        +lifetime: Lifetime
        +dependencies: Symbol[]
    }

    class Lifetime {
        <<enumeration>>
        Singleton
        Scoped
        Transient
    }

    class FactoryFunction {
        <<type>>
        Factory function that creates services
    }

    class ServiceSymbol {
        <<type>>
        Unique symbol for service keys
    }

    DIContainer --> ServiceDescriptor
    ServiceDescriptor --> Lifetime
    ServiceDescriptor --> FactoryFunction
    FactoryFunction : Uses Symbol as keys
```

### Service Registration Examples

| Symbol | Service | Lifetime | Dependencies |
|--------|---------|----------|--------------|
| `ZTM_RUNTIME` | `Runtime` | Singleton | - |
| `LOGGER` | `Logger` | Singleton | - |
| `STATE_STORE` | `MessageStateStore` | Scoped | `LOGGER` |
| `API_CLIENT` | `ZTMApiClient` | Scoped | `LOGGER` |
| `CACHE` | `ZTMCache` | Scoped | - |

## Error Handling

### Error Type Hierarchy

```mermaid
classDiagram
    class ZTMError {
        <<abstract>>
        #message: string
        #context: ErrorContext
        +toJSON()
    }

    class ZTMApiError {
        +statusCode: number
        +endpoint: string
    }

    class ZTMSendError {
        #context: SendErrorContext
    }

    class ZTMReadError {
        #context: ReadErrorContext
    }

    class ZTMWriteError {
        #context: WriteErrorContext
    }

    class ZTMTimeoutError {
        +timeout: number
    }

    class ZTMConfigError {
        +configPath: string
    }

    class ZTMParseError {
        +parseError: string
    }

    ZTMError <|-- ZTMApiError
    ZTMError <|-- ZTMSendError
    ZTMError <|-- ZTMReadError
    ZTMError <|-- ZTMWriteError
    ZTMError <|-- ZTMTimeoutError
    ZTMError <|-- ZTMConfigError
    ZTMError <|-- ZTMParseError
```

### Result Pattern

```typescript
// Success result
const success = success(data);

// Failure result
const failure = failure(new ZTMApiError("..."));

// Type guard
if (isSuccess(result)) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## Security Considerations

### Input Validation

| Input Type | Validation Rules | Location |
|------------|------------------|----------|
| Message content | Length ≤ 10KB, no malicious scripts | `processor.ts` |
| Peer ID | Format validation, length limit | `validation.ts` |
| File paths | Path traversal check | `paths.ts` |
| Config values | Schema validation | `config/validation.ts` |

### Log Sanitization

```typescript
// Automatically redact sensitive information
sanitizeLog({
  token: "secret-123",  // → "[REDACTED]"
  message: "hello",     // → "hello"
  password: "pass123"   // → "[REDACTED]"
});
```

---

**Related Documentation:**
- [Architecture Decision Records (ADR)](adr/README.md)
- [API Reference](api/README.md)
- [Developer Quick Start](developer-quickstart.md)
