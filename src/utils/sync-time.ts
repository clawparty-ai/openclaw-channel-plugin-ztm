// Message sync time utilities
// Handles initial sync logic for first install or missing state scenarios

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
