/**
 * ZTM Chat Heartbeat Adapter
 * @module channel/heartbeat
 * Implements ChannelHeartbeatAdapter for connection health checking
 */

import type { ChannelHeartbeatAdapter } from 'openclaw/plugin-sdk';
import { container, DEPENDENCIES } from '../di/index.js';
import type { IApiClientFactory, ILogger } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';
import { ZTMTimeoutError, ZTMApiError } from '../types/errors.js';

/**
 * Heartbeat adapter for ZTM Chat channel
 */
export const ztmChatHeartbeatAdapter: ChannelHeartbeatAdapter = {
  /**
   * Check if the ZTM Agent is ready (connected to mesh)
   */
  checkReady: async ({ cfg, accountId }) => {
    try {
      // Resolve account configuration
      const account = resolveZTMChatAccount({
        cfg,
        accountId: accountId ?? undefined,
      });
      const config = getZTMChatConfig(account);

      if (!config) {
        return {
          ok: false,
          reason: 'ZTM Chat not configured',
        };
      }

      // Get API client factory
      const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

      // Create API client
      const apiClient = apiClientFactory(config, { logger });

      // Check mesh connection status
      const meshResult = await apiClient.getMeshInfo();

      if (!meshResult.ok) {
        // Classify error type for more meaningful error messages
        const error = meshResult.error;
        if (error instanceof ZTMTimeoutError) {
          return { ok: false, reason: 'Network timeout' };
        }
        if (error instanceof ZTMApiError) {
          const statusCode = error.context.statusCode as number | undefined;
          if (statusCode && statusCode >= 500) {
            return { ok: false, reason: `Server error: ${statusCode}` };
          }
          if (statusCode === 401 || statusCode === 403) {
            return { ok: false, reason: 'Authentication failed' };
          }
        }
        return { ok: false, reason: `Failed to get mesh info: ${error?.message}` };
      }

      const meshInfo = meshResult.value;

      if (!meshInfo?.connected) {
        return {
          ok: false,
          reason: 'ZTM Agent is not connected to the mesh network',
        };
      }

      return {
        ok: true,
        reason: 'Connected',
      };
    } catch (error) {
      return {
        ok: false,
        reason: `Agent unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  /**
   * Resolve recipients for heartbeat notifications
   */
  resolveRecipients: ({ cfg: _cfg, opts }) => {
    // If 'to' is specified, return that specific recipient
    if (opts?.to) {
      return {
        recipients: [opts.to],
        source: 'explicit',
      };
    }

    // If 'all' is true, return all mesh peers
    // Note: Full mesh peer discovery requires API integration
    if (opts?.all) {
      return {
        recipients: [],
        source: 'mesh',
      };
    }

    // Default: return empty recipients
    return {
      recipients: [],
      source: 'none',
    };
  },
};
