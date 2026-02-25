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
import {
  validationError,
  isValidUrl,
  IDENTIFIER_PATTERN,
  containsPathTraversal,
} from '../utils/validation.js';

/**
 * Validate agent URL field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validateAgentUrl(config: Record<string, unknown>, errors: ConfigValidationError[]): void {
  const value = config.agentUrl;
  if (!value || typeof value !== 'string' || !value.trim()) {
    errors.push(validationError('agentUrl', 'required', value, 'agentUrl is required'));
  } else if (!isValidUrl(value)) {
    errors.push(
      validationError(
        'agentUrl',
        'invalid_format',
        value,
        'agentUrl must be a valid HTTP/HTTPS URL (e.g., https://ztm-agent.example.com:7777)'
      )
    );
  }
}

/**
 * Validate mesh name field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validateMeshName(config: Record<string, unknown>, errors: ConfigValidationError[]): void {
  const value = config.meshName;
  if (!value || typeof value !== 'string' || !value.trim()) {
    errors.push(validationError('meshName', 'required', value, 'meshName is required'));
  } else if (!IDENTIFIER_PATTERN.test(value)) {
    errors.push(
      validationError(
        'meshName',
        'invalid_format',
        value,
        'meshName must contain only letters, numbers, hyphens, and underscores'
      )
    );
  } else if (value.length > 64) {
    errors.push(
      validationError('meshName', 'out_of_range', value, 'meshName must be 64 characters or less')
    );
  }
}

/**
 * Validate username field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validateUsername(config: Record<string, unknown>, errors: ConfigValidationError[]): void {
  const value = config.username;
  if (!value || typeof value !== 'string' || !value.trim()) {
    errors.push(validationError('username', 'required', value, 'username is required'));
  } else if (!IDENTIFIER_PATTERN.test(value)) {
    errors.push(
      validationError(
        'username',
        'invalid_format',
        value,
        'username must contain only letters, numbers, hyphens, and underscores'
      )
    );
  } else if (value.length > 64) {
    errors.push(
      validationError('username', 'out_of_range', value, 'username must be 64 characters or less')
    );
  }
}

/**
 * Validate DM policy field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validateDmPolicy(config: Record<string, unknown>, errors: ConfigValidationError[]): void {
  const value = config.dmPolicy;
  if (value !== undefined && !['allow', 'deny', 'pairing'].includes(value as string)) {
    errors.push(
      validationError(
        'dmPolicy',
        'type_mismatch',
        value,
        "dmPolicy must be 'allow', 'deny', or 'pairing'"
      )
    );
  }
}

/**
 * Validate API timeout field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validateApiTimeout(
  config: Record<string, unknown>,
  errors: ConfigValidationError[]
): void {
  const value = config.apiTimeout;
  if (value !== undefined && (typeof value !== 'number' || value < 1000)) {
    errors.push(
      validationError('apiTimeout', 'out_of_range', value, 'apiTimeout must be at least 1000ms')
    );
  }
}

/**
 * Validate permitSource field
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validatePermitSource(
  config: Record<string, unknown>,
  errors: ConfigValidationError[]
): void {
  const value = config.permitSource;
  if (value === undefined) {
    errors.push(
      validationError(
        'permitSource',
        'required',
        value,
        "permitSource is required (must be 'server' or 'file')"
      )
    );
  } else if (!['server', 'file'].includes(value as string)) {
    errors.push(
      validationError(
        'permitSource',
        'type_mismatch',
        value,
        "permitSource must be 'server' or 'file'"
      )
    );
  }
}

/**
 * Validate permitFilePath field (conditional on permitSource)
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validatePermitFilePath(
  config: Record<string, unknown>,
  errors: ConfigValidationError[]
): void {
  const permitSource = config.permitSource;
  const value = config.permitFilePath;

  // Check if required
  if (permitSource === 'file' && (!value || typeof value !== 'string' || !value.trim())) {
    errors.push(
      validationError(
        'permitFilePath',
        'required',
        value,
        "permitFilePath is required when permitSource is 'file'"
      )
    );
  }

  // Check for path traversal attacks if value is provided
  if (value && typeof value === 'string' && containsPathTraversal(value)) {
    errors.push(
      validationError(
        'permitFilePath',
        'invalid_format',
        value,
        'permitFilePath contains invalid path traversal patterns (../ or ..\\)'
      )
    );
  }
}

/**
 * Validate permitUrl field (conditional on permitSource)
 * @param config - Configuration object to validate
 * @param errors - Array to collect validation errors
 */
