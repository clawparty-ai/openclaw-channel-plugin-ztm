/**
 * ZTM Chat Messaging Module
 * @module messaging
 * Barrel export for all messaging-related functionality
 */

// Context (dependency injection for messaging layer)
export * from './context.js';

// Message processing
export * from './processor.js';

// Shared message processing helpers (DRY: used by watcher and polling)
export * from './message-processor-helpers.js';

// Message watching and polling
export * from './watcher.js';

// Message callback dispatching
export * from './dispatcher.js';

// Outbound messaging
export * from './outbound.js';

// Polling watcher (fallback mechanism)
export * from './polling.js';

// Type exports
export type { ZTMChatMessage, MessageCheckResult, RawZTMMessage } from '../types/messaging.js';
