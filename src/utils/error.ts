/**
 * Error handling utilities
 * @module utils/error
 *
 * Provides consistent error message extraction and error wrapping
 * across the codebase.
 */

// Error handling utilities

/**
 * Safely extract error message from unknown error value
 *
 * This utility ensures consistent error message handling:
 * - If error is an Error instance, returns the message
 * - Otherwise, converts to string representation
 *
 * @param error - Any error value (Error, string, object, etc.)
 * @returns The error message as a string
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   logger.error(`Operation failed: ${extractErrorMessage(err)}`);
 * }
 * ```
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Safely extract error stack trace from unknown error value
 *
 * @param error - Any error value
 * @returns The stack trace if available, undefined otherwise
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const stack = extractErrorStack(err);
 *   if (stack) {
 *     logger.debug(`Stack trace: ${stack}`);
 *   }
 * }
 * ```
 */
export function extractErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Wrap an error with additional context
 * Creates a new Error with the original error as cause
 *
 * @param message - Context message
 * @param cause - Original error
 * @returns New Error with cause chain
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   throw wrapError('Failed to process request', err);
 * }
 * ```
 */
export function wrapError(message: string, cause: unknown): Error {
  const error = new Error(message);
  if (cause instanceof Error) {
    error.cause = cause;
  } else {
    error.cause = new Error(String(cause));
  }
  return error;
}
