/**
 * Certificate Utilities
 * @module utils/certificate
 * Provides utilities for parsing X.509 certificates and checking expiry status
 *
 * Architecture: Two-stage operation for better separation of concerns
 * 1. parseCertificate() - Low-level certificate parsing (may fail)
 * 2. getExpiryStatus() - Business logic for already-parsed certificates
 * 3. getCertificateExpiryStatus() - Convenience function combining both stages
 */

import * as crypto from 'crypto';

// ============================================================================
// Stage 1: Certificate Parsing (Low-level operation)
// ============================================================================

/**
 * Parse PEM certificate string into X509Certificate object
 *
 * @param certificatePem - PEM format certificate string
 * @returns X509Certificate object or null if parsing fails
 *
 * @example
 * ```typescript
 * const cert = parseCertificate(pemString);
 * if (!cert) {
 *   // Handle parse error
 *   return;
 * }
 * const status = getExpiryStatus(cert);
 * ```
 */
export function parseCertificate(certificatePem: string): crypto.X509Certificate | null {
  try {
    return new crypto.X509Certificate(certificatePem);
  } catch {
    return null;
  }
}

// ============================================================================
// Stage 2: Expiry Status Check (Business logic for parsed certificates)
// ============================================================================

/**
 * Get expiry status for an already-parsed certificate
 *
 * This function operates on valid X509Certificate objects only.
 * Use parseCertificate() first if you have a PEM string.
 *
 * @param cert - Parsed X509Certificate object
 * @returns Object with expiryDate (timestamp), daysUntilExpiry, and isExpired
 *
 * @example
 * ```typescript
 * const cert = parseCertificate(pemString);
 * if (cert) {
 *   const status = getExpiryStatus(cert);
 *   console.log(`Expires in ${status.daysUntilExpiry} days`);
 * }
 * ```
 */
export function getExpiryStatus(cert: crypto.X509Certificate): {
  expiryDate: number;
  daysUntilExpiry: number;
  isExpired: boolean;
} {
  const expiryDate = new Date(cert.validTo);
  const now = Date.now();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now) / (24 * 60 * 60 * 1000));
  const isExpired = daysUntilExpiry < 0;

  return {
    expiryDate: expiryDate.getTime(),
    daysUntilExpiry,
    isExpired,
  };
}

// ============================================================================
// Convenience Function: Combines both stages
// ============================================================================

/**
 * Get certificate expiry status directly from PEM string
 *
 * This is a convenience function that combines parsing and expiry checking.
 * For better error handling, use parseCertificate() and getExpiryStatus() separately.
 *
 * @param certificatePem - PEM format certificate string
 * @returns Object with expiryDate, daysUntilExpiry, isExpired, and parseError flag
 *
 * @example
 * ```typescript
 * const status = getCertificateExpiryStatus(pemString);
 * if (status.parseError) {
 *   console.error('Failed to parse certificate');
 * } else if (status.isExpired) {
 *   console.error('Certificate has expired');
 * }
 * ```
 */
export function getCertificateExpiryStatus(certificatePem: string): {
  expiryDate: number | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  parseError: boolean;
} {
  const cert = parseCertificate(certificatePem);

  if (!cert) {
    // Return parseError flag to indicate parsing failure
    // isExpired defaults to false but should be ignored when parseError is true
    return { expiryDate: null, daysUntilExpiry: null, isExpired: false, parseError: true };
  }

  const status = getExpiryStatus(cert);
  return { ...status, parseError: false };
}
