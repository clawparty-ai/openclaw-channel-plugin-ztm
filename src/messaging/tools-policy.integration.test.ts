// Integration tests for Tools Policy
// Tests for DM tools policy, group tools policy with sender overrides, tool filtering

import { describe, it, expect, vi } from 'vitest';
import { checkDmPolicy } from '../core/dm-policy.js';
import {
  getGroupPermission,
  checkGroupPolicy,
  applyGroupToolsPolicy,
} from '../core/group-policy.js';
import { testConfig } from '../test-utils/fixtures.js';
import type { ZTMChatConfig } from '../types/config.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Tools Policy Integration', () => {
  describe('DM tools policy in message processing', () => {
    it('should apply default tools when no DM tools config specified', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'allow',
        // No dmTools config - should allow all tools
      };

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(true);
      expect(result.action).toBe('process');
    });

    it('should respect DM policy when applying tools', () => {
      const allowConfig: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'allow',
      };

      const denyConfig: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'deny',
      };

      // With allow policy
      const allowResult = checkDmPolicy('alice', allowConfig, []);
      expect(allowResult.allowed).toBe(true);

      // With deny policy (even with tools config, message is blocked)
      const denyResult = checkDmPolicy('alice', denyConfig, []);
      expect(denyResult.allowed).toBe(false);
    });

    it('should check allowFrom before applying tools', () => {
      const pairingConfig: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'pairing',
        allowFrom: ['bob'],
      };

      // Whitelisted user
      const allowedResult = checkDmPolicy('bob', pairingConfig, []);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.reason).toBe('whitelisted');

      // Non-whitelisted user
      const deniedResult = checkDmPolicy('alice', pairingConfig, []);
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.action).toBe('request_pairing');
    });

    it('should prioritize store allowFrom over config for tools access', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'pairing',
        allowFrom: [], // Empty config whitelist
      };

      const storeAllowFrom = ['alice', 'bob'];

      // User in store should be allowed
      const result = checkDmPolicy('alice', config, storeAllowFrom);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });
  });

  describe('group tools policy with sender overrides', () => {
    it('should apply group-level tools restrictions', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPolicy: 'open',
        groupPermissions: {
          'alice/dev-team': {
            creator: 'alice',
            group: 'dev-team',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              deny: ['fs', 'exec'],
            },
          },
        },
      };

      const perm = getGroupPermission('alice', 'dev-team', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec', 'ui'];

      const filtered = applyGroupToolsPolicy('bob', perm, allTools);

      expect(filtered).toEqual(['messaging', 'sessions', 'runtime', 'ui']);
      expect(filtered).not.toContain('fs');
      expect(filtered).not.toContain('exec');
    });

    it('should apply sender-specific tool overrides', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'alice/admins': {
            creator: 'alice',
            group: 'admins',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              deny: ['exec'],
            },
            toolsBySender: {
              admin: {
                alsoAllow: ['exec'],
              },
            },
          },
        },
      };

      const perm = getGroupPermission('alice', 'admins', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec', 'ui'];

      // Regular user - exec is denied
      const regularUserTools = applyGroupToolsPolicy('bob', perm, allTools);
      expect(regularUserTools).not.toContain('exec');

      // Admin - exec is allowed via override
      const adminTools = applyGroupToolsPolicy('admin', perm, allTools);
      expect(adminTools).toContain('exec');
    });

    it('should handle multiple sender-specific overrides', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'org/main': {
            creator: 'admin',
            group: 'main',
            groupPolicy: 'allowlist',
            requireMention: false,
            allowFrom: ['user1', 'user2', 'user3'],
            tools: {
              allow: ['messaging', 'sessions'],
            },
            toolsBySender: {
              user1: {
                alsoAllow: ['runtime'],
              },
              user2: {
                alsoAllow: ['fs', 'ui'],
              },
              user3: {
                deny: ['sessions'],
              },
            },
          },
        },
      };

      const perm = getGroupPermission('org', 'main', config);
      const baseTools = ['messaging', 'sessions', 'runtime', 'fs', 'ui', 'exec'];

      // user1: base allow + alsoAllow runtime
      const user1Tools = applyGroupToolsPolicy('user1', perm, baseTools);
      expect(user1Tools).toEqual(['messaging', 'sessions', 'runtime']);

      // user2: base allow + alsoAllow fs and ui
      const user2Tools = applyGroupToolsPolicy('user2', perm, baseTools);
      expect(user2Tools).toEqual(['messaging', 'sessions', 'fs', 'ui']);

      // user3: base allow minus denied sessions
      const user3Tools = applyGroupToolsPolicy('user3', perm, baseTools);
      expect(user3Tools).toEqual(['messaging']);
      expect(user3Tools).not.toContain('sessions');
    });

    it('should handle alsoAllow without group-level allow list', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'team/leads': {
            creator: 'team',
            group: 'leads',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              deny: ['exec'],
            },
            toolsBySender: {
              senior: {
                alsoAllow: ['exec'],
              },
            },
          },
        },
      };

      const perm = getGroupPermission('team', 'leads', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec', 'ui'];

      // Regular user - exec denied
      const regularTools = applyGroupToolsPolicy('junior', perm, allTools);
      expect(regularTools).not.toContain('exec');

      // Senior user - exec allowed via alsoAllow (removes from deny list)
      const seniorTools = applyGroupToolsPolicy('senior', perm, allTools);
      expect(seniorTools).toContain('exec');
    });
  });

  describe('tool filtering based on policy and whitelist', () => {
    it('should filter tools when no group config exists', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPolicy: 'open',
        groupPermissions: {},
      };

      const perm = getGroupPermission('unknown', 'unknown-group', config);
      const allTools = ['group:messaging', 'group:sessions', 'group:runtime', 'group:fs'];

      // Should use default permissions (group: prefix tools only)
      const filtered = applyGroupToolsPolicy('user', perm, allTools);

      // Default only allows group:messaging and group:sessions
      expect(filtered).toEqual(['group:messaging', 'group:sessions']);
    });

    it('should allow all tools when no restrictions specified', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'open/all': {
            creator: 'open',
            group: 'all',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            // No tools config - should allow all
          },
        },
      };

      const perm = getGroupPermission('open', 'all', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec', 'ui'];

      // When no tools config, returns all tools
      const filtered = applyGroupToolsPolicy('user', perm, allTools);

      expect(filtered).toEqual(allTools);
    });

    it('should combine allow list with deny list', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'corp/restricted': {
            creator: 'corp',
            group: 'restricted',
            groupPolicy: 'allowlist',
            requireMention: false,
            allowFrom: ['alice', 'bob'],
            tools: {
              allow: ['messaging', 'sessions', 'runtime'],
              deny: ['sessions'],
            },
          },
        },
      };

      const perm = getGroupPermission('corp', 'restricted', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec'];

      const filtered = applyGroupToolsPolicy('alice', perm, allTools);

      // Allow list is applied first, then deny list removes from result
      expect(filtered).toContain('messaging');
      expect(filtered).toContain('runtime');
      expect(filtered).not.toContain('sessions'); // Removed by deny
      expect(filtered).not.toContain('fs'); // Not in allow list
      expect(filtered).not.toContain('exec'); // Not in allow list
    });
  });

  describe('tools policy with group message check', () => {
    it('should integrate tools policy with group policy check', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        username: 'chatbot',
        enableGroups: true,
        groupPermissions: {
          'team/devs': {
            creator: 'team',
            group: 'devs',
            groupPolicy: 'allowlist',
            requireMention: true,
            allowFrom: ['alice', 'bob'],
            tools: {
              deny: ['exec'],
            },
          },
        },
      };

      const perm = getGroupPermission('team', 'devs', config);

      // Check if message is allowed by group policy
      const policyCheck = checkGroupPolicy('alice', '@chatbot help', perm, 'chatbot');
      expect(policyCheck.allowed).toBe(true);
      expect(policyCheck.reason).toBe('whitelisted');
      expect(policyCheck.wasMentioned).toBe(true);

      // Now apply tools policy
      const allTools = ['messaging', 'sessions', 'runtime', 'exec', 'fs'];
      const filteredTools = applyGroupToolsPolicy('alice', perm, allTools);

      expect(filteredTools).not.toContain('exec');
    });

    it('should allow creator to bypass group policy but still apply tools', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        username: 'chatbot',
        enableGroups: true,
        groupPermissions: {
          'alice/private': {
            creator: 'alice',
            group: 'private',
            groupPolicy: 'disabled',
            requireMention: true,
            allowFrom: [],
            tools: {
              deny: ['fs'],
            },
          },
        },
      };

      const perm = getGroupPermission('alice', 'private', config);

      // Creator must still mention the bot when requireMention is true
      const policyCheck = checkGroupPolicy('alice', '@chatbot help', perm, 'chatbot');
      expect(policyCheck.allowed).toBe(true);
      expect(policyCheck.reason).toBe('creator');

      // Now apply tools policy
      const allTools = ['messaging', 'sessions', 'runtime', 'exec', 'fs'];
      const filteredTools = applyGroupToolsPolicy('alice', perm, allTools);

      // Tools denial applies even to creator
      expect(filteredTools).not.toContain('fs');
    });
  });

  describe('complex tools policy scenarios', () => {
    it('should handle nested policy overrides', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'org/developers': {
            creator: 'org',
            group: 'developers',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              allow: ['messaging', 'sessions', 'runtime', 'fs'],
              deny: ['exec'],
            },
            toolsBySender: {
              lead: {
                alsoAllow: ['exec'],
                deny: ['fs'],
              },
              intern: {
                deny: ['runtime', 'fs'],
              },
            },
          },
        },
      };

      const perm = getGroupPermission('org', 'developers', config);
      const allTools = ['messaging', 'sessions', 'runtime', 'fs', 'exec', 'ui'];

      // Lead: alsoAllow adds to allow list, but deny removes from result
      // lead's alsoAllow: ['exec'] adds to allow
      // lead's deny: ['fs'] adds to deny
      const leadTools = applyGroupToolsPolicy('lead', perm, allTools);
      // Note: lead's alsoAllow is merged into effectiveAllow
      // but lead's deny is also merged into effectiveDeny
      // So exec is in allow (via alsoAllow) but also in deny (via lead's deny + group deny)
      // Actually, the deny list includes both group deny ('exec') and lead's deny ('fs')
      // So exec is removed by deny, even though it was added via alsoAllow
      expect(leadTools).not.toContain('exec'); // Denied by group deny
      expect(leadTools).not.toContain('fs'); // Denied by lead deny
      expect(leadTools).toContain('messaging');

      // Intern: base allow minus runtime and fs
      const internTools = applyGroupToolsPolicy('intern', perm, allTools);
      expect(internTools).not.toContain('runtime');
      expect(internTools).not.toContain('fs');
      expect(internTools).toContain('messaging');

      // Regular user: base policy only
      const regularTools = applyGroupToolsPolicy('user', perm, allTools);
      expect(regularTools).not.toContain('exec');
      expect(regularTools).toContain('fs');
      expect(regularTools).not.toContain('ui'); // Not in allow list
    });

    it('should handle empty tools config gracefully', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'test/empty': {
            creator: 'test',
            group: 'empty',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {},
            toolsBySender: {},
          },
        },
      };

      const perm = getGroupPermission('test', 'empty', config);
      const allTools = ['tool1', 'tool2', 'tool3'];

      // Empty tools config means no restrictions
      const filtered = applyGroupToolsPolicy('user', perm, allTools);
      expect(filtered).toEqual(allTools);
    });

    it('should handle tools policy with channel defaults', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPolicy: 'open',
        requireMention: false,
        groupPermissions: {
          'specific/group': {
            creator: 'specific',
            group: 'group',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              deny: ['dangerous'],
            },
          },
        },
      };

      // Unknown group uses default permissions
      const unknownPerm = getGroupPermission('unknown', 'unknown', config);
      const allTools = ['group:messaging', 'group:sessions', 'group:runtime', 'dangerous'];

      // Channel defaults apply (open policy, default group tools)
      expect(unknownPerm.groupPolicy).toBe('open');
      expect(unknownPerm.requireMention).toBe(false);

      const unknownTools = applyGroupToolsPolicy('user', unknownPerm, allTools);
      // Default permissions only allow group:messaging and group:sessions
      expect(unknownTools).toEqual(['group:messaging', 'group:sessions']);
      expect(unknownTools).not.toContain('group:runtime');
      expect(unknownTools).not.toContain('dangerous');

      // Specific group has deny restriction
      const specificPerm = getGroupPermission('specific', 'group', config);
      const specificTools = applyGroupToolsPolicy('user', specificPerm, allTools);
      expect(specificTools).not.toContain('dangerous');
    });
  });

  describe('tools policy edge cases', () => {
    it('should handle duplicate tools in allow list', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'test/group': {
            creator: 'test',
            group: 'group',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              allow: ['tool1', 'tool2', 'tool1', 'tool2'], // Duplicates
            },
          },
        },
      };

      const perm = getGroupPermission('test', 'group', config);
      const allTools = ['tool1', 'tool2', 'tool3'];

      const filtered = applyGroupToolsPolicy('user', perm, allTools);

      // Should deduplicate
      expect(filtered).toEqual(['tool1', 'tool2']);
    });

    it('should handle tools that appear in both allow and deny', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'conflict/test': {
            creator: 'conflict',
            group: 'test',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              allow: ['tool1', 'tool2'],
              deny: ['tool2', 'tool3'],
            },
          },
        },
      };

      const perm = getGroupPermission('conflict', 'test', config);
      const allTools = ['tool1', 'tool2', 'tool3', 'tool4'];

      const filtered = applyGroupToolsPolicy('user', perm, allTools);

      // Deny should take precedence over allow
      expect(filtered).toContain('tool1');
      expect(filtered).not.toContain('tool2'); // In deny, takes precedence
      expect(filtered).not.toContain('tool3'); // In deny
      expect(filtered).not.toContain('tool4'); // Not in allow
    });

    it('should handle empty tools list', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'empty/test': {
            creator: 'empty',
            group: 'test',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              allow: [],
              deny: ['tool1', 'tool2'], // Must use deny to restrict tools
            },
          },
        },
      };

      const perm = getGroupPermission('empty', 'test', config);
      const allTools = ['tool1', 'tool2', 'tool3'];

      const filtered = applyGroupToolsPolicy('user', perm, allTools);

      // Empty allow list with deny means only non-denied tools allowed
      expect(filtered).toEqual(['tool3']);
    });

    it('should handle sender with no specific overrides', () => {
      const config: ZTMChatConfig = {
        ...testConfig,
        enableGroups: true,
        groupPermissions: {
          'overrides/test': {
            creator: 'overrides',
            group: 'test',
            groupPolicy: 'open',
            requireMention: false,
            allowFrom: [],
            tools: {
              deny: ['exec'],
            },
            toolsBySender: {
              admin: {
                alsoAllow: ['exec'],
              },
            },
          },
        },
      };

      const perm = getGroupPermission('overrides', 'test', config);
      const allTools = ['messaging', 'exec', 'ui'];

      // User without override - should apply group-level deny
      const userTools = applyGroupToolsPolicy('regularuser', perm, allTools);
      expect(userTools).not.toContain('exec');

      // Admin with override
      const adminTools = applyGroupToolsPolicy('admin', perm, allTools);
      expect(adminTools).toContain('exec');
    });
  });
});
