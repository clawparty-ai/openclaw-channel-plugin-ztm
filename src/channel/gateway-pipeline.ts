/**
 * Gateway Pipeline Implementation
 * @module channel/gateway-pipeline
 * @remarks
 * This module implements the gateway pipeline pattern for account initialization.
 * The pipeline executes a series of steps (validate_config, validate_connectivity,
 * load_permit, join_mesh, initialize_runtime, preload_message_state, setup_callbacks)
 * with configurable retry policies for fault tolerance.
 */
import type { StepContext, PipelineStep, CleanupFn } from './gateway-pipeline.types.js';
import { stopRuntime } from '../runtime/state.js';

/**
 * GatewayPipeline orchestrates the execution of gateway steps with retry logic
 * @remarks
 * The pipeline executes each step sequentially. If a step fails, it checks whether
 * the error is retryable based on the step's retry policy. Retryable errors
 * trigger exponential backoff before the next attempt.
 */
export class GatewayPipeline {
  private ctx: StepContext;
  private steps: PipelineStep[];
  private stepResults: Map<string, { success: boolean; attempts: number; durationMs: number }> =
    new Map();

  /**
   * Creates a new GatewayPipeline instance
   * @param ctx - The step context containing account info and callbacks
   * @param steps - Array of pipeline steps to execute
   */
  constructor(ctx: StepContext, steps: PipelineStep[]) {
    this.ctx = ctx;
    this.steps = steps;
  }

  /**
   * Executes all pipeline steps sequentially
   * @returns Promise resolving to a cleanup function
   * @remarks
   * Steps are executed in order. Each step can retry based on its retry policy.
   * If all steps succeed, returns a cleanup function to be called on shutdown.
   */
  async execute(): Promise<CleanupFn> {
    for (const step of this.steps) {
      await this.executeStep(step);
    }
    return this.createCleanupFunction();
  }

  private async executeStep(step: PipelineStep): Promise<void> {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, isRetryable } =
      step.retryPolicy;
    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = Date.now();
        this.ctx.log?.info(
          `[${this.ctx.account.accountId}] Executing step: ${step.name} (attempt ${attempt}/${maxAttempts})`
        );

        await step.execute(this.ctx);

        const durationMs = Date.now() - startTime;
        this.stepResults.set(step.name, { success: true, attempts: attempt, durationMs });
        this.ctx.log?.info(
          `[${this.ctx.account.accountId}] Step ${step.name} completed in ${durationMs}ms`
        );
        return;
      } catch (error) {
        lastError = error as Error;

        if (!isRetryable(lastError) || attempt === maxAttempts) {
          this.stepResults.set(step.name, { success: false, attempts: attempt, durationMs: 0 });
          throw new Error(
            `Step ${step.name} failed after ${attempt} attempt(s): ${lastError.message}`
          );
        }

        if (this.ctx.log?.warn) {
          this.ctx.log.warn(
            `[${this.ctx.account.accountId}] Step ${step.name} failed (attempt ${attempt}), retrying in ${delay}ms: ${lastError.message}`
          );
        }

        await this.sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }

    throw new Error(`Step ${step.name} failed: ${lastError?.message}`);
  }

  /**
   * Creates a cleanup function to be called on account shutdown
   * @returns Cleanup function that releases all gateway resources
   * @remarks
   * The cleanup function:
   * - Clears the cleanup interval
   * - Removes the message callback
   * - Aborts the watch controller
   * - Stops the runtime
   * - Updates the account status
   */
  createCleanupFunction(): CleanupFn {
    return async () => {
      this.ctx.log?.info(`[${this.ctx.account.accountId}] Cleaning up gateway resources`);

      if (this.ctx.messageCallback && this.ctx.state) {
        this.ctx.state.messageCallbacks.delete(this.ctx.messageCallback);
      }

      if (this.ctx.state?.watchAbortController) {
        this.ctx.state.watchAbortController.abort();
      }

      await stopRuntime(this.ctx.account.accountId);

      this.ctx.setStatus?.({
        accountId: this.ctx.account.accountId,
        running: false,
        lastStopAt: Date.now(),
      });
    };
  }

  /**
   * Pauses execution for the specified number of milliseconds
   * @param ms - Number of milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the results of all executed steps
   * @returns Map of step names to their execution results
   */
  getStepResults(): Map<string, { success: boolean; attempts: number; durationMs: number }> {
    return this.stepResults;
  }
}
