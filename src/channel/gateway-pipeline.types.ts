// src/channel/gateway-pipeline.types.ts
import type { ZTMChatConfig } from '../types/config.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatMessage } from '../types/messaging.js';

export interface GatewayLogger {
  info: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface StatusSetter {
  (status: {
    accountId: string;
    running: boolean;
    lastStartAt?: number;
    lastStopAt?: number;
  }): void;
}

export interface StepContext {
  account: { config: ZTMChatConfig; accountId: string };
  config?: ZTMChatConfig;
  endpointName?: string;
  permitPath?: string;
  permitData?: unknown;
  state?: AccountRuntimeState;
  messageCallback?: (msg: ZTMChatMessage) => Promise<void>;
  cleanupInterval?: NodeJS.Timeout;
  log?: GatewayLogger;
  setStatus?: StatusSetter;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  isRetryable: (error: Error) => boolean;
}

export interface PipelineStep {
  name: string;
  execute(ctx: StepContext): Promise<void>;
  retryPolicy: RetryPolicy;
}

export interface GatewayError extends Error {
  step: string;
  attempts: number;
  cause: Error;
}

export type CleanupFn = () => Promise<void>;
