// ZTM Chat Runtime Types
// Runtime state and management types

import type { ZTMChatConfig } from './config.js';
import type { ZTMChatMessage } from './messaging.js';
import type { ZTMApiClient } from './api.js';
import type { GroupPermissions } from './group-policy.js';
import type {
  ZTMApiError,
  ZTMTimeoutError,
  ZTMSendError,
  ZTMReadError,
  ZTMWriteError,
  ZTMDiscoveryError,
  ZTMParseError,
  ZTMError,
} from './errors.js';

// Cache entry with timestamp for TTL tracking
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Interface for group permission cache with bounded size.
 * Implementations must provide LRU eviction to prevent unbounded growth.
 */
export interface IGroupPermissionCache {
  get(key: string): GroupPermissions | undefined;
  has(key: string): boolean;
  set(key: string, permissions: GroupPermissions): void;
  clear(): void;
  size(): number;
}

// Runtime state per account
export interface AccountRuntimeState {
  accountId: string;
  config: ZTMChatConfig;
  apiClient: ZTMApiClient | null;
  connected: boolean;
  meshConnected: boolean;
  lastError: string | null;
  lastStartAt: Date | null;
  lastStopAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  peerCount: number;
  messageCallbacks: Set<(message: ZTMChatMessage) => void>;
  watchInterval: ReturnType<typeof setInterval> | null;
  watchErrorCount: number;
  // Kept for test compatibility - not actively used in simplified flow
  pendingPairings: Map<string, Date>;
  // Cached allowFrom store to avoid redundant async calls every poll/watch cycle
  // Not required in test fixtures - initialized in getOrCreateAccountState
  allowFromCache?: CacheEntry<string[]> | null;
  // Cached group permissions to avoid repeated lookups
  // Uses LRU cache with bounded size to prevent unbounded memory growth
  // Accepts Map for test compatibility, runtime always uses LRU cache
  // Not required in test fixtures - initialized in getOrCreateAccountState
  groupPermissionCache?: Map<string, GroupPermissions> | IGroupPermissionCache;
}
