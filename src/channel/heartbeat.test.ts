/**
 * Heartbeat Adapter Tests
 * @module channel/heartbeat.test
 */

import { describe, it, expect } from 'vitest';

describe('ztmChatHeartbeatAdapter', () => {
  describe('checkReady', () => {
    it('should export checkReady function', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      expect(typeof ztmChatHeartbeatAdapter.checkReady).toBe('function');
    });

    it('should return ok false when not configured', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      // Either "not configured" or container error is acceptable
      expect(result.reason).toMatch(/not configured|unreachable/);
    });
  });

  describe('resolveRecipients', () => {
    it('should export resolveRecipients function', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      expect(typeof ztmChatHeartbeatAdapter.resolveRecipients).toBe('function');
    });

    it('should return explicit recipient when to is provided', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = ztmChatHeartbeatAdapter.resolveRecipients!({
        cfg: {},
        opts: { to: 'test-user' },
      });

      expect(result.recipients).toContain('test-user');
      expect(result.source).toBe('explicit');
    });

    it('should return empty when all is true but no peers', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = ztmChatHeartbeatAdapter.resolveRecipients!({
        cfg: {},
        opts: { all: true },
      });

      expect(result.recipients).toEqual([]);
      expect(result.source).toBe('mesh');
    });
  });
});
