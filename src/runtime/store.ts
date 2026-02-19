// Persistent message state store
// Tracks per-account, per-peer watermarks so that already-processed messages
// are skipped across gateway restarts.

import * as fs from 'fs';
import * as path from 'path';
import { defaultLogger, type Logger } from '../utils/logger.js';
import { resolveStatePath } from '../utils/paths.js';
import {
  MAX_PEERS_PER_ACCOUNT,
  MAX_FILES_PER_ACCOUNT,
  STATE_FLUSH_DEBOUNCE_MS,
  STATE_FLUSH_MAX_DELAY_MS,
} from '../constants.js';

/**
 * FileSystem interface for dependency injection (enables testing without real I/O)
 */
export interface FileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: string): string;
  writeFileSync(path: string, data: string): void;
  promises: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    readFile(path: string, encoding: string): Promise<string>;
    writeFile(path: string, data: string): Promise<void>;
    access(path: string): Promise<void>;
  };
}

/**
 * Default Node.js file system implementation
 */
export const nodeFs: FileSystem = {
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
  readFileSync: (p, enc) => fs.readFileSync(p, enc as BufferEncoding),
  writeFileSync: (p, d) => fs.writeFileSync(p, d),
  promises: {
    mkdir: async (path: string, options?: { recursive?: boolean }) => {
      await fs.promises.mkdir(path, options);
    },
    readFile: (p: string, enc: string) => fs.promises.readFile(p, enc as BufferEncoding),
    writeFile: (p: string, d: string) => fs.promises.writeFile(p, d),
    access: (p: string) => fs.promises.access(p),
  },
};

export interface FileMetadata {
  time: number;
  size: number;
}

export interface MessageStateData {
  // Per-account → per-peer → last processed message timestamp
  accounts: Record<string, Record<string, number>>;
  // Per-account → last seen file metadata (time + size for watchChanges seeding)
  fileMetadata: Record<string, Record<string, FileMetadata>>;
}

/**
 * MessageStateStore interface - abstract interface for persistence operations
 *
 * This interface defines the contract for persisting message state across
 * gateway restarts. It tracks:
 * - Per-peer watermarks (last processed message timestamp)
 * - File metadata for change detection
 */
export interface MessageStateStore {
  /**
   * Get the last-processed message timestamp for a key under an account
   */
  getWatermark(accountId: string, key: string): number;

  /**
   * Get the global watermark (max across all keys) for an account
   */
  getGlobalWatermark(accountId: string): number;

  /**
   * Update the watermark for a key (only advances forward)
   */
  setWatermark(accountId: string, key: string, time: number): void;

  /**
   * Get all persisted file metadata for an account
   */
  getFileMetadata(accountId: string): Record<string, FileMetadata>;

  /**
   * Update a file's metadata
   */
  setFileMetadata(accountId: string, filePath: string, metadata: FileMetadata): void;

  /**
   * Bulk-set file metadata (e.g. after initial scan)
   */
  setFileMetadataBulk(accountId: string, metadata: Record<string, FileMetadata>): void;

  /**
   * Flush any pending writes immediately
   */
  flush(): void;

  /**
   * Async flush for graceful shutdown
   */
  flushAsync(): Promise<void>;

  /**
   * Dispose of resources - call on plugin unload
   */
  dispose(): void;
}

/**
 * Implementation of MessageStateStore
 *
 * This class provides persistent storage for message watermarks and file metadata.
 * It uses a JSON file for persistence and includes:
 * - Automatic cleanup when limits are exceeded
 * - Debounced writes to avoid excessive I/O
 * - Migration support for old data formats
 */
export class MessageStateStoreImpl implements MessageStateStore {
  private statePath: string;
  private data: MessageStateData;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  /**
   * Validate state data structure to prevent deserialization attacks
   * Ensures accounts and fileMetadata have expected types
   */
  private validateStateData(
    parsed: unknown
  ): { accounts: Record<string, Record<string, number>> } | null {
    // Must be an object
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const data = parsed as Record<string, unknown>;

    // Validate accounts field if present
    const accounts: Record<string, Record<string, number>> = {};

    if (data.accounts !== undefined) {
      if (typeof data.accounts !== 'object' || data.accounts === null) {
        this.logger.warn('Invalid accounts format in state file');
        return null;
      }

      // Validate each account value
      const accountsData = data.accounts as Record<string, unknown>;
      for (const [key, value] of Object.entries(accountsData)) {
        // Sanitize keys to prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          this.logger.warn(`Rejecting unsafe key in accounts: ${key}`);
          return null;
        }
        // Account values must be objects with number values (timestamps)
        if (value !== null && typeof value === 'object') {
          const peerData = value as Record<string, unknown>;
          const sanitizedPeerData: Record<string, number> = {};
          let valid = true;
          for (const [peerKey, peerValue] of Object.entries(peerData)) {
            // Sanitize peer keys too
            if (peerKey === '__proto__' || peerKey === 'constructor' || peerKey === 'prototype') {
              valid = false;
              break;
            }
            if (typeof peerValue !== 'number') {
              valid = false;
              break;
            }
            sanitizedPeerData[peerKey] = peerValue;
          }
          if (valid) {
            accounts[key] = sanitizedPeerData;
          }
        }
      }
    }

