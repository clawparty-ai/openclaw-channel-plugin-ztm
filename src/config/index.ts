/**
 * ZTM Chat Configuration Module barrel export
 * @module config
 * Barrel export for all configuration-related functionality
 */

// Schema definition (includes types via Static<typeof>)
export * from './schema.js';

// Validation
export * from './validation.js';

// Defaults and resolution
export * from './defaults.js';

// Re-export types that are not defined in schema.ts
export type {
  ExtendedZTMChatConfig,
  ZTMChatConfigValidation,
  ConfigValidationError,
  ValidationErrorReason,
} from '../types/config.js';
