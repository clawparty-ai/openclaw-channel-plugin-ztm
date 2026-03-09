/**
 * ZTM Chat Plugin Logger
 * @module utils/logger
 *
 * Structured logging with level support (debug, info, warn, error).
 * Provides singleton logger and context-aware logger factory.
 *
 * Features:
 * - Log level configuration via ZTM_CHAT_LOG_LEVEL environment variable
 * - Structured output with timestamp, level, channel, and context
 * - Runtime logger injection for consistent logging across modules
 * - Context-aware logger factory for module-specific logging
 *
 * @example
 * import { logger, getLogger, createLogger } from './utils/logger.js';
 *
 * // Basic usage
 * logger.info('Operation started');
 *
 * // With context
 * logger.info('Message sent', { peerId: 'user@example.com', messageId: 'abc123' });
 *
 * // Context-aware logger
 * const chatLogger = createLogger({ component: 'chat-processor' });
 * chatLogger.info('Processing message');
 *
 * // Runtime logger (for dependency injection)
 * const log = getLogger(); // Uses runtime logger if available
 */

// ZTM Chat Plugin Logger

/**
 * Log level for filtering messages by severity.
 *
 * @remarks
 * Messages are logged only if their level is at least as severe as the configured level.
 * Levels in order of severity: `debug` < `info` < `warn` < `error`
 *
 * @example
 * ```typescript
 * import { logger, LogLevel } from './utils/logger.js';
 *
 * // Set log level to only show warnings and errors
 * logger.setLevel('warn' as LogLevel);
 * ```
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  channel: string;
  message: string;
  context?: Record<string, unknown>;
}

class ZTMChatLogger {
  private static instance: ZTMChatLogger;
  private logLevel: LogLevel = 'info';
  private channel = 'ztm-chat';

  private constructor() {
    // Read log level from environment
    const envLevel = process.env['ZTM_CHAT_LOG_LEVEL'];
    if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
      this.logLevel = envLevel as LogLevel;
    }
  }

  static getInstance(): ZTMChatLogger {
    if (!ZTMChatLogger.instance) {
      ZTMChatLogger.instance = new ZTMChatLogger();
    }
    return ZTMChatLogger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] [${entry.channel}] ${entry.message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      channel: this.channel,
      message,
      context,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  errorWithException(error: unknown, message: string): void {
    const context = {
      exception: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    this.log('error', message, context);
  }

  setChannel(channel: string): void {
    this.channel = channel;
  }

  setLevel(level: LogLevel): void {
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      this.logLevel = level;
    }
  }
}

// Singleton instance
/**
 * Singleton logger instance for ZTM Chat plugin.
 *
 * @remarks
 * This is the default logger that should be used throughout the codebase.
 * It reads the log level from the `ZTM_CHAT_LOG_LEVEL` environment variable.
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('Operation completed successfully');
 * logger.error('Operation failed', { errorCode: 500 });
 * ```
 */
export const logger: Logger = ZTMChatLogger.getInstance();

// Default logger for dependency injection
/**
 * Default logger instance used for dependency injection.
 *
 * @remarks
 * This is an alias for the singleton {@link logger} instance.
 * Use this when you need to inject a logger as a dependency.
 *
 * @example
 * ```typescript
 * import { defaultLogger } from './utils/logger.js';
 *
 * class MyService {
 *   private log = defaultLogger;
 * }
 * ```
 */
export const defaultLogger: Logger = logger;

// Context-aware logger factory
/**
 * Creates a context-aware logger that automatically includes context in every log message.
 *
 * @param context - Key-value pairs to include in every log message from this logger
 * @returns A logger object that automatically includes the provided context
 *
 * @remarks
 * The returned logger has the same interface as {@link Logger} but doesn't accept
 * context parameters, as the context is fixed at creation time.
 *
 * @example
 * ```typescript
 * import { createLogger } from './utils/logger.js';
 *
 * const chatLogger = createLogger({ component: 'chat-processor', accountId: 'user@example.com' });
 * chatLogger.info('Processing message'); // Logs with component and accountId context
 * chatLogger.error('Failed to process'); // Logs with the same context
 * ```
 */
export function createLogger(context: Record<string, string>): {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
} {
  return {
    debug: msg => logger.debug(msg, context),
    info: msg => logger.info(msg, context),
    warn: msg => logger.warn(msg, context),
    error: msg => logger.error(msg, context),
  };
}

// ============================================================================
// Runtime Logger Access - Consistent logging across the codebase
// ============================================================================

/**
 * Get a logger that uses runtime logger if available, otherwise falls back to default logger.
 * This provides consistent logging access across all modules.
 *
 * Usage:
 *   const log = getLogger();
 *   log.info("message"); // Uses runtime logger if available, otherwise default
 *
 * Note: This function attempts to use the runtime logger synchronously. If runtime
 * is not initialized, it falls back to the default logger.
 */
export function getLogger(): Logger {
  // Try to get runtime logger synchronously
  // Note: We use a try-catch because runtime might not be initialized
  try {
    // We can't do dynamic import synchronously, so we check a module-level flag
    // The runtime will set this flag when initialized
    return runtimeLogger ?? logger;
  } catch {
    // Runtime not available, use default logger
    return logger;
  }
}

/**
 * Module-level variable to store runtime logger when set
 * This is set by the runtime when it initializes
 */
let runtimeLogger: Logger | null = null;

/**
 * Sets the runtime logger instance for dependency injection.
 *
 * @param logger - The logger instance to use as the runtime logger
 *
 * @remarks
 * This function is called by the runtime initialization process to inject
 * a custom logger that will be used by {@link getLogger} throughout the codebase.
 * This enables consistent logging with runtime-specific configuration.
 *
 * @example
 * ```typescript
 * import { setRuntimeLogger } from './utils/logger.js';
 *
 * // Custom logger implementation
 * const customLogger: Logger = {
 *   debug: (msg, ctx) => console.log('[DEBUG]', msg, ctx),
 *   info: (msg, ctx) => console.log('[INFO]', msg, ctx),
 *   warn: (msg, ctx) => console.warn('[WARN]', msg, ctx),
 *   error: (msg, ctx) => console.error('[ERROR]', msg, ctx),
 * };
 *
 * // Set as runtime logger
 * setRuntimeLogger(customLogger);
 * ```
 *
 * @see {@link getLogger} for retrieving the runtime logger
 */
export function setRuntimeLogger(logger: Logger): void {
  runtimeLogger = logger;
}
