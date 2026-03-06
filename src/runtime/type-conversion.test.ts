/**
 * Structural compatibility tests for type conversions
 *
 * These tests verify that ZTMApiClient implements all methods required
 * by the DI interfaces. If interfaces diverge, these tests will fail.
 *
 * TDD Cycle: RED - Tests written first, implementation does not exist yet
 */

import { describe, it, expect } from 'vitest';
import { createZTMApiClient } from '../api/ztm-api.js';
import type { IChatReader, IChatSender, IDiscovery } from '../di/container.js';

describe('type-conversion: structural compatibility', () => {
  const testConfig = {
    agentUrl: 'http://test',
    permitUrl: 'http://permit',
    permitSource: 'server' as const,
    meshName: 'test',
    username: 'test',
    dmPolicy: 'allow' as const,
    enableGroups: false,
  };

  const client = createZTMApiClient(testConfig);

  // test-only: intentionally uses unsafe assertion to verify structural compatibility
  it('should have all IChatReader methods', () => {
    const reader: IChatReader = client as unknown as IChatReader;

    expect(typeof reader.getChats).toBe('function');
    expect(typeof reader.getPeerMessages).toBe('function');
    expect(typeof reader.getGroupMessages).toBe('function');
    expect(typeof reader.watchChanges).toBe('function');
  });

  // test-only: intentionally uses unsafe assertion to verify structural compatibility
  it('should have all IChatSender methods', () => {
    const sender: IChatSender = client as unknown as IChatSender;

    expect(typeof sender.sendPeerMessage).toBe('function');
    expect(typeof sender.sendGroupMessage).toBe('function');
  });

  // test-only: intentionally uses unsafe assertion to verify structural compatibility
  it('should have all IDiscovery methods', () => {
    const discovery: IDiscovery = client as unknown as IDiscovery;

    expect(typeof discovery.discoverUsers).toBe('function');
    expect(typeof discovery.getMeshInfo).toBe('function');
  });

  it('should have correct method signatures', () => {
    // Verify methods return Promises
    const reader: IChatReader = client as unknown as IChatReader;

    expect(reader.getChats()).toBeInstanceOf(Promise);
    expect(reader.getPeerMessages('test')).toBeInstanceOf(Promise);
  });

  // Test the conversion functions once implemented
  describe('conversion functions', () => {
    it('should convert ZTMApiClient to IChatReader', async () => {
      const { asChatReader } = await import('./type-conversion.js');
      const reader = asChatReader(client);

      expect(typeof reader.getChats).toBe('function');
      expect(reader.getChats()).toBeInstanceOf(Promise);
    });

    it('should convert ZTMApiClient to IChatSender', async () => {
      const { asChatSender } = await import('./type-conversion.js');
      const sender = asChatSender(client);

      expect(typeof sender.sendPeerMessage).toBe('function');
    });

    it('should convert ZTMApiClient to IDiscovery', async () => {
      const { asDiscovery } = await import('./type-conversion.js');
      const discovery = asDiscovery(client);

      expect(typeof discovery.discoverUsers).toBe('function');
      expect(typeof discovery.getMeshInfo).toBe('function');
    });
  });
});
