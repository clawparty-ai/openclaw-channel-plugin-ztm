// Unit tests for Format Utilities

import { describe, it, expect } from 'vitest';
import { formatTimestampToLocalTz } from './format.js';

describe('formatTimestampToLocalTz', () => {
  it('should return null for null input', () => {
    const result = formatTimestampToLocalTz(null);
    expect(result).toBeNull();
  });

  it('should return null for undefined input', () => {
    const result = formatTimestampToLocalTz(undefined);
    expect(result).toBeNull();
  });

  it('should format timestamp to local timezone string', () => {
    // Use a fixed timestamp: 2025-01-15 12:30:45.123 UTC
    const timestamp = 1736939445123;
    const result = formatTimestampToLocalTz(timestamp);

    expect(result).not.toBeNull();
    // Format varies by locale/environment: could be "CST", "GMT+8", "PST", etc.
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}\.\d{3} .+$/);
  });

  it('should include timezone information', () => {
    const timestamp = 1736939445123;
    const result = formatTimestampToLocalTz(timestamp);

    // Should include timezone offset or abbreviation
    expect(result).toMatch(/(GMT[+-]\d{1,2}|[A-Z]{3,4})$/);
  });

  it('should format zero timestamp', () => {
    // Unix epoch
    const result = formatTimestampToLocalTz(0);

    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });

  it('should handle future timestamps', () => {
    // Year 2030
    const timestamp = 1893456000000;
    const result = formatTimestampToLocalTz(timestamp);

    expect(result).not.toBeNull();
    expect(result).toContain('2030');
  });
});
