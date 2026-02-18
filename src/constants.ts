// Constants for ZTM Chat Channel Plugin
// Centralizes all magic numbers and strings for better maintainability

// ============================================================================
// Timing Constants (in milliseconds)
// ============================================================================

// API timeouts
export const API_TIMEOUT_MS = 30000; // 30 seconds - default API request timeout
export const API_TIMEOUT_MIN_MS = 1000; // 1 second - minimum allowed timeout
export const API_TIMEOUT_MAX_MS = 300000; // 5 minutes - maximum allowed timeout

// Polling intervals
export const POLLING_INTERVAL_DEFAULT_MS = 2000; // 2 seconds - default polling interval
export const POLLING_INTERVAL_MIN_MS = 1000; // 1 second - minimum polling interval
export const PROBE_TIMEOUT_MS = 10000; // 10 seconds - account probe timeout

// Watch intervals
export const WATCH_INTERVAL_MS = 1000; // 1 second - watch loop interval
export const FULL_SYNC_DELAY_MS = 30000; // 30 seconds - delay before full sync

// Retry delays
export const RETRY_INITIAL_DELAY_MS = 1000; // 1 second - initial retry delay
export const RETRY_MAX_DELAY_MS = 10000; // 10 seconds - maximum retry delay
export const RETRY_TIMEOUT_MS = 30000; // 30 seconds - total retry timeout

// Pairing cleanup
export const PAIRING_CLEANUP_INTERVAL_MS = 1000; // 1 second - cleanup check interval
export const PAIRING_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour - max age for pending pairings

// State persistence
export const STATE_FLUSH_DEBOUNCE_MS = 1000; // 1 second - debounce delay for watermark writes
export const STATE_FLUSH_MAX_DELAY_MS = 5000; // 5 seconds - max delay before forced flush

// Chat processing limits
export const MAX_CHATS_PER_POLL = 100; // Maximum chats to process per polling cycle

// ============================================================================
// Size Limits
// ============================================================================

export const MAX_PEERS_PER_ACCOUNT = 1000; // Maximum number of peers per account
export const MAX_FILES_PER_ACCOUNT = 1000; // Maximum number of tracked files per account
export const MAX_PAIRINGS_PER_ACCOUNT = 1000; // Maximum number of pending pairings

// ============================================================================
// String Constants
// ============================================================================

export const DEFAULT_ACCOUNT_ID = "default"; // Default account ID when none specified
export const ZTM_CHANNEL_ID = "ztm-chat"; // Channel identifier for ZTM Chat
export const ZTM_MESSAGE_PATH = "/apps/ztm/chat/shared/"; // Default message storage path
