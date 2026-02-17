// Repository implementations for ZTM Chat
// Concrete implementations of repository interfaces defined in repository.ts
//
// This layer provides implementations that the messaging layer can depend on,
// enabling better separation of concerns and testability.

import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { FileMetadata } from "./store.js";
import type { IAllowFromRepository, IMessageStateRepository } from "./repository.js";
import { getAllowFromCache, clearAllowFromCache } from "./state.js";
import { getAccountMessageStateStore } from "./store.js";

/**
 * Implementation of IAllowFromRepository
 *
 * Wraps the allowFrom cache functions from state.ts, providing
 * a clean interface for the messaging layer to access pairing approvals.
 */
export class AllowFromRepository implements IAllowFromRepository {
  /**
   * Get cached allowFrom store or refresh if expired
   *
   * @param accountId - The account identifier
   * @param runtime - ZTM runtime to fetch fresh data if cache expired
   * @returns Promise resolving to allowFrom string array, or null if fetch failed
   */
  async getAllowFrom(accountId: string, runtime: PluginRuntime): Promise<string[] | null> {
    return getAllowFromCache(accountId, runtime);
  }

  /**
   * Clear the allowFrom cache for an account
   *
   * @param accountId - The account identifier
   */
  clearCache(accountId: string): void {
    clearAllowFromCache(accountId);
  }
}

/**
 * Implementation of IMessageStateRepository
 *
 * Wraps the MessageStateStore from store.ts, providing a clean interface
 * for persisting message watermarks and file metadata.
 */
export class MessageStateRepository implements IMessageStateRepository {
  /**
   * Get the watermark for a specific key
   *
   * @param accountId - The account identifier
   * @param key - The watermark key (e.g., "peer:alice" or "group:creator/groupid")
   * @returns The watermark timestamp, or 0 if not found
   */
  getWatermark(accountId: string, key: string): number {
    return getAccountMessageStateStore(accountId).getWatermark(accountId, key);
  }

  /**
   * Set the watermark for a specific key
   *
   * @param accountId - The account identifier
   * @param key - The watermark key
   * @param time - The timestamp to set
   */
  setWatermark(accountId: string, key: string, time: number): void {
    getAccountMessageStateStore(accountId).setWatermark(accountId, key, time);
  }

  /**
   * Get file metadata for an account
   *
   * @param accountId - The account identifier
   * @returns Record of file path to metadata
   */
  getFileMetadata(accountId: string): Record<string, FileMetadata> {
    return getAccountMessageStateStore(accountId).getFileMetadata(accountId);
  }

  /**
   * Set file metadata in bulk
   *
   * @param accountId - The account identifier
   * @param metadata - Record of file path to metadata
   */
  setFileMetadataBulk(accountId: string, metadata: Record<string, FileMetadata>): void {
    getAccountMessageStateStore(accountId).setFileMetadataBulk(accountId, metadata);
  }

  /**
   * Note: This implementation flushes a default store.
   * For account-specific flush, consider passing accountId to flush method
   * or using a different approach for batch flushing.
   */
  flush(): void {
    // Default implementation - actual flush happens via MessageStateStore directly
    // This is a no-op for the repository abstraction
  }
}

// Singleton instances for easy access
let allowFromRepositoryInstance: IAllowFromRepository | null = null;
let messageStateRepositoryInstance: IMessageStateRepository | null = null;

/**
 * Get the singleton AllowFromRepository instance
 */
export function getAllowFromRepository(): IAllowFromRepository {
  if (!allowFromRepositoryInstance) {
    allowFromRepositoryInstance = new AllowFromRepository();
  }
  return allowFromRepositoryInstance;
}

/**
 * Get the singleton MessageStateRepository instance
 */
export function getMessageStateRepository(): IMessageStateRepository {
  if (!messageStateRepositoryInstance) {
    messageStateRepositoryInstance = new MessageStateRepository();
  }
  return messageStateRepositoryInstance;
}
