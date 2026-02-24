/**
 * Messaging Context
 * @module messaging/context
 * Encapsulates dependencies needed by the messaging layer
 * Eliminates direct DI container access from messaging modules
 */

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
 * const context = createMessagingContext(allowFromRepo, messageStateRepo);
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
 * Accepts repositories as parameters for explicit dependency injection.
 *
 * @param allowFromRepo - AllowFrom repository instance
 * @param messageStateRepo - Message state repository instance
 * @returns Messaging context with all required dependencies
 */
export function createMessagingContext(
  allowFromRepo: IAllowFromRepository,
  messageStateRepo: IMessageStateRepository
): MessagingContext {
  if (!allowFromRepo || !messageStateRepo) {
    throw new Error('Required repositories not available');
  }

  return {
    allowFromRepo,
    messageStateRepo,
  };
}
