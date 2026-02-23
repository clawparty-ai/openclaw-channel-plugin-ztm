// src/channel/gateway-steps.ts
import type { StepContext, PipelineStep } from './gateway-pipeline.types.js';
import type { ZTMChatConfig } from '../types/config.js';
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

function throwInitializationError(accountId: string): never {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  throw new Error(state?.lastError ?? 'Failed to initialize ZTM connection');
}

function getAccountState(accountId: string): AccountRuntimeState {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  if (!state) {
    throw new Error(`Account state not found for: ${accountId}`);
  }
  return state;
}

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
          stepCtx.permitData as any,
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
          stepCtx as any
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

async function preloadMessageState(accountId: string, log?: unknown): Promise<void> {
  const { getAccountMessageStateStore } = await import('../runtime/store.js');
  const messageStateStore = getAccountMessageStateStore(accountId);
  messageStateStore.ensureLoaded().catch(err => {
    if (log && typeof log === 'object' && 'error' in log) {
      (log as any).error(`[${accountId}] Failed to pre-load message state: ${err}`);
    }
  });
}
