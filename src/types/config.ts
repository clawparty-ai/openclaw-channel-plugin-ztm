/**
 * ZTM Chat Configuration Types
 * @module types/config
 * Single source of truth: types are inferred from config/schema.ts
 * DO NOT redefine types here - import from config/schema.ts instead
 */

// Re-export all types from schema
export type {
  ZTMChatConfig,
  DMPolicy,
  GroupPolicy,
  PermitSource,
  ExtendedZTMChatConfig,
  ZTMChatConfigValidation,
  ConfigValidationError,
  ValidationErrorReason,
} from '../config/schema.js';
