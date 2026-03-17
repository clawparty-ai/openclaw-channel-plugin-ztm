/**
 * ZTM Chat Context Types
 * @module types/contexts
 * Strongly-typed context interfaces for logging, errors, and operations
 *
 * Replaces Record<string, unknown> with specific interfaces for better type safety
 */

// ═════════════════════════════════════════════════════════════════════════════
// Logging Context Types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Common log context fields used across the application
 */
export interface BaseLogContext {
  /** Component or module name */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** Unique identifier for tracking */
  correlationId?: string;
  /** Timestamp of the event */
  timestamp?: string;
}

/**
 * Message-related log context
 */
export interface MessageLogContext extends BaseLogContext {
  /** Peer or sender identifier */
  peer?: string;
  /** Message ID */
  messageId?: string;
  /** Message timestamp */
  messageTime?: number;
  /** Message direction */
  direction?: 'inbound' | 'outbound';
  /** Content preview (truncated) */
  contentPreview?: string;
}

/**
 * API-related log context
 */
export interface ApiLogContext extends BaseLogContext {
  /** HTTP method */
  method?: string;
  /** API path */
  path?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Request ID */
  requestId?: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
}

/**
 * Configuration-related log context
 */
export interface ConfigLogContext extends BaseLogContext {
  /** Account ID */
  accountId?: string;
  /** Configuration field being accessed */
  field?: string;
  /** Configuration value (sanitized) */
  value?: unknown;
}

/**
 * Base log context that allows additional properties
 * Use this for logger context parameters when you need type safety for known fields
 * but also need to support arbitrary additional data
 */
export type LogContext = BaseLogContext & Record<string, unknown>;

/**
 * Strongly typed message log context
 */
export type TypedMessageLogContext = MessageLogContext & Record<string, unknown>;

/**
 * Strongly typed API log context
 */
export type TypedApiLogContext = ApiLogContext & Record<string, unknown>;

/**
 * Strongly typed configuration log context
 */
export type TypedConfigLogContext = ConfigLogContext & Record<string, unknown>;

// ═════════════════════════════════════════════════════════════════════════════
// Error Context Types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Base error context with common fields
 */
export interface BaseErrorContext {
  /** When the error occurred */
  attemptedAt?: string;
  /** Operation being attempted */
  operation?: string;
  /** Additional error details */
  reason?: string;
}

/**
 * Message operation error context
 */
export interface MessageErrorContext extends BaseErrorContext {
  /** Peer identifier */
  peer?: string;
  /** Message timestamp */
  messageTime?: number;
  /** Content preview */
  contentPreview?: string;
  /** File path (for read/write errors) */
  filePath?: string;
  /** Parse operation details */
  parseDetails?: string;
}

/**
 * API error context
 */
export interface ApiErrorContext extends BaseErrorContext {
  /** HTTP method */
  method?: string;
  /** API path */
  path?: string;
  /** HTTP status code */
  statusCode?: number;
  /** HTTP status text */
  statusText?: string;
  /** Response body preview */
  responseBodyPreview?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Discovery error context
 */
export interface DiscoveryErrorContext extends BaseErrorContext {
  /** Discovery operation type */
  operation?: 'discoverUsers' | 'discoverPeers' | 'scanStorage';
  /** Source of discovery attempt */
  source?: string;
}

/**
 * Configuration error context
 */
export interface ConfigErrorContext extends BaseErrorContext {
  /** Configuration field name */
  field?: string;
  /** Invalid value */
  value?: unknown;
  /** Validation reason */
  reason?: string;
}

/**
 * Base error context that allows additional properties
 * Use this for error context parameters when you need type safety for known fields
 * but also need to support arbitrary additional data
 */
export type ErrorContext = BaseErrorContext & Record<string, unknown>;

/**
 * Strongly typed message error context
 */
export type TypedMessageErrorContext = MessageErrorContext & Record<string, unknown>;

/**
 * Strongly typed API error context
 */
export type TypedApiErrorContext = ApiErrorContext & Record<string, unknown>;

/**
 * Strongly typed discovery error context
 */
export type TypedDiscoveryErrorContext = DiscoveryErrorContext & Record<string, unknown>;

/**
 * Strongly typed configuration error context
 */
export type TypedConfigErrorContext = ConfigErrorContext & Record<string, unknown>;

// ═════════════════════════════════════════════════════════════════════════════
// Configuration Object Types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generic configuration object with known and unknown fields
 * Use this when configuration may contain additional dynamic fields
 */
export interface ConfigObject {
  /** Known configuration fields */
  [key: string]: unknown;
}

/**
 * Channel configuration in OpenClaw format
 */
export interface ChannelConfigObject {
  /** Account configurations keyed by account ID */
  accounts?: Record<string, AccountConfigObject>;
  /** Additional channel-specific settings */
  [key: string]: unknown;
}

/**
 * Account configuration object
 */
export interface AccountConfigObject {
  /** Account-specific settings */
  [key: string]: unknown;
}

/**
 * Binding match configuration for message routing
 */
export interface BindingMatchConfig {
  /** Channel identifier */
  channel: string;
  /** Account ID */
  accountId?: string;
  /** Additional match criteria */
  [key: string]: unknown;
}

/**
 * Message binding configuration
 */
export interface BindingConfig {
  /** Match criteria */
  match?: BindingMatchConfig;
  /** Additional binding settings */
  [key: string]: unknown;
}

// ═════════════════════════════════════════════════════════════════════════════
// Runtime State Types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Message state data for persistence
 */
export interface MessageStateObject {
  /** Per-account watermark data */
  accounts: Record<string, AccountWatermarks>;
}

/**
 * Per-account watermarks for message deduplication
 */
export interface AccountWatermarks {
  /** Per-peer or per-group watermarks */
  [key: string]: number;
}
