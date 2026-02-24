/**
 * Dependency Injection Usage Example
 * @module di/example-usage
 * Demonstrates how to refactor plugin.ts to use DI container
 */

// ============================================================================
// BEFORE (Direct Imports - Tight Coupling)
// ============================================================================
/*
import { createZTMApiClient } from "../api/ztm-api.js";
import { logger } from "../utils/logger.js";
import { getZTMRuntime } from "../runtime.js";

const apiClient = createZTMApiClient(config);
const runtime = getZTMRuntime();
const log = logger;

// Use services directly...
const result = await apiClient.getChats();
log.info("Chats loaded");
runtime.doSomething();
*/

// ============================================================================
// AFTER (Dependency Injection - Loose Coupling with ISP)
// ============================================================================
/*
import {
  container,
  DEPENDENCIES,
  createDependencyKey,
  createLogger,
  createConfigService,
  createApiReaderService,
  createApiSenderService,
  createApiDiscoveryService,
  createRuntimeService,
  type ILogger,
  type IConfig,
  type IChatReader,
  type IChatSender,
  type IDiscovery,
  type IRuntime,
} from "../di/index.js";

// Services are lazy-loaded from container
const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
const config = container.get<IConfig>(DEPENDENCIES.CONFIG);

// Use segregated interfaces - each component gets only what it needs
const chatReader = container.get<IChatReader>(DEPENDENCIES.API_CLIENT_READER);
const chatSender = container.get<IChatSender>(DEPENDENCIES.API_CLIENT_SENDER);
const discovery = container.get<IDiscovery>(DEPENDENCIES.API_CLIENT_DISCOVERY);
const runtime = container.get<IRuntime>(DEPENDENCIES.RUNTIME);

// Use services through specific interfaces...
const result = await chatReader.getChats();
logger.info("Chats loaded");
const meshInfo = await discovery.getMeshInfo();
*/

// ============================================================================
// TEST USAGE (Mock Injection)
// ============================================================================
/*
// In tests, replace container with mock:
import { container, DEPENDENCIES } from "../di/index.js";
import { vi } from "vitest";

describe("Channel Plugin with DI", () => {
  beforeEach(() => {
    // Reset container and mocks
    container.reset();
    vi.clearAllMocks();

    // Register mock services
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    container.registerInstance(DEPENDENCIES.LOGGER, mockLogger);

    const mockConfig = {
      get: vi.fn(() => mockConfigData),
      isValid: vi.fn(() => true),
    };
    container.registerInstance(DEPENDENCIES.CONFIG, mockConfig);

    const mockApiClient = {
      getChats: vi.fn(() => Promise.resolve(mockChats)),
      sendPeerMessage: vi.fn(() => Promise.resolve(true)),
      // ...
    };
    container.registerInstance(DEPENDENCIES.API_CLIENT, mockApiClient);
  });

  afterEach(() => {
    // Clean up after each test
    container.reset();
  });

  it("should use injected logger", () => {
    const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
    logger.info("Test message");
    expect(logger.info).toHaveBeenCalledWith("Test message");
  });

  it("should use injected chat reader", async () => {
    const chatReader = container.get<IChatReader>(DEPENDENCIES.API_CLIENT_READER);
    const chats = await chatReader.getChats();
    expect(chatReader.getChats).toHaveBeenCalled();
  });

  it("should use injected chat sender", async () => {
    const chatSender = container.get<IChatSender>(DEPENDENCIES.API_CLIENT_SENDER);
    const result = await chatSender.sendPeerMessage("peer", { time: 1, message: "test", sender: "me" });
    expect(chatSender.sendPeerMessage).toHaveBeenCalled();
  });
});
*/

// ============================================================================
// MIGRATION PATH FOR plugin.ts (with Interface Segregation)
// ============================================================================
/*
To migrate plugin.ts to use DI with segregated interfaces:

1. Add imports:
   import {
     container,
     DEPENDENCIES,
     createDependencyKey,
     createLogger,
     createConfigService,
     createApiReaderService,
     createApiSenderService,
     createApiDiscoveryService,
     createRuntimeService,
     type ILogger,
     type IConfig,
     type IChatReader,
     type IChatSender,
     type IDiscovery,
     type IRuntime,
   } from "../di/index.js";

2. Register services in plugin initialization (before first use):
   container.register(DEPENDENCIES.LOGGER, createLogger("ztm-chat"));
   container.register(DEPENDENCIES.CONFIG, createConfigService());
   container.register(DEPENDENCIES.API_CLIENT_READER, createApiReaderService());
   container.register(DEPENDENCIES.API_CLIENT_SENDER, createApiSenderService());
   container.register(DEPENDENCIES.API_CLIENT_DISCOVERY, createApiDiscoveryService());
   container.register(DEPENDENCIES.RUNTIME, createRuntimeService());

3. Replace direct imports with container.get() - request only what you need:
   Before: const log = logger;
   After:  const log = container.get<ILogger>(DEPENDENCIES.LOGGER);

   For message reading:
   const chatReader = container.get<IChatReader>(DEPENDENCIES.API_CLIENT_READER);
   const chats = await chatReader.getChats();

   For message sending:
   const chatSender = container.get<IChatSender>(DEPENDENCIES.API_CLIENT_SENDER);
   await chatSender.sendPeerMessage(peer, message);

   For discovery:
   const discovery = container.get<IDiscovery>(DEPENDENCIES.API_CLIENT_DISCOVERY);
   const meshInfo = await discovery.getMeshInfo();

4. For testing: Replace container with mock in beforeEach
   container.registerInstance(DEPENDENCIES.LOGGER, mockLogger);
   container.registerInstance(DEPENDENCIES.API_CLIENT_READER, mockChatReader);

This migration:
- Eliminates 14 direct import dependencies
- Makes services injectable and testable
- Provides lazy initialization
- Enables service lifecycle management
- Follows Interface Segregation Principle (ISP)
- Each component gets only the interfaces it needs
*/

export {};
