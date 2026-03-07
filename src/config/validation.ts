/**
 * ZTM Chat Configuration Validation
 * @module config/validation
 * Validates configuration with detailed error messages using Result pattern
 */

import type {
  ZTMChatConfig,
  ZTMChatConfigValidation,
  DMPolicy,
  ConfigValidationError,
} from '../types/config.js';
import { IDENTIFIER_PATTERN } from '../utils/validation.js';
import { ztmChatConfigSchema } from './schema.js';
import type { ZodError } from 'zod';

/**
 * Map Zod validation error to ConfigValidationError format
 * @param error - Zod validation error
 * @returns Array of ConfigValidationError objects
 */
function mapZodErrorToReason(error: ZodError): ConfigValidationError[] {
  return error.errors.map(err => {
    const field = err.path.length > 0 ? err.path.join('.') : 'root';
    let reason: ConfigValidationError['reason'] = 'invalid_format';

    // Map Zod error codes to our reason types
    if (err.code === 'invalid_string' || err.code === 'invalid_type') {
      reason = 'type_mismatch';
    } else if (err.code === 'too_small' && err.type === 'string') {
      reason = 'required';
    } else if (err.code === 'too_small' || err.code === 'too_big') {
      reason = 'out_of_range';
    } else if (err.code === 'invalid_enum_value') {
      reason = 'invalid_format';
    }

    return {
      field,
      reason,
      value: (err as { received?: unknown }).received,
      message: err.message,
    };
  });
}

/**
 * Validate configuration with detailed errors using Result pattern
 * @param raw - Raw configuration object to validate
 * @returns Validation result with structured errors or resolved config
 *
 * @example
 * ```typescript
 * const result = validateZTMChatConfig(rawConfig);
 * if (result.valid) {
 *   console.log("Config:", result.config);
 * } else {
 *   for (const error of result.errors) {
 *     console.error(`${error.field}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function validateZTMChatConfig(raw: unknown): ZTMChatConfigValidation {
  // Use Zod's safeParse for validation
  const result = ztmChatConfigSchema.safeParse(raw);

  if (!result.success) {
    return {
      valid: false,
      errors: mapZodErrorToReason(result.error),
    };
  }

  return {
    valid: true,
    config: result.data,
    errors: [],
  };
}

/**
 * Check if config is minimally valid (has required fields)
 * @param config - Partial configuration to check
 * @returns True if the config has required fields (agentUrl and username)
 */
export function isConfigMinimallyValid(config: Partial<ZTMChatConfig>): boolean {
  return Boolean(
    config.agentUrl && config.agentUrl.trim() && config.username && config.username.trim()
  );
}

/**
 * Validate a single username format
 * @param username - Username string to validate
 * @returns True if the username matches identifier pattern and length constraints
 */
export function isValidUsername(username: string): boolean {
  return IDENTIFIER_PATTERN.test(username) && username.length > 0 && username.length <= 64;
}

/**
 * Validate a mesh name format
 * @param meshName - Mesh name string to validate
 * @returns True if the mesh name matches identifier pattern and length constraints
 */
export function isValidMeshName(meshName: string): boolean {
  return IDENTIFIER_PATTERN.test(meshName) && meshName.length > 0 && meshName.length <= 64;
}

/**
 * Validate DM policy value
 * @param policy - Policy string to validate
 * @returns True if the policy is a valid DMPolicy value ('allow', 'deny', or 'pairing')
 */
export function isValidDmPolicy(policy: string): policy is DMPolicy {
  return ['allow', 'deny', 'pairing'].includes(policy);
}
