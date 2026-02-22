/**
 * @fileoverview Message sync time utilities
 * @module utils/sync-time
 *
 * Handles initial sync logic for first install or missing state scenarios.
 * Calculates the appropriate watermark for message synchronization.
 *
 * Key logic:
 * - When watermark is 0 (first install/state deleted/new peer): limit to recent messages
 * - When watermark > 0 (normal operation): use stored watermark for incremental sync
 *
 * @example
 * import { getMessageSyncStart } from './utils/sync-time.js';
 *
 * // First install or new peer
 * const startTime = getMessageSyncStart(0);
 * // Returns: Math.max(0, Date.now() - INITIAL_SYNC_MAX_HISTORY_MS)
 *
 * // Normal incremental sync
 * const startTime = getMessageSyncStart(1700000000000);
 * // Returns: 1700000000000 (the stored watermark)
 */

// Message sync time utilities

import { INITIAL_SYNC_MAX_HISTORY_MS } from '../constants.js';

/**
 * Calculate the sync start time based on watermark value.
 *
 * When watermark is 0 (no prior state - first install, state file deleted,
 * or new peer/group), limits historical messages to avoid processing
 * large backlogs. Returns the later of:
 * - (current time - INITIAL_SYNC_MAX_HISTORY_MS)
 * - 0 (safety floor)
 *
 * When watermark > 0 (normal operation), returns the watermark for
 * incremental sync.
 *
 * @param watermark - The stored watermark (0 if no prior state)
 * @returns The timestamp to use as 'since' parameter for message fetching
 */
export function getMessageSyncStart(watermark: number): number {
  // watermark === 0 means: first install, state deleted, or new peer/group
  if (watermark === 0) {
    // Limit to recent messages to avoid processing large historical backlogs
    return Math.max(0, Date.now() - INITIAL_SYNC_MAX_HISTORY_MS);
  }

  // Normal incremental sync - use stored watermark
  return watermark;
}
