/**
 * ZTM Chat Configuration Schema Definition
 * @module config/schema
 * Zod schema definition with inferred types
 * Schema drives types - no separate type definitions needed
 */

import { z } from 'zod';

// ============================================
// Path Traversal Detection (inlined to avoid circular dependency)
// ============================================

/**
 * Check for path traversal patterns in a string
 * Detects attempts to access parent directories using ../ or ..\
 */
function containsPathTraversal(input: string): boolean {
  const pathTraversalPatterns = [
    '../',
    '..\\',
    '%2e%2e',
    '%2e%2e%2f',
    '%2e%2e%5c',
    '..%2f',
    '..%5c',
  ];
  const lowerInput = input.toLowerCase();
  return pathTraversalPatterns.some(pattern => lowerInput.includes(pattern));
}

// ============================================
// Union Type Value Constants
// ============================================

const DM_POLICY_VALUES = ['allow', 'deny', 'pairing'] as const;
export type DMPolicy = (typeof DM_POLICY_VALUES)[number];

const GROUP_POLICY_VALUES = ['open', 'disabled', 'allowlist'] as const;
export type GroupPolicy = (typeof GROUP_POLICY_VALUES)[number];

const PERMIT_SOURCE_VALUES = ['server', 'file'] as const;
export type PermitSource = (typeof PERMIT_SOURCE_VALUES)[number];

// ============================================
// Helper Schemas
// ============================================

/**
 * Group Tool Policy Schema
 * Defines allow/deny lists for tool usage
 */
const GroupToolPolicySchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

/**
 * Group Tool Policy By Sender Schema
 * Defines tool policies scoped to specific senders
 */
