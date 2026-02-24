/**
 * Gateway Pipeline Types
 * @module channel/gateway-pipeline.types
 * @remarks
 * This module defines the core types for the gateway pipeline system:
 * - StepContext: The shared context passed between pipeline steps
 * - RetryPolicy: Configuration for retry behavior
 * - PipelineStep: Definition of a single pipeline step
 * - GatewayError: Error type for pipeline failures
 * - CleanupFn: Function type for cleanup on shutdown
 */
import type { ZTMChatConfig } from '../types/config.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { PermitData } from '../types/connectivity.js';

/**
 * Logger interface for gateway pipeline operations
 * @remarks
 * All methods are variadic to support structured logging with any number of arguments.
 * The warn, error, and debug methods are optional - if not provided, they will be skipped.
 */
export interface GatewayLogger {
  info: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

/**
 * Callback function to set account status
 * @param status - The status object to set
 */
export interface StatusSetter {
  (status: {
    accountId: string;
    running: boolean;
    lastStartAt?: number;
    lastStopAt?: number;
  }): void;
}

/**
 * Shared context passed between pipeline steps
 * @remarks
 * This interface defines all data that steps can read and write during execution.
 * Required fields (account) must be provided at startup, while optional fields
 * are populated by earlier steps for later steps to use.
 */
export interface StepContext {
  account: { config: ZTMChatConfig; accountId: string };
  config?: ZTMChatConfig;
  endpointName?: string;
  permitPath?: string;
  permitData?: PermitData;
  state?: AccountRuntimeState;
  messageCallback?: (msg: ZTMChatMessage) => Promise<void>;
  cleanupInterval?: NodeJS.Timeout;
  log?: GatewayLogger;
  setStatus?: StatusSetter;
  cfg?: Record<string, unknown>;
}

/**
 * Configuration for retry behavior in pipeline steps
 * @remarks
 * Defines how many times a step should be retried and the backoff strategy.
 * The isRetryable function determines which errors should trigger a retry.
 */
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  isRetryable: (error: Error) => boolean;
}

/**
 * Definition of a single step in the gateway pipeline
 * @remarks
 * Each step has a name for logging, an execute function that performs the step's logic,
 * and a retry policy that defines how to handle failures.
 */
export interface PipelineStep {
  name: string;
  execute(ctx: StepContext): Promise<void>;
  retryPolicy: RetryPolicy;
}

/**
 * Error type for pipeline step failures
 * @extends Error
 * @remarks
 * Includes metadata about which step failed and how many retry attempts were made.
 */
export interface GatewayError extends Error {
  step: string;
  attempts: number;
  cause: Error;
}

/**
 * Function type for cleanup on account shutdown
 * @remarks
 * Called when the account is stopped to release all resources:
 * - Clears cleanup interval
 * - Removes message callback
 * - Aborts watch controller
 * - Stops runtime
 * - Updates account status
 */
export type CleanupFn = () => Promise<void>;
