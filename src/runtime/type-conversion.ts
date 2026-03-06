/**
 * Type-safe conversion functions for ZTMApiClient to DI interfaces
 *
 * WHY: ZTMApiClient uses specific error types (ZTMReadError, ZTMSendError)
 * while DI interfaces use generic Error. Due to Promise invariance, TypeScript
 * cannot verify compatibility at compile time.
 *
 * INVARIANT: The conversion is safe because:
 * - ZTMApiClient implements all required methods (structural typing)
 * - Method signatures are compatible at runtime (only error type differs)
 * - Structural compatibility is verified by tests in type-conversion.test.ts
 *
 * @module runtime/type-conversion
 */

import type { IChatReader, IChatSender, IDiscovery } from '../di/container.js';
import type { ZTMApiClient } from '../types/api.js';

/**
 * Convert ZTMApiClient to IChatReader interface
 *
 * The type assertion is safe because ZTMApiClient structurally implements
 * all IChatReader methods. Tests verify this invariant.
 *
 * @param client - ZTM API client with specific error types
 * @returns Same client typed as IChatReader
 */
export function asChatReader(client: ZTMApiClient): IChatReader {
  return client as unknown as IChatReader;
}

/**
 * Convert ZTMApiClient to IChatSender interface
 *
 * @param client - ZTM API client with specific error types
 * @returns Same client typed as IChatSender
 */
export function asChatSender(client: ZTMApiClient): IChatSender {
  return client as unknown as IChatSender;
}

/**
 * Convert ZTMApiClient to IDiscovery interface
 *
 * @param client - ZTM API client with specific error types
 * @returns Same client typed as IDiscovery
 */
export function asDiscovery(client: ZTMApiClient): IDiscovery {
  return client as unknown as IDiscovery;
}