const GroupToolPolicyBySenderSchema = z.record(
  z.string(),
  z.object({
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
);

/**
 * Group Permissions Schema
 * Per-group configuration for tool access and message policies
 */
const GroupPermissionsSchema = z.object({
  creator: z.string(),
  group: z.string(),
  groupPolicy: z.enum(GROUP_POLICY_VALUES).optional(),
  requireMention: z.boolean().optional(),
  allowFrom: z.array(z.string()).optional(),
  tools: GroupToolPolicySchema.optional(),
  toolsBySender: GroupToolPolicyBySenderSchema.optional(),
});

// ============================================
// ZTM Chat Configuration Schema
// ============================================
/**
 * ZTM Chat Configuration Schema
 * Main configuration for the ZTM Chat plugin
 *
 * Note: Fields with defaults are marked as optional to match TypeBox behavior.
 * Default values are applied via .parse() with zod-default-data plugin or manually.
 */
const ztmChatConfigSchemaInner = z.object({
  agentUrl: z
    .string({
      required_error: 'Agent URL is required',
    })
    .url('Agent URL must be a valid URL')
    .describe('ZTM Agent HTTP endpoint URL for mesh communication'),

  permitUrl: z
    .string()
    .url('Permit Server URL must be a valid URL')
    .describe('Permit server URL for mesh authentication and authorization')
    .optional(),

  permitSource: z
    .enum(PERMIT_SOURCE_VALUES, {
      required_error: 'Permit source is required',
    })
    .describe("How to obtain permit.json: 'server' from permit server, or 'file' from local file"),

  permitFilePath: z
    .string()
    .describe("Path to permit.json file when permitSource is 'file'")
    .optional(),

  meshName: z
    .string({
      required_error: 'Mesh name is required',
    })
    .min(1, 'Mesh name must be at least 1 character')
    .max(64, 'Mesh name must be at most 64 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Mesh name must contain only alphanumeric characters, hyphens, and underscores'
    )
    .describe('Unique identifier for the ZTM mesh network'),

  username: z
    .string({
      required_error: 'Bot username is required',
    })
    .min(1, 'Bot username must be at least 1 character')
    .max(64, 'Bot username must be at most 64 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Bot username must contain only alphanumeric characters, hyphens, and underscores'
    )
    .describe('Bot identifier used when communicating on the mesh'),

  enableGroups: z
    .boolean({
      invalid_type_error: 'Enable groups must be a boolean',
    })
    .optional()
    .describe('Enable group messaging features (requires ZTM groups support)'),

  dmPolicy: z
    .enum(DM_POLICY_VALUES)
    .optional()
    .describe(
      'Control who can send direct messages: allow all, deny all, or require pairing approval'
    ),

  allowFrom: z
    .array(z.string())
    .describe('List of allowed sender usernames')
    .optional()
    .describe('Whitelist of usernames allowed to send messages (empty = allow all paired users)'),

  apiTimeout: z
    .number({
      invalid_type_error: 'API timeout must be a number',
    })
    .int('API timeout must be an integer')
    .min(1000, 'API timeout must be at least 1000ms')
    .max(300000, 'API timeout must be at most 300000ms (5 minutes)')
    .optional()
    .describe('Timeout in milliseconds for ZTM API requests'),

  groupPolicy: z
    .enum(GROUP_POLICY_VALUES)
    .optional()
    .describe(
      'Default policy for group messages: open (allow all), disabled (block all), or allowlist (whitelist only)'
    ),

  requireMention: z
    .boolean({
      invalid_type_error: 'Require mention must be a boolean',
    })
    .optional()
    .describe('Require @mention to process group messages'),

  groupPermissions: z
    .record(z.string(), GroupPermissionsSchema)
    .describe('Per-group permissions configuration')
    .optional(),
});

// Base schema without refinements (for buildChannelConfigSchema)
export const ztmChatConfigBaseSchema = ztmChatConfigSchemaInner;

// Validation schema with refinements (for actual validation)
export const ztmChatConfigSchema = ztmChatConfigSchemaInner
  .refine(data => data.permitSource !== 'file' || !!data.permitFilePath, {
    message: "permitFilePath is required when permitSource is 'file'",
    path: ['permitFilePath'],
  })
  .refine(data => data.permitSource !== 'server' || !!data.permitUrl, {
    message: "permitUrl is required when permitSource is 'server'",
    path: ['permitUrl'],
  })
  .refine(data => !data.permitFilePath || !containsPathTraversal(data.permitFilePath), {
    message: 'permitFilePath contains path traversal patterns (../ or ..\\)',
    path: ['permitFilePath'],
  });

// ============================================
// Type Exports
// ============================================

/**
 * ZTM Chat configuration type inferred from schema
 */
export type ZTMChatConfig = z.infer<typeof ztmChatConfigSchema>;

/**
 * Extended config with allowFrom (for wizard output)
 */
export type ExtendedZTMChatConfig = ZTMChatConfig;

// ============================================
// Validation Types
// ============================================

export type ValidationErrorReason =
  | 'required'
  | 'invalid_format'
  | 'out_of_range'
  | 'type_mismatch';

// Single configuration validation error
export interface ConfigValidationError {
  field: string;
  reason: ValidationErrorReason;
  value: unknown;
  message: string;
}

// Validation result using Result pattern
export interface ZTMChatConfigValidation {
  valid: boolean;
  errors: ConfigValidationError[];
  config?: ZTMChatConfig;
}

// ============================================
// Schema Metadata (for UI hints)
// ============================================

/**
 * Schema metadata for UI generation
 * Preserves TypeBox-style metadata for form builders
 */
export const schemaMetadata = {
  agentUrl: {
    title: 'Agent URL',
    description: 'ZTM Agent HTTP endpoint URL for mesh communication',
    format: 'uri',
    examples: ['http://localhost:7777', 'https://agent.example.com:7777'],
  },
  permitUrl: {
    title: 'Permit Server URL',
    description: 'Permit server URL for mesh authentication and authorization',
    format: 'uri',
    examples: ['https://clawparty.flomesh.io:7779/permit'],
  },
  permitSource: {
    title: 'Permit Source',
    description:
      "How to obtain permit.json: 'server' from permit server, or 'file' from local file",
  },
  permitFilePath: {
    title: 'Permit File Path',
    description: "Path to permit.json file when permitSource is 'file'",
    examples: ['/home/user/ztm/permit.json', 'C:\\Users\\user\\ztm\\permit.json'],
  },
  meshName: {
    title: 'Mesh Name',
    description: 'Unique identifier for the ZTM mesh network',
    examples: ['my-mesh', 'production-mesh'],
  },
  username: {
    title: 'Bot Username',
    description: 'Bot identifier used when communicating on the mesh',
    examples: ['chatbot', 'assistant-bot'],
  },
  enableGroups: {
    title: 'Enable Group Chat',
    description: 'Enable group messaging features (requires ZTM groups support)',
  },
  dmPolicy: {
    title: 'Direct Message Policy',
    description:
      'Control who can send direct messages: allow all, deny all, or require pairing approval',
  },
  allowFrom: {
    title: 'Allowed Senders',
    description: 'Whitelist of usernames allowed to send messages (empty = allow all paired users)',
  },
  apiTimeout: {
    title: 'API Timeout (ms)',
    description: 'Timeout in milliseconds for ZTM API requests',
    examples: [5000, 30000, 60000],
  },
  groupPolicy: {
    title: 'Group Policy',
    description:
      'Default policy for group messages: open (allow all), disabled (block all), or allowlist (whitelist only)',
  },
  requireMention: {
    title: 'Require Mention',
    description: 'Require @mention to process group messages',
  },
  groupPermissions: {
    description: 'Per-group permissions configuration',
  },
} as const;

// ============================================
// Schema Accessor
// ============================================

/**
 * Get the ZTM Chat configuration schema
 * @returns The Zod schema for ZTMChatConfig
 */
export function getConfigSchema(): typeof ztmChatConfigSchema {
  return ztmChatConfigSchema;
}
