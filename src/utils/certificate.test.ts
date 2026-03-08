// Unit tests for Certificate Utilities

import { describe, it, expect } from 'vitest';
import { getCertificateExpiryDate, getCertificateExpiryStatus } from './certificate.js';

describe('getCertificateExpiryDate', () => {
  it('should return null for empty string', () => {
    const result = getCertificateExpiryDate('');
    expect(result).toBeNull();
  });

  it('should return null for invalid certificate format', () => {
    const result = getCertificateExpiryDate('not-a-certificate');
    expect(result).toBeNull();
  });

  it('should return null for null input', () => {
    const result = getCertificateExpiryDate(null as any);
    expect(result).toBeNull();
  });

  it('should return null for undefined input', () => {
    const result = getCertificateExpiryDate(undefined as any);
    expect(result).toBeNull();
  });

  it('should return null for certificate without proper header', () => {
    const result = getCertificateExpiryDate('BEGIN CERTIFICATE-----');
    expect(result).toBeNull();
  });
});

describe('getCertificateExpiryStatus', () => {
  it('should return null values for empty string', () => {
    const result = getCertificateExpiryStatus('');

    expect(result.expiryDate).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.isExpired).toBe(false);
  });

  it('should return null values for invalid certificate', () => {
    const result = getCertificateExpiryStatus('invalid-cert');

    expect(result.expiryDate).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.isExpired).toBe(false);
  });

  it('should return null values for null input', () => {
    const result = getCertificateExpiryStatus(null as any);

    expect(result.expiryDate).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.isExpired).toBe(false);
  });

  it('should return null values for undefined input', () => {
    const result = getCertificateExpiryStatus(undefined as any);

    expect(result.expiryDate).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.isExpired).toBe(false);
  });

  it('should return null values for malformed certificate', () => {
    const result = getCertificateExpiryStatus(
      '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'
    );

    expect(result.expiryDate).toBeNull();
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.isExpired).toBe(false);
  });
});
