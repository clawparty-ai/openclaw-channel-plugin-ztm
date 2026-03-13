/**
 * Time Formatting Utilities
 * @module utils/format
 * Provides utilities for formatting timestamps in local timezone
 */

/**
 * Format timestamp to local timezone with three-letter abbreviation
 * @param ts - Unix timestamp in milliseconds
 * @returns Formatted string like "2025-01-01 00:00:00.000 CST" or null if input is null/undefined
 *
 * @example
 * ```typescript
 * const formatted = formatTimestampToLocalTz(Date.now());
 * // Returns: "2026-03-13 08:30:00.000 CST"
 * ```
 */
export function formatTimestampToLocalTz(ts: number | null | undefined): string | null {
  if (ts === null || ts === undefined) return null;
  const date = new Date(ts);
  const tzStr =
    new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
    })
      .format(date)
      .split(' ')
      .pop() || 'UTC';

  return (
    date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    }) +
    ' ' +
    tzStr
  );
}
