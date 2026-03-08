/**
 * Certificate Utilities
 * @module utils/certificate
 * Provides utilities for parsing X.509 certificates
 */

import * as crypto from 'crypto';

/**
 * Extract certificate expiration date from PEM certificate
 * Uses crypto.X509Certificate (Node.js 18+)
 * @param certificatePem - PEM format certificate string
 * @returns Expiration Date or null if parsing fails
 */
export function getCertificateExpiryDate(certificatePem: string): Date | null {
  try {
    // Use X509Certificate for modern Node.js (18+)
    // Note: validToDate is Node.js v23+ only, use validTo string instead
    const cert = new crypto.X509Certificate(certificatePem);
    return new Date(cert.validTo);
  } catch {
    return null;
  }
}

/**
 * Get certificate expiry status
 * @param certificatePem - PEM format certificate string
 * @returns Object with expiryDate (timestamp), daysUntilExpiry, and isExpired
 */
export function getCertificateExpiryStatus(certificatePem: string): {
  expiryDate: number | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
} {
  const expiryDate = getCertificateExpiryDate(certificatePem);
  if (!expiryDate) {
    return { expiryDate: null, daysUntilExpiry: null, isExpired: false };
  }

  const now = Date.now();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now) / (24 * 60 * 60 * 1000));
  const isExpired = daysUntilExpiry < 0;

  return {
    expiryDate: expiryDate.getTime(),
    daysUntilExpiry,
    isExpired,
  };
}
