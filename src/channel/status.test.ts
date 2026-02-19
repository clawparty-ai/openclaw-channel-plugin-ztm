// Unit tests for status operations

import { describe, it, expect } from 'vitest';
import { buildChannelSummary, getDefaultStatus, type ChannelAccountSnapshot } from './status.js';

describe('status', () => {
  describe('buildChannelSummary', () => {
    it('should build summary from snapshot with all fields', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        configured: true,
        running: true,
        meshConnected: true,
        peerCount: 5,
        lastStartAt: 1704108000000,
        lastStopAt: 1704104400000,
        lastError: null,
        lastInboundAt: 1704107700000,
        lastOutboundAt: 1704107880000,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.configured).toBe(true);
      expect(result.running).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.peerCount).toBe(5);
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
      expect(result.connected).toBe(false);
      expect(result.peerCount).toBe(0);
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
        meshConnected: false,
        peerCount: 0,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.connected).toBe(false);
    });

    it('should handle missing meshConnected field', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        running: true,
      };

      const result = buildChannelSummary({ snapshot });

      expect(result.connected).toBe(false);
    });

    it('should handle lastError being a string', () => {
      const snapshot: ChannelAccountSnapshot = {
        accountId: 'test-account',
        lastError: 'Connection failed',
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

  describe('getDefaultStatus', () => {
    it('should return default status with all default values', () => {
      const result = getDefaultStatus();

      expect(result.accountId).toBe('default');
      expect(result.running).toBe(false);
      expect(result.connected).toBe(false);
      expect(result.meshConnected).toBe(false);
      expect(result.lastStartAt).toBeNull();
      expect(result.lastStopAt).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.lastInboundAt).toBeNull();
      expect(result.lastOutboundAt).toBeNull();
      expect(result.peerCount).toBe(0);
    });

    it('should return consistent default status', () => {
      const result1 = getDefaultStatus();
      const result2 = getDefaultStatus();

      expect(result1).toEqual(result2);
    });

    it('should return object with expected shape', () => {
      const result = getDefaultStatus();

      expect(result).toHaveProperty('accountId');
      expect(result).toHaveProperty('running');
      expect(result).toHaveProperty('connected');
      expect(result).toHaveProperty('meshConnected');
      expect(result).toHaveProperty('lastStartAt');
      expect(result).toHaveProperty('lastStopAt');
      expect(result).toHaveProperty('lastError');
      expect(result).toHaveProperty('lastInboundAt');
      expect(result).toHaveProperty('lastOutboundAt');
      expect(result).toHaveProperty('peerCount');
    });
  });
});
