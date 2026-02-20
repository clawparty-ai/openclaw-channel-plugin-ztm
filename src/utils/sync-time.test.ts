// Tests for message sync time utilities

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMessageSyncStart } from './sync-time.js';
import { INITIAL_SYNC_MAX_HISTORY_MS } from '../constants.js';

describe('getMessageSyncStart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return ~5 minutes ago when watermark is 0 (no prior state)', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const result = getMessageSyncStart(0);

    expect(result).toBe(now - INITIAL_SYNC_MAX_HISTORY_MS);
  });

  it('should return 0 if system time is less than 5 minutes from epoch', () => {
    // Simulate system time at 3 minutes after epoch
    const threeMinutes = 3 * 60 * 1000;
    vi.setSystemTime(threeMinutes);

    const result = getMessageSyncStart(0);

    // Should not return negative, should floor at 0
    expect(result).toBe(0);
  });

  it('should return existing watermark for incremental sync', () => {
    const existingWatermark = 1700000000000;
    const result = getMessageSyncStart(existingWatermark);

    expect(result).toBe(existingWatermark);
  });

  it('should handle very old watermark values', () => {
    const oldWatermark = 1000000000000; // ~2001
    const result = getMessageSyncStart(oldWatermark);

    expect(result).toBe(oldWatermark);
  });

  it('should handle future watermark gracefully', () => {
    const now = Date.now();
    const futureWatermark = now + 86400000; // 1 day in future

    const result = getMessageSyncStart(futureWatermark);

    expect(result).toBe(futureWatermark);
  });

  it('should treat negative watermark as normal value (edge case)', () => {
    // Negative watermark is unusual but should be treated as a valid value
    const negativeWatermark = -1000;
    const result = getMessageSyncStart(negativeWatermark);

    expect(result).toBe(negativeWatermark);
  });

  it('should have consistent 5 minute window', () => {
    const now = 1704067200000; // 2024-01-01 00:00:00 UTC
    vi.setSystemTime(now);

    const result = getMessageSyncStart(0);

    expect(result).toBe(now - 5 * 60 * 1000);
    expect(INITIAL_SYNC_MAX_HISTORY_MS).toBe(5 * 60 * 1000);
  });
});
