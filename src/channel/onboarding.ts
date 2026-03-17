/**
 * ZTM Chat Onboarding Adapter
 * @module channel/onboarding
 * Implements ChannelOnboardingAdapter for standardized onboarding flow
 */

import type { ChannelOnboardingAdapter, DmPolicy } from 'openclaw/plugin-sdk';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { WizardPrompter } from 'openclaw/plugin-sdk';

import { ZTMChatWizard } from '../onboarding/onboarding.js';
import type { WizardPrompts } from '../onboarding/onboarding.js';
import { validateUsername } from '../utils/validation.js';
import type { ZTMChatConfig } from '../config/schema.js';
import { getOrCreateAccountState } from '../runtime/state.js';
import { ZTM_CHANNEL_ID } from '../constants.js';
import { container, DEPENDENCIES, type IApiClientFactory, type ILogger } from '../di/index.js';

/**
 * Adapt OpenClaw's WizardPrompter to ZTMChatWizard's WizardPrompts interface
 */
function createWizardPrompterAdapter(prompter: WizardPrompter): WizardPrompts {
  return {
    async ask(question: string, defaultValue?: string): Promise<string> {
      const result = await prompter.text({
        message: question,
        initialValue: defaultValue,
        validate: v => (v?.trim() ? undefined : 'Required'),
      });
      return result || defaultValue || '';
    },

    async select<T>(question: string, options: readonly T[], labels: string[]): Promise<T> {
      const selectOptions: Array<{ value: T; label: string }> = options.map((opt, i) => ({
        value: opt,
        label: labels[i] ?? String(opt),
      }));
      return prompter.select({
        message: question,
        options: selectOptions,
      }) as Promise<T>;
    },

    async confirm(question: string, defaultYes?: boolean): Promise<boolean> {
      return prompter.confirm({
        message: question,
        initialValue: defaultYes,
      });
    },

    async password(_question: string): Promise<string> {
      throw new Error('Not supported');
    },

    separator(): void {
      // Visual separator
    },

    heading(_text: string): void {
      // OpenClaw doesn't have heading
    },

    success(_text: string): void {
      // OpenClaw doesn't have success
    },

    warning(_text: string): void {
      // OpenClaw doesn't have warning
    },

    error(_text: string): void {
      // OpenClaw doesn't have error
    },

    info(_text: string): void {
      // OpenClaw doesn't have info
    },

    list(_items: string[], _options?: { prefix?: string; includeCancel?: boolean }): void {
      // OpenClaw doesn't have list display
    },

    close(): void {
      // No-op for OpenClaw prompter
    },
  };
}

/**
 * Get ZTM Chat account from config
 *
 * @param cfg - OpenClaw configuration object
 * @returns Account with ID and config, or null if not found/invalid
 */
function getZTMChatAccount(
  cfg: OpenClawConfig
): { accountId: string; config: ZTMChatConfig } | null {
  const channels = cfg.channels as
    | Record<string, { accounts?: Record<string, ZTMChatConfig> }>
    | undefined;
  const ztmChat = channels?.[ZTM_CHANNEL_ID];

  if (!ztmChat) return null;

  const accounts = ztmChat.accounts;
  if (!accounts || Object.keys(accounts).length === 0) return null;

  const accountId = Object.keys(accounts)[0];
  const config = accounts[accountId];

  if (!config || !config.agentUrl || !config.username) return null;

  return { accountId, config };
}

/**
 * Sanitize error messages to prevent internal details from leaking to users
 */
