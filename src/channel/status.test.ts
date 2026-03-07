// Unit tests for status operations

import { describe, it, expect } from 'vitest';
import { buildChannelSummary, defaultRuntime, type ChannelAccountSnapshot } from './status.js';

describe('status', () => {
  describe('buildChannelSummary', () => {
    it('should build summary from snapshot with all fields', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        configured: true,
        running: true,
        lastStartAt: 1704108000000,
        lastStopAt: 1704104400000,
        lastError: null,
        lastInboundAt: 1704107700000,
        lastOutboundAt: 1704107880000,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.configured).toBe(true);
      expect(result.running).toBe(true);
      expect(result.lastStartAt).toEqual(1704108000000);
      expect(result.lastStopAt).toEqual(1704104400000);
      expect(result.lastError).toBeNull();
      expect(result.lastInboundAt).toEqual(1704107700000);
      expect(result.lastOutboundAt).toEqual(1704107880000);
    });

    it('should use default values for missing optional fields', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.configured).toBe(false);
      expect(result.running).toBe(false);
      expect(result.lastStartAt).toBeNull();
      expect(result.lastStopAt).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.lastInboundAt).toBeNull();
      expect(result.lastOutboundAt).toBeNull();
    });

    it('should handle meshConnected false', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        running: true,
      };

      const result = buildChannelSummary({ snapshot });
    });

    it('should handle missing meshConnected field', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        running: true,
      };

      const result = buildChannelSummary({ snapshot });
    });

    it('should handle lastError being a string', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        lastError: 'Connection failed',
        running: false,
        configured: true,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.lastError).toBe('Connection failed');
    });

    it('should handle lastError being null', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        lastError: null,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.lastError).toBeNull();
    });

    it('should map running to running field', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        running: true,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.running).toBe(true);
    });

    it('should map configured to configured field', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        configured: true,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.configured).toBe(true);
    });
  });

  describe('defaultRuntime', () => {
    it('should have default status with all default values', () => {
      expect(defaultRuntime.accountId).toBe('default');
      expect(defaultRuntime.running).toBe(false);
      expect(defaultRuntime.lastStartAt).toBeNull();
      expect(defaultRuntime.lastStopAt).toBeNull();
      expect(defaultRuntime.lastError).toBeNull();
      expect(defaultRuntime.lastInboundAt).toBeNull();
      expect(defaultRuntime.lastOutboundAt).toBeNull();
    });

    it('should be a consistent singleton', () => {
      expect(defaultRuntime).toBe(defaultRuntime);
    });

    it('should have object with expected shape', () => {
      expect(defaultRuntime).toHaveProperty('accountId');
      expect(defaultRuntime).toHaveProperty('running');
      expect(defaultRuntime).toHaveProperty('lastStartAt');
      expect(defaultRuntime).toHaveProperty('lastStopAt');
      expect(defaultRuntime).toHaveProperty('lastError');
      expect(defaultRuntime).toHaveProperty('lastInboundAt');
      expect(defaultRuntime).toHaveProperty('lastOutboundAt');
    });
  });
});