function validatePermitUrlConditional(
  config: Record<string, unknown>,
  errors: ConfigValidationError[]
): void {
  const permitSource = config.permitSource;
  const value = config.permitUrl;

  if (permitSource === 'server') {
    if (!value || typeof value !== 'string' || !value.trim()) {
      errors.push(
        validationError(
          'permitUrl',
          'required',
          value,
          "permitUrl is required when permitSource is 'auto'"
        )
      );
    } else if (!isValidUrl(value)) {
      errors.push(
        validationError(
          'permitUrl',
          'invalid_format',
          value,
          'permitUrl must be a valid HTTP/HTTPS URL (e.g., https://clawparty.flomesh.io:7779/permit)'
        )
      );
    }
  }
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
  const errors: ConfigValidationError[] = [];

  // Validate root object type - must be a plain object, not array or null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [
        {
          field: 'root',
          reason: 'type_mismatch',
          value: raw,
          message: 'Configuration must be a plain object',
        },
      ],
    };
  }

  const config = raw as Record<string, unknown>;

  // Validate all required fields
  validateAgentUrl(config, errors);
  // Validate permitSource first (required)
  validatePermitSource(config, errors);

  // Conditional validations based on permitSource
  validatePermitUrlConditional(config, errors);
  validatePermitFilePath(config, errors);

  validateMeshName(config, errors);
  validateUsername(config, errors);
  validateDmPolicy(config, errors);
  validateApiTimeout(config, errors);

  // Return early if there are validation errors
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  // Resolve and return validated config
  // Use defensive programming: validate fields exist even after validation pass
  // If required fields are missing despite validation passing, return error
  const agentUrl = config.agentUrl?.toString().trim();
  const meshName = config.meshName?.toString().trim();
  const username = config.username?.toString().trim();
  if (!agentUrl || !meshName || !username) {
    return {
      valid: false,
      errors: [
        {
          field: 'root',
          reason: 'type_mismatch',
          value: config,
          message: 'Missing required fields after validation',
        },
      ],
    };
  }

  const resolvedConfig = buildResolvedConfig(config);

  return {
    valid: true,
    config: resolvedConfig,
    errors: [],
  };
}

/**
 * Build resolved configuration from validated raw config
 * @param config - Validated configuration object
 * @returns Resolved ZTMChatConfig with normalized values
 */
function buildResolvedConfig(config: Record<string, unknown>): ZTMChatConfig {
  const agentUrl = config.agentUrl?.toString().trim() ?? '';
  const meshName = config.meshName?.toString().trim() ?? '';
  const username = config.username?.toString().trim() ?? '';

  const rawPermitSource = config.permitSource;
  const permitSource: 'server' | 'file' =
    rawPermitSource === 'server' || rawPermitSource === 'file' ? rawPermitSource : 'server';

  return {
    agentUrl,
    permitSource,
    permitUrl: permitSource === 'server' ? (config.permitUrl?.toString().trim() ?? '') : '',
    permitFilePath: config.permitFilePath ? config.permitFilePath.toString().trim() : undefined,
    meshName,
    username,
    enableGroups: Boolean(config.enableGroups),
    dmPolicy:
      config.dmPolicy === 'allow' || config.dmPolicy === 'deny' || config.dmPolicy === 'pairing'
        ? config.dmPolicy
        : 'pairing',
    allowFrom: Array.isArray(config.allowFrom)
      ? config.allowFrom
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim())
          .filter(Boolean)
      : undefined,
    apiTimeout:
      typeof config.apiTimeout === 'number' && config.apiTimeout >= 1000
        ? Math.min(config.apiTimeout, 300000)
        : 30000,
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
