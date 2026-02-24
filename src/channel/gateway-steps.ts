/**
 * Gateway Pipeline Steps
 * @module channel/gateway-steps
 * @remarks
 * This module defines the 7 sequential steps for account gateway initialization:
 * 1. validate_config - Resolve and validate configuration
 * 2. validate_connectivity - Check agent connectivity
 * 3. load_permit - Load or request permit for mesh access
 * 4. join_mesh - Join the ZTM mesh network
 * 5. initialize_runtime - Initialize the runtime state
 * 6. preload_message_state - Pre-load message state for performance
 * 7. setup_callbacks - Setup message callbacks and watchers
 */
import type { StepContext, PipelineStep, GatewayLogger } from './gateway-pipeline.types.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { PermitData } from '../types/connectivity.js';
import { RETRY_POLICIES } from './gateway-retry.js';
import { resolveZTMChatConfig, validateZTMChatConfig } from '../config/index.js';
import { initializeRuntime, getAllAccountStates } from '../runtime/state.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import {
  validateAgentConnectivity,
  loadOrRequestPermit,
  joinMeshIfNeeded,
  resolveAccountPermitPath,
} from './connectivity-manager.js';
import { setupAccountCallbacks } from './gateway.js';

/**
 * Throws an error with account state error details when runtime initialization fails
 * @param accountId - The account identifier
 * @throws Error with the last error message from the account state
 */
function throwInitializationError(accountId: string): never {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  throw new Error(state?.lastError ?? 'Failed to initialize ZTM connection');
}

/**
 * Gets the account runtime state by account ID
 * @param accountId - The account identifier
 * @returns The account runtime state
 * @throws Error if account state not found
 */
function getAccountState(accountId: string): AccountRuntimeState {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  if (!state) {
    throw new Error(`Account state not found for: ${accountId}`);
  }
  return state;
}

/**
 * Creates the gateway pipeline steps for account initialization
 * @param _ctx - The step context (unused, for future extension)
 * @returns Array of 7 pipeline steps with retry policies
 * @remarks
 * Steps are executed in order:
 * 1. validate_config - Resolves and validates the configuration
 * 2. validate_connectivity - Checks agent connectivity
 * 3. load_permit - Loads or requests permit for mesh access
 * 4. join_mesh - Joins the ZTM mesh network
 * 5. initialize_runtime - Initializes the runtime state
 * 6. preload_message_state - Pre-loads message state
 * 7. setup_callbacks - Sets up message callbacks and watchers
 */
export function createGatewaySteps(_ctx: StepContext): PipelineStep[] {
  return [
    // Step 1: validate_config
    {
      name: 'validate_config',
      execute: async stepCtx => {
        const { config, endpointName, permitPath } = resolveAndValidateConfig(
          stepCtx.account.config,
          stepCtx.account.accountId
        );
        stepCtx.config = config;
        stepCtx.endpointName = endpointName;
        stepCtx.permitPath = permitPath;
      },
      retryPolicy: RETRY_POLICIES.NO_RETRY,
    },

    // Step 2: validate_connectivity
    {
      name: 'validate_connectivity',
      execute: async stepCtx => {
        await validateAgentConnectivity(stepCtx.config!.agentUrl, stepCtx);
      },
      retryPolicy: RETRY_POLICIES.NETWORK,
    },

    // Step 3: load_permit
    {
      name: 'load_permit',
      execute: async stepCtx => {
        stepCtx.permitData = await loadOrRequestPermit(
          stepCtx.config!,
          stepCtx.permitPath!,
          stepCtx
        );
      },
      retryPolicy: RETRY_POLICIES.API,
    },

    // Step 4: join_mesh
    {
      name: 'join_mesh',
      execute: async stepCtx => {
        await joinMeshIfNeeded(
          stepCtx.config!,
          stepCtx.endpointName!,
          stepCtx.permitData as PermitData,
          stepCtx
        );
      },
      retryPolicy: RETRY_POLICIES.NETWORK,
    },

    // Step 5: initialize_runtime
    {
      name: 'initialize_runtime',
      execute: async stepCtx => {
        const initialized = await initializeRuntime(stepCtx.config!, stepCtx.account.accountId);
        if (!initialized) {
          throwInitializationError(stepCtx.account.accountId);
        }
      },
      retryPolicy: RETRY_POLICIES.API,
    },

    // Step 6: preload_message_state
    {
      name: 'preload_message_state',
      execute: async stepCtx => {
        await preloadMessageState(stepCtx.account.accountId, stepCtx.log);
      },
      retryPolicy: RETRY_POLICIES.NO_RETRY,
    },

    // Step 7: setup_callbacks
    {
      name: 'setup_callbacks',
      execute: async stepCtx => {
        const state = getAccountState(stepCtx.account.accountId);
        state.lastStartAt = new Date();

        const result = await setupAccountCallbacks(
          stepCtx.account.accountId,
          stepCtx.config!,
          state,
          { log: stepCtx.log, cfg: stepCtx.cfg }
        );

        stepCtx.state = state;
        stepCtx.messageCallback = result.messageCallback;
        stepCtx.cleanupInterval = result.cleanupInterval;

        stepCtx.setStatus?.({
          accountId: stepCtx.account.accountId,
          running: true,
          lastStartAt: Date.now(),
        });
      },
      retryPolicy: RETRY_POLICIES.WATCHER,
    },
  ];
}

/**
 * Resolves and validates ZTM chat configuration
 * @param accountConfig - The raw account configuration
 * @param accountId - The account identifier
 * @returns Object containing validated config, endpoint name, and permit path
 * @throws Error if configuration validation fails
 */
function resolveAndValidateConfig(
  accountConfig: unknown,
  accountId: string
): { config: ZTMChatConfig; endpointName: string; permitPath: string } {
  const config = resolveZTMChatConfig(accountConfig);
  const validation = validateZTMChatConfig(config);

  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const permitPath = resolveAccountPermitPath(accountId);
  const endpointName = `${config.username}-ep`;

  return { config, endpointName, permitPath };
}

/**
 * Pre-loads message state asynchronously to prevent blocking in hot path
 * @param accountId - The account identifier
 * @param log - Optional logger with error method
 * @remarks
 * This ensures state is loaded before any getWatermark/setWatermark calls.
 * Errors are logged but not thrown to avoid blocking account initialization.
 */
async function preloadMessageState(accountId: string, log?: GatewayLogger): Promise<void> {
  const { getAccountMessageStateStore } = await import('../runtime/store.js');
  const messageStateStore = getAccountMessageStateStore(accountId);
  messageStateStore.ensureLoaded().catch(err => {
    log?.error?.(`[${accountId}] Failed to pre-load message state: ${err}`);
  });
}