function sanitizeErrorMessage(error: unknown, logger?: ILogger): string {
  if (error instanceof Error) {
    // Log error details server-side for debugging (without stack trace for security)
    logger?.error('Connection failed', {
      name: error.name,
      message: error.message,
    });
    // Return generic message to user
    return 'Connection failed. Please check your configuration and try again.';
  }
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Create a no-op logger fallback when DI container fails
 */
function createNoopLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

/**
 * ZTM Chat onboarding adapter for OpenClaw integration.
 *
 * Provides standardized onboarding flow including:
 * - Interactive configuration wizard via `configureInteractive()`
 * - Non-interactive configuration validation via `configure()`
 * - Connection testing and management via `configureWhenConfigured()`
 * - DM policy management for direct message access control
 * - Runtime state initialization via `onAccountRecorded()`
 *
 * @example
 * ```typescript
 * import { ztmChatOnboardingAdapter } from './channel/onboarding.js';
 *
 * // Check channel status
 * const status = await ztmChatOnboardingAdapter.getStatus({ cfg });
 * if (status.configured) {
 *   console.log('ZTM Chat is ready');
 *   console.log('Agent:', status.statusLines[0]);
 * }
 *
 * // Interactive configuration
 * const result = await ztmChatOnboardingAdapter.configureInteractive({
 *   cfg,
 *   runtime,
 *   prompter,
 *   label: 'ZTM Chat',
 *   configured: false,
 * });
 * ```
 *
 * @see {@link https://openclaw.dev/docs/adapters | Adapter Documentation}
 */
export const ztmChatOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: ZTM_CHANNEL_ID,

  /**
   * Get onboarding status for ZTM Chat channel.
   *
   * @param params - The onboarding status parameters
   * @param params.cfg - OpenClaw configuration object
   * @returns Status object containing channel ID, configured flag, and status lines
   *
   * @example
   * ```typescript
   * const status = await ztmChatOnboardingAdapter.getStatus({ cfg });
   * console.log(status.configured); // true
   * console.log(status.statusLines);
   * // ["Agent: http://localhost:3000", "Username: alice", "Mesh: my-mesh"]
   * ```
   */
  getStatus: async ({ cfg }) => {
    const account = getZTMChatAccount(cfg);

    const configured = account !== null;

    const statusLines: string[] = [];
    if (configured) {
      const config = account?.config;
      statusLines.push(`Agent: ${config?.agentUrl as string}`);
      statusLines.push(`Username: ${config?.username as string}`);
      statusLines.push(`Mesh: ${config?.meshName as string}`);
    } else {
      statusLines.push('Not configured');
    }

    return {
      channel: ZTM_CHANNEL_ID,
      configured,
      statusLines,
      selectionHint: 'ZTM Chat (P2P)',
    };
  },

  /**
   * Configure ZTM Chat channel (non-interactive)
   * Validates existing configuration and returns accountId if valid
   */
  configure: async ({ cfg }) => {
    // Validate existing config
    const account = getZTMChatAccount(cfg);
    if (!account) {
      // No valid account - return as-is (user needs to configure via wizard)
      return { cfg };
    }

    // Validate required fields
    const { config } = account;
    if (!config.agentUrl || !config.username) {
      // Invalid config - return as-is (log for debugging)
      return { cfg };
    }

    return { cfg, accountId: account.accountId };
  },

  /**
   * Configure ZTM Chat channel (interactive)
   * Runs wizard for new configuration or updates existing
   */
  configureInteractive: async (ctx: {
    cfg: OpenClawConfig;
    prompter: WizardPrompter;
    label: string;
    configured: boolean;
  }): Promise<{ cfg: OpenClawConfig; accountId?: string } | 'skip'> => {
    const { cfg, prompter, label, configured } = ctx;

    // If already configured, prompt user for action
    if (configured) {
      const choice = await prompter.select({
        message: `${label} is already configured. What would you like to do?`,
        options: [
          { value: 'keep', label: 'Keep current configuration' },
          { value: 'update', label: 'Update configuration' },
        ],
        initialValue: 'keep',
      });

      if (choice === 'keep') {
        return 'skip';
      }
    }

    // Run ZTMChatWizard with adapted prompter to ensure consistent logic
    let wizardResult;
    try {
      const wizardPrompts = createWizardPrompterAdapter(prompter);
      const wizard = new ZTMChatWizard(wizardPrompts);
      wizardResult = await wizard.run();
    } catch (error) {
      // Log details for debugging (server-side only)
      let logger: ILogger | null = null;
      try {
        logger = container.get<ILogger>(DEPENDENCIES.LOGGER) ?? null;
      } catch {
        logger = null;
      }
      const finalLogger = logger ?? createNoopLogger();
      finalLogger.error('Wizard failed', {
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      });

      // Show user-friendly message
      await prompter.note('Configuration failed. Please try again.');
      return 'skip';
    }

    // Validate wizard result
    if (!wizardResult || !wizardResult.config || !wizardResult.accountId) {
      await prompter.note('Configuration incomplete or cancelled.');
      return 'skip';
    }

    // Validate username for security (defense in depth)
    const usernameValidation = validateUsername(wizardResult.accountId);
    if (!usernameValidation.valid) {
      await prompter.note('Invalid username configuration.');
      return 'skip';
    }

    // Use username as accountId for semantic naming
    const accountId = wizardResult.accountId;

    // Build/update bindings (required for OpenClaw 2026.2.26+)
    // Ref: ADR-024 - ZTM Chat Bindings Migration
    const rawBindings = (cfg as Record<string, unknown>).bindings as
      | Array<Record<string, unknown>>
      | undefined;
    const existingBindings = Array.isArray(rawBindings) ? rawBindings : [];

    // Separate ztm-chat bindings from other channel bindings
    const otherBindings = existingBindings.filter((b: unknown) => {
      const binding = b as Record<string, unknown> | undefined;
      const match = binding?.match as Record<string, unknown> | undefined;
      return match?.channel !== ZTM_CHANNEL_ID;
    });
    const ztmChatBindings = existingBindings.filter((b: unknown) => {
      const binding = b as Record<string, unknown> | undefined;
      const match = binding?.match as Record<string, unknown> | undefined;
      return match?.channel === ZTM_CHANNEL_ID;
    });

    // Create new binding (with accountId)
    const newBinding = {
      agentId: 'main', // Default agent
      match: {
        channel: ZTM_CHANNEL_ID,
        accountId: accountId, // Explicitly bind to account
      },
    };

    // If no ztm-chat binding exists, add new one
    const updatedBindings = [...otherBindings];
    if (ztmChatBindings.length === 0) {
      updatedBindings.push(newBinding);
    } else {
      // Keep existing ztm-chat bindings
      updatedBindings.push(...ztmChatBindings);
    }

    // Build new config
    const newCfg: OpenClawConfig = {
      ...cfg,
      channels: {
        ...cfg.channels,
        [ZTM_CHANNEL_ID]: {
          enabled: true,
          accounts: {
            [accountId]: wizardResult.config as ZTMChatConfig,
          },
        },
      },
      bindings: updatedBindings as unknown as Array<{
        agentId: string;
        match: { channel: string; accountId: string };
      }>,
    };

    return { cfg: newCfg, accountId };
  },

  /**
   * DM policy configuration
   */
  dmPolicy: {
    label: 'ZTM Chat',
    channel: ZTM_CHANNEL_ID,
    policyKey: 'channels.ztm-chat.dmPolicy',
    allowFromKey: 'channels.ztm-chat.allowFrom',
    getCurrent: (cfg: OpenClawConfig): DmPolicy => {
      const channels = cfg.channels as Record<string, { dmPolicy?: DmPolicy }> | undefined;
      return channels?.[ZTM_CHANNEL_ID]?.dmPolicy ?? 'pairing';
    },
    setPolicy: (cfg: OpenClawConfig, policy: DmPolicy): OpenClawConfig => {
      const newCfg = { ...cfg };
      if (!newCfg.channels) {
        (newCfg as Record<string, unknown>).channels = {};
      }
      const channels = newCfg.channels as Record<string, unknown>;

      if (!channels[ZTM_CHANNEL_ID]) {
        channels[ZTM_CHANNEL_ID] = {};
      }
      const ztmChat = channels[ZTM_CHANNEL_ID] as Record<string, unknown>;

      ztmChat.dmPolicy = policy;

      return newCfg;
    },
  },

  /**
   * Disable ZTM Chat channel
   */
  disable: (cfg: OpenClawConfig): OpenClawConfig => {
    const newCfg = { ...cfg };
    if (!newCfg.channels) {
      return newCfg;
    }
    const channels = newCfg.channels as Record<string, unknown>;
    delete channels[ZTM_CHANNEL_ID];
    return newCfg;
  },

  /**
   * Configure when already configured
   * Provides options to test connection, update, or remove configuration
   */
  configureWhenConfigured: async (ctx: {
    cfg: OpenClawConfig;
    prompter: WizardPrompter;
    label: string;
  }): Promise<{ cfg: OpenClawConfig; accountId?: string } | 'skip'> => {
    const { cfg, prompter, label } = ctx;

    // Show current config status
    const account = getZTMChatAccount(cfg);
    if (!account) {
      return 'skip';
    }

    // Prompt user for action
    const choice = await prompter.select({
      message: `${label} is configured. Manage?`,
      options: [
        { value: 'test', label: 'Test connection' },
        { value: 'update', label: 'Update configuration' },
        { value: 'remove', label: 'Remove configuration' },
      ],
      initialValue: 'test',
    });

    switch (choice) {
      case 'test':
        try {
          // Get dependencies with null checks
          const apiClientFactory = container.get<IApiClientFactory>(
            DEPENDENCIES.API_CLIENT_FACTORY
          );
          const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

          // Validate dependencies are available
          if (!apiClientFactory || !logger) {
            logger?.error('Required dependencies not available', {
              apiClientFactory: !!apiClientFactory,
              logger: !!logger,
            });
            await prompter.note('Service not initialized. Please restart the application.');
            return { cfg, accountId: account.accountId };
          }

          const apiClient = apiClientFactory(account.config as ZTMChatConfig, { logger });
          const meshResult = await apiClient.getMeshInfo();

          if (meshResult.ok && meshResult.value?.connected) {
            await prompter.note('Connection successful!');
          } else {
            // Use sanitized error message
            await prompter.note(sanitizeErrorMessage(meshResult.error, logger));
          }
        } catch (error) {
          // Use sanitized error message
          await prompter.note(sanitizeErrorMessage(error));
        }
        return { cfg, accountId: account.accountId };

      case 'update':
        // Delegate to configureInteractive - return skip so caller invokes it
        return 'skip';

      case 'remove':
        // Return skip with reason - caller should invoke disable
        await prompter.note('To remove configuration, use: openclaw channels remove ztm-chat');
        return 'skip';

      default:
        // Exhaustive check - should never happen
        return 'skip';
    }
  },

  /**
   * Called when account is recorded
   * Initializes runtime state and logs audit
   */
  onAccountRecorded: (accountId: string, options?: unknown): void => {
    // Check if DI container is ready
    let logger: ILogger | null = null;
    try {
      logger = container.get<ILogger>(DEPENDENCIES.LOGGER) ?? null;
    } catch {
      // Container not ready, use noop logger
      logger = null;
    }

    const finalLogger = logger ?? createNoopLogger();

    // Initialize runtime state using existing AccountStateManager
    // This has the side effect of creating the state if it doesn't exist
    void getOrCreateAccountState(accountId);

    // AccountStateManager.getOrCreate() already initializes the state properly
    // The state object has all required properties with default values

    // Log for audit (always succeeds due to no-op fallback)
    finalLogger.info('ZTM Chat account recorded', { accountId, options });
  },
};
