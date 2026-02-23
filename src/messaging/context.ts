/**
 * @fileoverview Messaging Context
 * @module messaging/context
 * Encapsulates dependencies needed by the messaging layer
 * Eliminates direct DI container access from messaging modules
 */

import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { container, DEPENDENCIES } from '../di/index.js';
import type { IAllowFromRepository } from '../runtime/repository.js';
import type { IMessageStateRepository } from '../runtime/repository.js';

/**
 * Messaging context - dependencies needed by message processing
 *
 * This context provides access to repositories without requiring
 * the messaging layer to directly access the DI container.
 *
 * Usage:
 * ```typescript
 * const context = createMessagingContext(runtime);
 * await startMessageWatcher(state, context);
 * ```
 */
export interface MessagingContext {
  /** AllowFrom repository for pairing approvals */
  allowFromRepo: IAllowFromRepository;
  /** Message state repository for persistence */
  messageStateRepo: IMessageStateRepository;
}

/**
 * Create messaging context
 *
 * Uses the DI container to get the required repositories.
 *
 * @returns Messaging context with all required dependencies
 */
export function createMessagingContext(_runtime: PluginRuntime): MessagingContext {
  // Get repositories from DI container
  // This keeps container access in one place (this function)
  const allowFromRepo = container.get(DEPENDENCIES.ALLOW_FROM_REPO) as IAllowFromRepository;
  const messageStateRepo = container.get(
    DEPENDENCIES.MESSAGE_STATE_REPO
  ) as IMessageStateRepository;

  if (!allowFromRepo || !messageStateRepo) {
    throw new Error('Required repositories not available in container');
  }

  return {
    allowFromRepo,
    messageStateRepo,
  };
}
