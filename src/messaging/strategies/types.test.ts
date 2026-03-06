/**
 * Type Safety Tests for Message Processing Strategy Types
 * @module messaging/strategies/types.test
 *
 * These tests verify that the type system correctly enforces type safety.
 * @ts-expect-error comments verify TypeScript catches type violations at compile time.
 */

import { describe, it, expect } from 'vitest';
import type {
  BaseProcessingContext,
  PeerProcessingContext,
  GroupProcessingContext,
  ProcessingContext,
} from './types.js';

describe('Type Safety Tests', () => {
  // Shared mock state for tests
  const mockState = {
    accountId: 'test-account',
    config: { username: 'test-bot' },
  } as unknown as BaseProcessingContext['state'];

  describe('PeerProcessingContext', () => {
    it('should accept valid peer context', () => {
      const ctx: PeerProcessingContext = {
        state: mockState,
        storeAllowFrom: [],
      };
      expect(ctx).toBeDefined();
    });

    it('should accept context with storeAllowFrom', () => {
      const ctx: PeerProcessingContext = {
        state: mockState,
        storeAllowFrom: ['alice', 'bob'],
      };
      expect(ctx.storeAllowFrom).toEqual(['alice', 'bob']);
    });

    it('should not allow groupInfo field', () => {
      const ctx: PeerProcessingContext = {
        state: mockState,
        storeAllowFrom: [],
      };
      // groupInfo should not exist on peer context
      expect((ctx as unknown as { groupInfo?: unknown }).groupInfo).toBeUndefined();
    });
  });

  describe('GroupProcessingContext', () => {
    it('should accept valid group context', () => {
      const ctx: GroupProcessingContext = {
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'test-group' },
      };
      expect(ctx.groupInfo.group).toBe('test-group');
    });

    it('should accept optional groupName', () => {
      const ctx: GroupProcessingContext = {
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'test-group' },
        groupName: 'Test Group',
      };
      expect(ctx.groupName).toBe('Test Group');
    });

    it('should allow undefined groupName (optional)', () => {
      const ctx: GroupProcessingContext = {
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'test-group' },
      };
      expect(ctx.groupName).toBeUndefined();
    });
  });

  describe('ProcessingContext (discriminated union)', () => {
    it('should allow peer context with type discriminator', () => {
      const peerCtx: ProcessingContext = {
        type: 'peer',
        state: mockState,
        storeAllowFrom: [],
      };
      expect(peerCtx.type).toBe('peer');
    });

    it('should allow group context with type discriminator', () => {
      const groupCtx: ProcessingContext = {
        type: 'group',
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'test-group' },
      };
      expect(groupCtx.type).toBe('group');
      expect(groupCtx.groupInfo).toBeDefined();
    });

    it('should narrow to PeerProcessingContext when type="peer"', () => {
      const ctx: ProcessingContext = {
        type: 'peer',
        state: mockState,
        storeAllowFrom: [],
      };

      if (ctx.type === 'peer') {
        // TypeScript knows this is PeerProcessingContext
        expect(ctx.storeAllowFrom).toBeDefined();
      }
    });

    it('should narrow to GroupProcessingContext when type="group"', () => {
      const ctx: ProcessingContext = {
        type: 'group',
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'test-group' },
      };

      if (ctx.type === 'group') {
        // TypeScript knows this is GroupProcessingContext
        expect(ctx.groupInfo.group).toBe('test-group');
        expect(ctx.groupName).toBeUndefined(); // optional
      }
    });

    it('should have type property on both variants', () => {
      const peerCtx: ProcessingContext = {
        type: 'peer',
        state: mockState,
        storeAllowFrom: [],
      };
      const groupCtx: ProcessingContext = {
        type: 'group',
        state: mockState,
        storeAllowFrom: [],
        groupInfo: { creator: 'alice', group: 'g1' },
      };

      expect(peerCtx.type).toBe('peer');
      expect(groupCtx.type).toBe('group');
    });
  });
});

// Compile-time type safety verification tests
// These use @ts-expect-error to verify TypeScript catches errors at compile time
// The actual runtime values don't matter - we're verifying the type system

describe('Compile-time type safety (ts-expect-error)', () => {
  const mockState = {
    accountId: 'test-account',
    config: { username: 'test-bot' },
  } as unknown as BaseProcessingContext['state'];

  // This test verifies that TypeScript correctly requires groupInfo
  // If you remove @ts-expect-error, TypeScript will show an error
  it('requires groupInfo for GroupProcessingContext', () => {
    // @ts-expect-error - groupInfo is required
    const invalidCtx: GroupProcessingContext = {
      state: mockState,
      storeAllowFrom: [],
    };
    // At runtime, the object exists (TypeScript only catches this at compile time)
    // The important thing is the @ts-expect-error comment suppresses the compile error
    expect(invalidCtx).toBeDefined();
  });
});
