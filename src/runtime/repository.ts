/**
 * Repository interfaces for ZTM Chat
 * @module runtime/repository
 * Defines abstraction boundaries between messaging and runtime layers
 *
 * This layer introduces the Repository pattern to decouple the messaging layer
 * from runtime implementation details. The messaging layer should depend on
 * these interfaces, not concrete implementations.
 */

import type { PluginRuntime } from 'openclaw/plugin-sdk';

/**
 * Repository for managing allowFrom store access
 *
 * Provides abstraction over how allowFrom (pairing approvals) are retrieved,
 * allowing the messaging layer to remain independent of runtime implementation.
 */
export interface IAllowFromRepository {
  /**
   * Get cached allowFrom store or refresh if expired
   *
   * @param accountId - The account identifier
   * @param runtime - ZTM runtime to fetch fresh data if cache expired
   * @returns Promise resolving to allowFrom string array, or null if fetch failed
   */
  getAllowFrom(accountId: string, runtime: PluginRuntime): Promise<string[] | null>;

  /**
   * Clear the allowFrom cache for an account
   *
   * @param accountId - The account identifier
   */
  clearCache(accountId: string): void;
}

/**
 * Repository for managing message state persistence
 *
 * Provides abstraction over how message watermarks
 * are persisted, allowing the messaging layer to remain independent
 * of the storage implementation.
 */
export interface IMessageStateRepository {
  /**
   * Get the watermark for a specific key
   *
   * @param accountId - The account identifier
   * @param key - The watermark key (e.g., "peer:alice" or "group:creator/groupid")
   * @returns The watermark timestamp, or 0 if not found
   */
  getWatermark(accountId: string, key: string): number;

  /**
   * Set the watermark for a specific key
   *
   * @param accountId - The account identifier
   * @param key - The watermark key
   * @param time - The timestamp to set
   */
  setWatermark(accountId: string, key: string, time: number): void;

  /**
   * Flush any pending writes to storage
   */
  flush(): void;
}
