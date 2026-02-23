// Stress Testing Helpers - Utilities for load and stress testing ZTM Chat
// Provides functions for high-frequency message generation, network simulation,
// memory measurement, and chaos testing

import type { ZTMMessage, ZTMChat, ZTMPeer } from '../types/api.js';
import type { ZTMChatConfig } from '../types/config.js';

// ============================================================================
// High Frequency Message Generation
// ============================================================================

/**
 * Options for high-frequency message generation
 */
export interface HighFrequencyMessageOptions {
  /** Number of messages to generate */
  count: number;
  /** Sender username (default: 'stress-user') */
  sender?: string;
  /** Base timestamp (default: Date.now()) */
  baseTime?: number;
  /** Interval between messages in ms (default: 1ms for true high frequency) */
  intervalMs?: number;
  /** Message content template (default: 'Message {i}') */
  messageTemplate?: string;
  /** Whether to generate valid ZTMMessage format (default: true) */
  validFormat?: boolean;
}

/**
 * Create high-frequency messages for stress testing
 * Generates messages with minimal intervals to test message processing throughput
 *
 * @param options - Configuration for message generation (including count)
 * @returns Array of ZTMMessage objects
 *
 * @example
 * // Generate 1000 messages
 * const messages = createHighFrequencyMessages({ count: 1000 });
 *
 * @example
 * // Generate 500 messages with custom sender
 * const messages = createHighFrequencyMessages({
 *   count: 500,
 *   sender: 'load-tester',
 *   intervalMs: 5,
 *   messageTemplate: 'Load test message {i}'
 * });
 */
export function createHighFrequencyMessages(
  options: HighFrequencyMessageOptions
): ZTMMessage[] {
  const {
    count,
    sender = 'stress-user',
    baseTime = Date.now(),
    intervalMs = 1,
    messageTemplate = 'Message {i}',
    validFormat = true,
  } = options;

  const messages: ZTMMessage[] = [];

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * intervalMs;

    if (validFormat) {
      messages.push({
        time,
        message: messageTemplate.replace('{i}', String(i + 1)),
        sender,
      });
    } else {
      // Generate raw message objects for edge case testing
      messages.push({
        time,
        message: `Raw message ${i + 1}: ${'x'.repeat(Math.floor(Math.random() * 100))}`,
        sender: `sender-${i % 10}`,
      });
    }
  }

  return messages;
}

/**
 * Create high-frequency chat messages for stress testing
 * Generates chat objects with embedded messages
 *
 * @param peerCount - Number of unique peers
 * @param messagesPerPeer - Number of messages per peer
 * @returns Array of ZTMChat objects with messages
 */
export function createHighFrequencyChats(
  peerCount: number,
  messagesPerPeer: number
): ZTMChat[] {
  const chats: ZTMChat[] = [];
  const now = Date.now();

  for (let p = 0; p < peerCount; p++) {
    const peer = `stress-peer-${p}`;
    const messages = createHighFrequencyMessages({
      count: messagesPerPeer,
      sender: peer,
      baseTime: now - messagesPerPeer * 10,
      intervalMs: 10,
    } as HighFrequencyMessageOptions);

    chats.push({
      peer,
      time: now - messagesPerPeer * 10,
      updated: now,
      latest: messages[messages.length - 1],
    });
  }

  return chats;
}

// ============================================================================
// Network Flakiness Simulation
// ============================================================================

/**
 * Options for network flakiness simulation
 */
export interface NetworkFlakinessOptions {
  /** Probability of failure (0-1) */
  failureRate?: number;
  /** Average latency in ms */
  averageLatencyMs?: number;
  /** Latency variance in ms */
  latencyVarianceMs?: number;
  /** Types of failures to simulate */
  failureTypes?: Array<'timeout' | 'connection_reset' | 'server_error' | 'network_unavailable'>;
  /** Whether to log operations (default: false) */
  verbose?: boolean;
}

/**
 * Network flakiness simulation result
 */