    // Validate fileMetadata field if present
    if (data.fileMetadata !== undefined) {
      if (typeof data.fileMetadata !== 'object' || data.fileMetadata === null) {
        this.logger.warn('Invalid fileMetadata format in state file');
        return null;
      }
    }

    // Validate fileTimes (legacy format) if present
    if (data.fileTimes !== undefined) {
      if (typeof data.fileTimes !== 'object' || data.fileTimes === null) {
        this.logger.warn('Invalid fileTimes format in state file');
        return null;
      }
    }

    return { accounts };
  }

  private readonly fs: FileSystem;
  private readonly logger: Logger;
  private readonly stateDir: string;

  // Maximum number of peers to track per account (prevents unbounded state growth)
  // Uses constant from constants.ts

  constructor(statePath?: string, fsImpl?: FileSystem, loggerImpl?: Logger) {
    this.fs = fsImpl ?? nodeFs;
    this.logger = loggerImpl ?? defaultLogger;

    // Allow overriding the state path (useful for testing)
    // Priority: constructor param > ZTM_STATE_PATH env var > default path
    // Uses cross-platform compatible path resolution from utils/paths.ts
    if (statePath) {
      this.statePath = statePath;
    } else {
      this.statePath = resolveStatePath();
    }
    this.stateDir = path.dirname(this.statePath);

    // Initialize with empty data - load lazily on first access
    // This avoids blocking the event loop during startup
    this.data = { accounts: {}, fileMetadata: {} };
  }

  /**
   * Synchronous load for backward compatibility
   * Loads data immediately if not already loaded
   */
  private load(): void {
    if (this.loaded) return;

    // Ensure directory exists
    if (!this.fs.existsSync(this.stateDir)) {
      this.fs.mkdirSync(this.stateDir, { recursive: true });
    }

    try {
      if (!this.fs.existsSync(this.statePath)) {
        this.loaded = true;
        return;
      }

      const content = this.fs.readFileSync(this.statePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate parsed data structure to prevent deserialization attacks
      const validated = this.validateStateData(parsed);
      if (!validated) {
        this.logger.warn('Invalid state file format, starting fresh');
        this.loaded = true;
        return;
      }

      const fileMetadata = this.migrateFileMetadata(parsed);
      this.data = {
        accounts: validated.accounts,
        fileMetadata,
      };
    } catch {
      // Ignore read/parse errors — start fresh
      this.logger.warn('Failed to load message state, starting fresh');
    }
    this.loaded = true;
  }

  private migrateFileMetadata(
    parsed: Record<string, unknown>
  ): Record<string, Record<string, FileMetadata>> {
    const fileMetadata: Record<string, Record<string, FileMetadata>> = {};

    if (parsed.fileMetadata && typeof parsed.fileMetadata === 'object') {
      // New format - validate it's the expected structure
      try {
        const fm = parsed.fileMetadata as Record<string, Record<string, FileMetadata>>;
        for (const [accountId, files] of Object.entries(fm)) {
          if (files && typeof files === 'object') {
            fileMetadata[accountId] = files;
          }
        }
      } catch {
        // Invalid format, ignore
      }
    } else if (parsed.fileTimes && typeof parsed.fileTimes === 'object') {
      // Old format: migrate time to metadata with size 0
      const fileTimes = parsed.fileTimes as Record<string, Record<string, number>>;
      for (const [accountId, files] of Object.entries(fileTimes)) {
        fileMetadata[accountId] = {};
        for (const [p, time] of Object.entries(files)) {
          fileMetadata[accountId][p] = { time, size: 0 };
        }
      }
    }

    return fileMetadata;
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    // Debounce writes to avoid excessive I/O during burst processing
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      await this.saveAsync();
    }, STATE_FLUSH_DEBOUNCE_MS);

    // Schedule max-delay flush to prevent data loss on crash
    // This ensures watermarks are persisted even if updates stop coming
    if (!this.maxDelayTimer) {
      this.maxDelayTimer = setTimeout(async () => {
        this.maxDelayTimer = null;
        if (this.dirty) {
          await this.saveAsync();
        }
      }, STATE_FLUSH_MAX_DELAY_MS);
    }
  }

  /**
   * Async save method to avoid blocking the event loop
   */
  private async saveAsync(): Promise<void> {
    if (!this.dirty) return;

    try {
      await this.fs.promises.mkdir(this.stateDir, { recursive: true });
      await this.fs.promises.writeFile(this.statePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch {
      this.logger.warn('Failed to persist message state');
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      if (!this.fs.existsSync(this.stateDir)) {
        this.fs.mkdirSync(this.stateDir, { recursive: true });
      }
      this.fs.writeFileSync(this.statePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch {
      this.logger.warn('Failed to persist message state');
    }
  }

  /** Flush any pending writes immediately (call on shutdown) */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
    this.save();
  }

  /** Async flush for graceful shutdown */
  async flushAsync(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
    await this.saveAsync();
  }

  /** Get the last-processed message timestamp for a key under an account */
  getWatermark(accountId: string, key: string): number {
    // Ensure data is loaded before reading (sync load to maintain backward compatibility)
    if (!this.loaded) {
      this.load();
    }
    return this.data.accounts[accountId]?.[key] ?? 0;
  }

  /** Get the global watermark (max across all keys) for an account */
  getGlobalWatermark(accountId: string): number {
    // Ensure data is loaded before reading
    if (!this.loaded) {
      this.load();
    }
    const keys = this.data.accounts[accountId];
    if (!keys) return 0;
    return Math.max(0, ...Object.values(keys));
  }

  /** Update the watermark for a key (only advances forward) */
  setWatermark(accountId: string, key: string, time: number): void {
    // Ensure data is loaded before writing
    if (!this.loaded) {
      this.load();
    }
    const current = this.getWatermark(accountId, key);
    if (time <= current) return;
    if (!this.data.accounts[accountId]) {
      this.data.accounts[accountId] = {};
    }
    this.data.accounts[accountId][key] = time;
    this.cleanupIfNeeded(accountId);
    this.scheduleSave();
  }

  /** Clean up old entries if limits are exceeded (called after watermark updates) */
  private cleanupIfNeeded(accountId: string): void {
    const peers = this.data.accounts[accountId];
    if (peers && Object.keys(peers).length > MAX_PEERS_PER_ACCOUNT) {
      // Keep the most recently active peers (sorted by timestamp descending)
      const sorted = Object.entries(peers)
        .sort(([, t1], [, t2]) => t2 - t1)
        .slice(0, MAX_PEERS_PER_ACCOUNT);
      this.data.accounts[accountId] = Object.fromEntries(sorted);
      this.dirty = true;
    }

    // Also cleanup fileMetadata if needed
    const fileMetadata = this.data.fileMetadata[accountId];
    if (fileMetadata && Object.keys(fileMetadata).length > MAX_FILES_PER_ACCOUNT) {
      // Keep the most recently seen files (sorted by timestamp descending)
      const sorted = Object.entries(fileMetadata)
        .sort(([, m1], [, m2]) => m2.time - m1.time)
        .slice(0, MAX_FILES_PER_ACCOUNT);
      this.data.fileMetadata[accountId] = Object.fromEntries(sorted);
      this.dirty = true;
    }
  }

  /** Get all persisted file metadata for an account (used to seed lastSeenTimes) */
  getFileMetadata(accountId: string): Record<string, FileMetadata> {
    // Ensure data is loaded before reading
    if (!this.loaded) {
      this.load();
    }
    return this.data.fileMetadata[accountId] ?? {};
  }

  /** Update a file's metadata */
  setFileMetadata(accountId: string, filePath: string, metadata: FileMetadata): void {
    // Ensure data is loaded before writing
    if (!this.loaded) {
      this.load();
    }
    if (!this.data.fileMetadata[accountId]) {
      this.data.fileMetadata[accountId] = {};
    }
    this.data.fileMetadata[accountId][filePath] = metadata;
    this.scheduleSave();
  }

  /** Bulk-set file metadata (e.g. after initial scan) */
  setFileMetadataBulk(accountId: string, metadata: Record<string, FileMetadata>): void {
    // Ensure data is loaded before writing
    if (!this.loaded) {
      this.load();
    }
    if (!this.data.fileMetadata[accountId]) {
      this.data.fileMetadata[accountId] = {};
    }
    for (const [fp, m] of Object.entries(metadata)) {
      this.data.fileMetadata[accountId][fp] = m;
    }
    this.scheduleSave();
  }

  /** Dispose of resources - call on plugin unload to prevent memory leaks */
  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.save();
  }
}

/**
 * Factory function to create MessageStateStore instances
 * Allows dependency injection for testing
 */
export function createMessageStateStore(
  statePath?: string,
  fsImpl?: FileSystem,
  loggerImpl?: Logger
): MessageStateStore {
  return new MessageStateStoreImpl(statePath, fsImpl, loggerImpl);
}

// Per-account stores to avoid race conditions in multi-account scenarios
const accountStores = new Map<string, MessageStateStore>();

/**
 * Get a MessageStateStore for a specific account.
 * Each account gets its own isolated store to prevent race conditions.
 *
 * @param accountId - The account identifier
 * @returns Isolated MessageStateStore for the account
 */
export function getAccountMessageStateStore(accountId: string): MessageStateStore {
  let store = accountStores.get(accountId);
  if (!store) {
    // Create account-specific state path to isolate data
    const accountStatePath = resolveStatePath().replace(/\.json$/, `-${accountId}.json`);
    store = createMessageStateStore(accountStatePath);
    accountStores.set(accountId, store);
  }
  return store;
}

// Export dispose function for plugin cleanup
export function disposeMessageStateStore(): void {
  // Dispose all account-specific stores
  for (const store of accountStores.values()) {
    store.dispose();
  }
  accountStores.clear();
}
