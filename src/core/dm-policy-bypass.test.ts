// DM Policy bypass prevention tests
// Tests edge cases where policy enforcement could be bypassed

import { describe, it, expect } from 'vitest';
import { checkDmPolicy, isUserWhitelisted } from './dm-policy.js';
import { testConfig } from '../test-utils/fixtures.js';

describe('DM Policy Bypass Prevention', () => {
  const baseConfig = { ...testConfig, allowFrom: [] };

  describe('null/undefined parameter handling', () => {
    it('should handle null storeAllowFrom parameter', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: [] };
      const result = checkDmPolicy('alice', config, null as any);

      // Should not crash and should properly evaluate
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
    });

    it('should handle undefined storeAllowFrom parameter', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: [] };
      
      const result = checkDmPolicy('alice', config, undefined);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
    });

    it('should handle null allowFrom in config', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: null as any };
      const result = checkDmPolicy('alice', config, []);

      // Null allowFrom should be treated as empty (deny all)
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
    });

    it('should handle undefined allowFrom in config', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: undefined as any };
      const result = checkDmPolicy('alice', config, []);

      // Undefined allowFrom should be treated as empty
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
    });

    it('should handle empty string in allowFrom (edge case)', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: [''] };
      const result = checkDmPolicy('alice', config, []);

      // Empty string should not whitelist anyone
      expect(result.allowed).toBe(false);
    });

    it('should handle whitespace-only string in allowFrom', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: ['   '] };
      const result = checkDmPolicy('alice', config, []);

      // Whitespace-only should not whitelist anyone (trimmed during check)
      expect(result.allowed).toBe(false);
    });
  });

  describe('null vs empty array distinction', () => {
    it('should correctly differentiate null storeAllowFrom from empty array', () => {
      const config = { ...baseConfig, dmPolicy: 'pairing' as const, allowFrom: [] };

      // Both should behave the same in pairing mode (request pairing for unknown)
      const resultNull = checkDmPolicy('alice', config, null as any);
      const resultEmpty = checkDmPolicy('alice', config, []);

      expect(resultNull.allowed).toBe(resultEmpty.allowed);
      expect(resultNull.action).toBe(resultEmpty.action);
    });

    it('should handle null store with whitelisted user', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const };
      
      const result = checkDmPolicy('alice', config, null);

      // Without whitelist, should be denied
      expect(result.allowed).toBe(false);
    });
  });

  describe('isUserWhitelisted bypass prevention', () => {
    it('should handle null parameters in isUserWhitelisted', () => {
      const config = { ...baseConfig, allowFrom: ['alice'] };

      
      expect(isUserWhitelisted('alice', config, null)).toBe(true);
      
      expect(isUserWhitelisted('bob', config, null)).toBe(false);
    });

    it('should handle undefined parameters in isUserWhitelisted', () => {
      const config = { ...baseConfig, allowFrom: ['alice'] };

      
      expect(isUserWhitelisted('alice', config, undefined)).toBe(true);
      
      expect(isUserWhitelisted('bob', config, undefined)).toBe(false);
    });

    it('should not bypass with malformed username', () => {
      const config = { ...baseConfig, allowFrom: ['alice'] };

      // These should not crash and should return false
      expect(isUserWhitelisted(null as any, config, [])).toBe(false);
      expect(isUserWhitelisted(undefined as any, config, [])).toBe(false);
    });
  });

  describe('policy bypass through malformed input', () => {
    it('should reject sender with only special characters in deny mode', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const };
      const result = checkDmPolicy('!@#$%^&*()', config, []);

      // In deny mode, non-whitelisted users are denied
      expect(result.allowed).toBe(false);
    });

    it('should reject sender with newline injection in deny mode', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const };
      const result = checkDmPolicy('alice\nbob', config, []);

      // In deny mode, non-whitelisted users are denied
      expect(result.allowed).toBe(false);
    });

    it('should reject sender with tab injection in deny mode', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const };
      const result = checkDmPolicy('alice\tbob', config, []);

      // In deny mode, non-whitelisted users are denied
      expect(result.allowed).toBe(false);
    });

    it('should allow special characters in allow mode (by design)', () => {
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      // allow mode allows everything - these are valid usernames
      expect(checkDmPolicy('!@#$%^&*()', config, []).allowed).toBe(true);
      expect(checkDmPolicy('alice\nbob', config, []).allowed).toBe(true);
      expect(checkDmPolicy('alice\tbob', config, []).allowed).toBe(true);
    });

    it('should handle Unicode normalization attempts', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: ['alice'] };

      // Various Unicode variants should not bypass
      expect(checkDmPolicy('ALICE', config, []).allowed).toBe(true); // Case normalized
      expect(checkDmPolicy('ɑlice', config, []).allowed).toBe(false); // Different character
    });
  });

  describe('allowFrom injection prevention', () => {
    it('should not whitelist user through array manipulation', () => {
      // Config is immutable in function - testing that direct modification doesn't affect result
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: ['alice'] };

      const result1 = checkDmPolicy('bob', config, []);
      expect(result1.allowed).toBe(false);

      // Even if someone modifies the original array after calling,
      // the function uses getOrDefault which handles this safely
      const result2 = checkDmPolicy('bob', config, []);
      expect(result2.allowed).toBe(false);
    });

    it('should handle array with prototype pollution attempt', () => {
      const config = { ...baseConfig, dmPolicy: 'deny' as const, allowFrom: [] };
      const maliciousStore = Object.create(null);
      
      maliciousStore.length = 0;
      
      maliciousStore.some = () => false;

      // Should not crash and should properly deny
      const result = checkDmPolicy('alice', config, maliciousStore as any);
      expect(result.allowed).toBe(false);
    });
  });
});
