/**
 * Constants for ZTM Chat Channel Plugin
 * @module constants
 * Centralizes all magic numbers and strings for better maintainability
 */

// ============================================================================
// Timing Constants (in milliseconds)
// ============================================================================

// API timeouts
export const API_TIMEOUT_MS = 30000; // 30 seconds - default API request timeout
export const API_TIMEOUT_MIN_MS = 1000; // 1 second - minimum allowed timeout
export const API_TIMEOUT_MAX_MS = 300000; // 5 minutes - maximum allowed timeout

// Polling intervals
export const PROBE_TIMEOUT_MS = 10000; // 10 seconds - account probe timeout

// Watch intervals
export const WATCH_INTERVAL_MS = 1000; // 1 second - watch loop interval
export const FULL_SYNC_DELAY_MS = 30000; // 30 seconds - delay before full sync

// Retry delays
export const RETRY_INITIAL_DELAY_MS = 1000; // 1 second - initial retry delay
export const RETRY_DELAY_MS = 1000; // 1 second - delay between retry attempts
export const RETRY_MAX_DELAY_MS = 10000; // 10 seconds - maximum retry delay
export const RETRY_TIMEOUT_MS = 30000; // 30 seconds - total retry timeout

// Mesh connectivity
export const MESH_CONNECT_MAX_RETRIES = 3; // Maximum retry attempts for mesh connection

// Cache TTL
export const ALLOW_FROM_CACHE_TTL_MS = 30000; // 30 seconds - cache TTL for allowFrom store
export const GROUP_PERMISSION_CACHE_TTL_MS = 60000; // 60 seconds - cache TTL for group permissions

// State persistence
export const STATE_FLUSH_DEBOUNCE_MS = 1000; // 1 second - debounce delay for watermark writes
export const STATE_FLUSH_MAX_DELAY_MS = 5000; // 5 seconds - max delay before forced flush

// Initial sync limit (first install or missing state)
export const INITIAL_SYNC_MAX_HISTORY_MS = 5 * 60 * 1000; // 5 minutes - limit historical messages on first sync

// Chat processing limits
export const MAX_CHATS_PER_SYNC = 100; // Maximum chats to process per sync cycle
export const MESSAGE_SEMAPHORE_PERMITS = 5; // Maximum concurrent message processing operations
export const MESSAGE_PROCESS_TIMEOUT_MS = 10000; // 10 seconds - timeout for individual message processing
export const CALLBACK_SEMAPHORE_PERMITS = 10; // Maximum concurrent callback executions

// ============================================================================
// Size Limits
// ============================================================================

export const MAX_PEERS_PER_ACCOUNT = 1000; // Maximum number of peers per account
export const MAX_GROUP_PERMISSION_CACHE_SIZE = 500; // Maximum cached group permissions per account
export const MAX_MESSAGE_LENGTH = 10000; // Maximum message content length in bytes (10KB) - prevents memory exhaustion

// ============================================================================
// String Constants
// ============================================================================

export const DEFAULT_ACCOUNT_ID = 'default'; // Default account ID when none specified
export const ZTM_CHANNEL_ID = 'ztm-chat'; // Channel identifier for ZTM Chat
export const ZTM_MESSAGE_PATH = '/apps/ztm/chat/shared/'; // Default message storage path
