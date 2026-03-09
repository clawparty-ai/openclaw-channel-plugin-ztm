/**
 * Constants for ZTM Chat Channel Plugin
 * @module constants
 * Centralizes all magic numbers and strings for better maintainability
 */

// ============================================================================
// Timing Constants (in milliseconds)
// ============================================================================

// API timeouts
/** Default API request timeout in milliseconds (30 seconds) */
export const API_TIMEOUT_MS = 30000;

/** Minimum allowed API timeout in milliseconds (1 second) */
export const API_TIMEOUT_MIN_MS = 1000;

/** Maximum allowed API timeout in milliseconds (5 minutes) */
export const API_TIMEOUT_MAX_MS = 300000;

// Timeouts
/** Account probe timeout in milliseconds (10 seconds) */
export const PROBE_TIMEOUT_MS = 10000;

// Watch intervals
/** Watch loop interval in milliseconds (1 second) */
export const WATCH_INTERVAL_MS = 1000;

/** Delay before full sync operation in milliseconds (30 seconds) */
export const FULL_SYNC_DELAY_MS = 30000;

// Retry delays
/** Initial retry delay in milliseconds (1 second) */
export const RETRY_INITIAL_DELAY_MS = 1000;

/** Delay between retry attempts in milliseconds (1 second) */
export const RETRY_DELAY_MS = 1000;

/** Maximum retry delay in milliseconds (10 seconds) */
export const RETRY_MAX_DELAY_MS = 10000;

/** Total retry timeout in milliseconds (30 seconds) */
export const RETRY_TIMEOUT_MS = 30000;

// Mesh connectivity
/** Maximum retry attempts for mesh connection */
export const MESH_CONNECT_MAX_RETRIES = 3;

// Cache TTL
/** Cache TTL for allowFrom store in milliseconds (30 seconds) */
export const ALLOW_FROM_CACHE_TTL_MS = 30000;

/** Cache TTL for group permissions in milliseconds (60 seconds) */
export const GROUP_PERMISSION_CACHE_TTL_MS = 60000;

// State persistence
/** Debounce delay for watermark writes in milliseconds (1 second) */
export const STATE_FLUSH_DEBOUNCE_MS = 1000;

/** Maximum delay before forced flush in milliseconds (5 seconds) */
export const STATE_FLUSH_MAX_DELAY_MS = 5000;

// Initial sync limit (first install or missing state)
/** Limit historical messages on first sync in milliseconds (5 minutes) */
export const INITIAL_SYNC_MAX_HISTORY_MS = 5 * 60 * 1000;

// Chat processing limits
/** Maximum chats to process per sync cycle */
export const MAX_CHATS_PER_SYNC = 100;

/** Maximum concurrent message processing operations */
export const MESSAGE_SEMAPHORE_PERMITS = 5;

/** Timeout for individual message processing in milliseconds (10 seconds) */
export const MESSAGE_PROCESS_TIMEOUT_MS = 10000;

/** Maximum concurrent callback executions */
export const CALLBACK_SEMAPHORE_PERMITS = 10;

// ============================================================================
// Size Limits
// ============================================================================

/** Maximum number of peers per account */
export const MAX_PEERS_PER_ACCOUNT = 1000;

/** Maximum cached group permissions per account */
export const MAX_GROUP_PERMISSION_CACHE_SIZE = 500;

/** Maximum message content length in bytes (10KB) - prevents memory exhaustion */
export const MAX_MESSAGE_LENGTH = 10000;

// ============================================================================
// String Constants
// ============================================================================

/** Default account ID when none specified */
export const DEFAULT_ACCOUNT_ID = 'default';

/** Channel identifier for ZTM Chat */
export const ZTM_CHANNEL_ID = 'ztm-chat';

/** Default message storage path */
export const ZTM_MESSAGE_PATH = '/apps/ztm/chat/shared/';
