// src/channel/gateway-pipeline.ts
import type { StepContext, PipelineStep, CleanupFn } from './gateway-pipeline.types.js';
import { stopRuntime } from '../runtime/state.js';

export class GatewayPipeline {
  private ctx: StepContext;
  private steps: PipelineStep[];
  private stepResults: Map<string, { success: boolean; attempts: number; durationMs: number }> =
    new Map();

  constructor(ctx: StepContext, steps: PipelineStep[]) {
    this.ctx = ctx;
    this.steps = steps;
  }

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

  createCleanupFunction(): CleanupFn {
    return async () => {
      this.ctx.log?.info(`[${this.ctx.account.accountId}] Cleaning up gateway resources`);

      if (this.ctx.cleanupInterval) {
        clearInterval(this.ctx.cleanupInterval);
      }

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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStepResults(): Map<string, { success: boolean; attempts: number; durationMs: number }> {
    return this.stepResults;
  }
}
