/**
 * ZTM Chat Messaging Module
 * @module messaging
 * Barrel export for all messaging-related functionality
 */

// Context (dependency injection for messaging layer)
export * from './context.js';

// Message processing
export * from './processor.js';

// Shared message processing helpers
export * from './message-processor-helpers.js';

// Message watching
export * from './watcher.js';

// Message callback dispatching
export * from './dispatcher.js';

// Outbound messaging
export * from './outbound.js';

// Type exports
export type { ZTMChatMessage, MessageCheckResult, RawZTMMessage } from '../types/messaging.js';
