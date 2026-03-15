/**
 * Message Processing Strategies
 *
 * @module messaging/strategies
 *
 * Defines pluggable message processing strategies for the ZTM Chat plugin.
 * Strategies handle different message types and processing scenarios.
 *
 * @remarks
 * This module provides:
 * - {@link ./message-strategies.js} - Core strategy implementations
 * - {@link ./types.js} - Strategy type definitions
 *
 * @example
 * ```typescript
 * import { DefaultMessageStrategy } from './messaging/strategies/mod.js';
 *
 * const strategy = new DefaultMessageStrategy();
 * await strategy.process(message, context);
 * ```
 */

export * from './message-strategies.js';
export * from './types.js';