export interface FlakinessResult {
  /** Whether the operation failed */
  failed: boolean;
  /** Error type if failed */
  errorType?: string;
  /** Simulated latency */
  latencyMs: number;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Simulate network flakiness for testing error handling
 * Returns a function that can be used to wrap async operations
 *
 * @param options - Configuration for network flakiness
 * @returns A function that simulates network behavior
 *
 * @example
 * const flaky = simulateNetworkFlakiness({ failureRate: 0.3 });
 * const result = await flaky(fetchMessages);
 */
export function simulateNetworkFlakiness(
  options: NetworkFlakinessOptions = {}
): <T>(operation: () => Promise<T>) => Promise<FlakinessResult & { result?: T }> {
  const {
    failureRate = 0.1,
    averageLatencyMs = 100,
    latencyVarianceMs = 50,
    failureTypes = ['timeout', 'connection_reset', 'server_error', 'network_unavailable'],
    verbose = false,
  } = options;

  const failureMessages: Record<string, string> = {
    timeout: 'Request timed out',
    connection_reset: 'Connection reset by peer',
    server_error: 'Internal server error',
    network_unavailable: 'Network is unavailable',
  };

  return async function <T>(operation: () => Promise<T>): Promise<FlakinessResult & { result?: T }> {
    // Simulate latency
    const latencyVariance = (Math.random() - 0.5) * 2 * latencyVarianceMs;
    const latency = Math.max(0, averageLatencyMs + latencyVariance);

    await new Promise(resolve => setTimeout(resolve, latency));

    // Determine if operation should fail
    const shouldFail = Math.random() < failureRate;

    if (shouldFail) {
      const errorType = failureTypes[Math.floor(Math.random() * failureTypes.length)];
      const errorMessage = failureMessages[errorType];

      if (verbose) {
        console.log(`[Flakiness] Simulated ${errorType} after ${latency}ms`);
      }

      return {
        failed: true,
        errorType,
        latencyMs: latency,
        errorMessage,
      };
    }

    // Execute the actual operation
    try {
      const result = await operation();

      if (verbose) {
        console.log(`[Flakiness] Operation succeeded after ${latency}ms`);
      }

      return {
        failed: false,
        latencyMs: latency,
        result,
      };
    } catch (error) {
      return {
        failed: true,
        errorType: 'operation_error',
        latencyMs: latency,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };
}

/**
 * Create a batch of flaky operations for parallel testing
 *
 * @param operations - Array of operations to run
 * @param flakinessOptions - Network flakiness configuration
 * @returns Array of results
 */
export async function simulateFlakyBatch<T>(
  operations: Array<() => Promise<T>>,
  flakinessOptions: NetworkFlakinessOptions = {}
): Promise<Array<FlakinessResult & { result?: T }>> {
  const flaky = simulateNetworkFlakiness(flakinessOptions);

  return Promise.all(
    operations.map(async operation => flaky(operation))
  );
}

// ============================================================================
// Memory Usage Measurement
// ============================================================================

/**
 * Memory usage measurement result
 */
export interface MemoryUsageResult {
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** External memory in bytes */
  external: number;
  /** Number of allocated arrays */
  arrayBuffers: number;
  /** Formatted heap used (human-readable) */
  heapUsedFormatted: string;
  /** Formatted heap total (human-readable) */
  heapTotalFormatted: string;
  /** Memory usage ratio (used/total) */
  usageRatio: number;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Measure current memory usage
 * Uses Node.js process.memoryUsage() for accurate measurements
 *
 * @returns MemoryUsageResult with current memory statistics
 *
 * @example
 * const before = measureMemoryUsage();
 * // ... perform operations ...
 * const after = measureMemoryUsage();
 * console.log(`Delta: ${after.heapUsed - before.heapUsed} bytes`);
 */
export function measureMemoryUsage(): MemoryUsageResult {
  // Force garbage collection if available (for more accurate measurements)
  if (global.gc) {
    global.gc();
  }

  const usage = process.memoryUsage();

  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers ? 1 : 0,
    heapUsedFormatted: formatBytes(usage.heapUsed),
    heapTotalFormatted: formatBytes(usage.heapTotal),
    usageRatio: usage.heapTotal > 0 ? usage.heapUsed / usage.heapTotal : 0,
  };
}

/**
 * Track memory usage over time
 * Returns a function that can be called to record snapshots
 *
 * @param intervalMs - Interval for periodic snapshots (default: 1000ms)
 * @returns Controller object with start, stop, and getSnapshots methods
 *
 * @example
 * const tracker = createMemoryTracker();
 * tracker.start();
 * // ... perform operations ...
 * const snapshots = tracker.stop();
 * console.log(snapshots);
 */
export function createMemoryTracker(intervalMs = 1000): {
  start: () => void;
  stop: () => Array<{ timestamp: number; memory: MemoryUsageResult }>;
  getSnapshots: () => Array<{ timestamp: number; memory: MemoryUsageResult }>;
  reset: () => void;
} {
  const snapshots: Array<{ timestamp: number; memory: MemoryUsageResult }> = [];
  let intervalId: NodeJS.Timeout | null = null;
  let running = false;

  return {
    start(): void {
      if (running) return;

      running = true;
      const startMemory = measureMemoryUsage();
      snapshots.push({
        timestamp: Date.now(),
        memory: startMemory,
      });

      intervalId = setInterval(() => {
        if (running) {
          snapshots.push({
            timestamp: Date.now(),
            memory: measureMemoryUsage(),
          });
        }
      }, intervalMs);
    },

    stop(): Array<{ timestamp: number; memory: MemoryUsageResult }> {
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      // Add final snapshot
      snapshots.push({
        timestamp: Date.now(),
        memory: measureMemoryUsage(),
      });

      return snapshots;
    },

    getSnapshots(): Array<{ timestamp: number; memory: MemoryUsageResult }> {
      return [...snapshots];
    },

    reset(): void {
      snapshots.length = 0;
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

/**
 * Compare two memory measurements
 *
 * @param before - Memory measurement before
 * @param after - Memory measurement after
 * @returns Comparison result with deltas
 */
export function compareMemoryUsage(
  before: MemoryUsageResult,
  after: MemoryUsageResult
): {
  heapUsedDelta: number;
  heapTotalDelta: number;
  externalDelta: number;
  heapUsedDeltaFormatted: string;
  usageRatioBefore: number;
  usageRatioAfter: number;
} {
  return {
    heapUsedDelta: after.heapUsed - before.heapUsed,
    heapTotalDelta: after.heapTotal - before.heapTotal,
    externalDelta: after.external - before.external,
    heapUsedDeltaFormatted: formatBytes(after.heapUsed - before.heapUsed),
    usageRatioBefore: before.usageRatio,
    usageRatioAfter: after.usageRatio,
  };
}

// ============================================================================
// Chaos Monkey
// ============================================================================

/**
 * Chaos monkey action types
 */
export type ChaosAction =
  | 'random_timeout'
  | 'random_error'
  | 'drop_message'
  | 'duplicate_message'
  | 'delay_message'
  | 'corrupt_message'
  | 'swap_sender'
  | 'reorder_messages';

/**
 * Chaos monkey configuration
 */
export interface ChaosMonkeyConfig {
  /** Probability of each action being triggered (0-1) */
  actionProbability?: number;
  /** Specific actions to enable (default: all) */
  enabledActions?: ChaosAction[];
  /** Maximum delay for delay_message action (ms) */
  maxDelayMs?: number;
  /** Seed for deterministic randomness */
  seed?: number;
  /** Whether to log actions (default: false) */
  verbose?: boolean;
}

/**
 * Chaos monkey instance
 */
export interface ChaosMonkey {
  /** Apply chaos to a message */
  mutateMessage: (message: ZTMMessage) => ZTMMessage | null;
  /** Apply chaos to an array of messages */
  mutateMessages: (messages: ZTMMessage[]) => ZTMMessage[];
  /** Apply chaos to a peer */
  mutatePeer: (peer: ZTMPeer) => ZTMPeer;
  /** Apply chaos to config */
  mutateConfig: (config: ZTMChatConfig) => ZTMChatConfig;
  /** Check if chaos should be applied */
  shouldApplyChaos: () => boolean;
  /** Get statistics */
  getStats: () => ChaosMonkeyStats;
  /** Reset statistics */
  resetStats: () => void;
}

/**
 * Chaos monkey statistics
 */
export interface ChaosMonkeyStats {
  /** Total times chaos was applied */
  totalApplies: number;
  /** Breakdown by action type */
  actionCounts: Record<ChaosAction, number>;
  /** Messages mutated */
  messagesMutated: number;
  /** Messages dropped */
  messagesDropped: number;
}

/**
 * Create a chaos monkey for random failure injection
 * Introduces various types of chaos to test system resilience
 *
 * @param config - Configuration for chaos monkey behavior
 * @returns ChaosMonkey instance
 *
 * @example
 * const chaos = createChaosMonkey({ actionProbability: 0.2 });
 * const mutated = chaos.mutateMessage(originalMessage);
 */
export function createChaosMonkey(config: ChaosMonkeyConfig = {}): ChaosMonkey {
  const {
    actionProbability = 0.1,
    enabledActions = [
      'random_timeout',
      'random_error',
      'drop_message',
      'duplicate_message',
      'delay_message',
      'corrupt_message',
      'swap_sender',
      'reorder_messages',
    ],
    maxDelayMs = 5000,
    seed,
    verbose = false,
  } = config;

  // Seeded random for reproducibility
  let randomState = seed ?? Date.now();
  const seededRandom = (): number => {
    randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
    return randomState / 0x7fffffff;
  };

  const stats: ChaosMonkeyStats = {
    totalApplies: 0,
    actionCounts: {
      random_timeout: 0,
      random_error: 0,
      drop_message: 0,
      duplicate_message: 0,
      delay_message: 0,
      corrupt_message: 0,
      swap_sender: 0,
      reorder_messages: 0,
    },
    messagesMutated: 0,
    messagesDropped: 0,
  };

  const availableActions: ChaosAction[] = enabledActions;

  function applyAction(action: ChaosAction): void {
    stats.totalApplies++;
    stats.actionCounts[action]++;
  }

  function logAction(action: ChaosAction, details: string): void {
    if (verbose) {
      console.log(`[ChaosMonkey] ${action}: ${details}`);
    }
  }

  return {
    mutateMessage(message: ZTMMessage): ZTMMessage | null {
      if (!this.shouldApplyChaos()) {
        return message;
      }

      const action = availableActions[Math.floor(seededRandom() * availableActions.length)];

      switch (action) {
        case 'drop_message':
          applyAction(action);
          logAction(action, `Dropped message from ${message.sender}`);
          stats.messagesDropped++;
          return null;

        case 'corrupt_message':
          applyAction(action);
          logAction(action, `Corrupted message from ${message.sender}`);
          stats.messagesMutated++;
          return {
            ...message,
            message: message.message + '\x00\x00CORRUPTED',
          };

        case 'swap_sender':
          applyAction(action);
          logAction(action, `Swapped sender from ${message.sender}`);
          stats.messagesMutated++;
          return {
            ...message,
            sender: `malicious-${message.sender}`,
          };

        case 'delay_message':
          // For delay, we'd need to handle asynchronously
          // Here we mark it as delayed by adding a flag
          applyAction(action);
          logAction(action, `Marked message from ${message.sender} for delay`);
          return {
            ...message,
            time: message.time + Math.floor(seededRandom() * maxDelayMs),
          };

        default:
          // Other actions handled elsewhere
          return message;
      }
    },

    mutateMessages(messages: ZTMMessage[]): ZTMMessage[] {
      if (!this.shouldApplyChaos() || messages.length === 0) {
        return messages;
      }

      const action = availableActions[Math.floor(seededRandom() * availableActions.length)];

      switch (action) {
        case 'duplicate_message': {
          applyAction(action);
          logAction(action, `Duplicated ${messages.length} messages`);
          stats.messagesMutated += messages.length;
          return [...messages, ...messages.map(m => ({ ...m, time: m.time + 1 }))];
        }

        case 'reorder_messages': {
          applyAction(action);
          logAction(action, `Reordered ${messages.length} messages`);
          stats.messagesMutated += messages.length;
          const shuffled = [...messages];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          return shuffled;
        }

        case 'drop_message': {
          applyAction(action);
          // Drop 50% of messages
          const kept = messages.filter(() => seededRandom() > 0.5);
          stats.messagesDropped += messages.length - kept.length;
          logAction(action, `Dropped ${messages.length - kept.length} of ${messages.length} messages`);
          return kept;
        }

        default:
          return messages.map(m => this.mutateMessage(m)).filter((m): m is ZTMMessage => m !== null);
      }
    },

    mutatePeer(peer: ZTMPeer): ZTMPeer {
      if (!this.shouldApplyChaos()) {
        return peer;
      }

      const action = availableActions[Math.floor(seededRandom() * availableActions.length)];

      switch (action) {
        case 'swap_sender':
          applyAction(action);
          logAction(action, `Mutated peer ${peer.username}`);
          return {
            ...peer,
            username: `evil-${peer.username}`,
          };

        default:
          return peer;
      }
    },

    mutateConfig(config: ZTMChatConfig): ZTMChatConfig {
      if (!this.shouldApplyChaos()) {
        return config;
      }

      const action = availableActions[Math.floor(seededRandom() * availableActions.length)];

      switch (action) {
        case 'random_error':
          applyAction(action);
          logAction(action, 'Config mutation (no-op for config)');
          // Config mutations could include changing policies unexpectedly
          return {
            ...config,
            dmPolicy: config.dmPolicy === 'allow' ? 'deny' : 'allow',
          };

        default:
          return config;
      }
    },

    shouldApplyChaos(): boolean {
      return seededRandom() < actionProbability;
    },

    getStats(): ChaosMonkeyStats {
      return { ...stats };
    },

    resetStats(): void {
      stats.totalApplies = 0;
      stats.actionCounts = {
        random_timeout: 0,
        random_error: 0,
        drop_message: 0,
        duplicate_message: 0,
        delay_message: 0,
        corrupt_message: 0,
        swap_sender: 0,
        reorder_messages: 0,
      };
      stats.messagesMutated = 0;
      stats.messagesDropped = 0;
    },
  };
}

/**
 * Create a pre-configured chaos monkey for common stress testing scenarios
 */
export function createLoadTestChaosMonkey(): ChaosMonkey {
  return createChaosMonkey({
    actionProbability: 0.05,
    maxDelayMs: 1000,
    verbose: false,
  });
}

/**
 * Create a chaos monkey for chaos engineering experiments
 */
export function createChaosEngineeringMonkey(): ChaosMonkey {
  return createChaosMonkey({
    actionProbability: 0.2,
    maxDelayMs: 10000,
    verbose: true,
  });
}
