/**
 * @fileoverview ZTM Chat Onboarding Wizard
 * @module onboarding/onboarding
 * Interactive CLI wizard for configuring the ZTM Chat channel
 */

import * as readline from 'readline';
import type { ZTMChatConfig } from '../types/config.js';
import type { DMPolicy, GroupPolicy } from '../config/schema.js';
import { isValidUrl, IDENTIFIER_PATTERN } from '../utils/validation.js';
import { extractErrorMessage } from '../utils/error.js';
import { getZTMRuntime, hasZTMRuntime } from '../runtime/index.js';

// Extended config with wizard-specific fields
interface WizardConfig extends Partial<ZTMChatConfig> {
  messagePath?: string;
  enableGroups?: boolean;
  groupPolicy?: GroupPolicy;
  autoReply?: boolean;
  allowFrom?: string[];
  dmPolicy?: DMPolicy;
  permitSource?: 'server' | 'file';
  permitUrl?: string;
  permitFilePath?: string;
}

/**
 * Interactive prompts for user input
 */
export interface WizardPrompts {
  /**
   * Ask a question and get a text response
   * @param question - The question to ask
   * @param defaultValue - Optional default value if user presses enter without input
   * @returns The user's answer or default value
   */
  ask(question: string, defaultValue?: string): Promise<string>;

  /**
   * Ask a yes/no confirmation question
   * @param question - The question to ask
   * @param defaultYes - Whether to default to yes (true) or no (false)
   * @returns True if user confirms, false otherwise
   */
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;

  /**
   * Present a list of options for the user to select
   * @param question - The question to ask
   * @param options - Array of options to choose from
   * @param labels - Display labels for each option
   * @returns The selected option
   */
  select<T>(question: string, options: readonly T[], labels: string[]): Promise<T>;

  /**
   * Ask for a password (input hidden)
   * @param question - The question to ask
   * @returns The password entered by user
   */
  password(question: string): Promise<string>;

  /**
   * Print a separator line
   */
  separator(): void;

  /**
   * Print a heading text
   * @param text - The heading text to display
   */
  heading(text: string): void;

  /**
   * Print a success message
   * @param text - The success message to display
   */
  success(text: string): void;

  /**
   * Print an info message
   * @param text - The info message to display
   */
  info(text: string): void;

  /**
   * Print a warning message
   * @param text - The warning message to display
   */
  warning(text: string): void;

  /**
   * Print an error message
   * @param text - The error message to display
   */
  error(text: string): void;

  /**
   * Close the prompt interface
   */
  close(): void;
}

/**
 * Console-based prompts implementation
 */
export class ConsolePrompts implements WizardPrompts {
  private rl: readline.Interface;

  /**
   * Create a new ConsolePrompts instance
   */
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Close the prompt interface
   */
  close(): void {
    this.rl.close();
  }

  /**
   * Internal ask method with password support
   * @param question - The question to ask
   * @param defaultValue - Optional default value
   * @param isPassword - Whether to hide input
   * @returns The user's answer or default value
   */
  private async _ask(question: string, defaultValue?: string, isPassword = false): Promise<string> {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

    return new Promise((resolve, _reject) => {
      this.rl.question(prompt, answer => {
        if (answer.trim() === '') {
          resolve(defaultValue || '');
        } else {
          resolve(isPassword ? answer : answer.trim());
        }
      });
    });
  }

  /**
   * Ask a question and get a text response
   * @param question - The question to ask
   * @param defaultValue - Optional default value if user presses enter without input
   * @returns The user's answer or default value
   */
  async ask(question: string, defaultValue?: string): Promise<string> {
    return this._ask(question, defaultValue, false);
  }

  /**
   * Ask for a password (input hidden)
   * @param question - The question to ask
   * @returns The password entered by user
   */
  async password(question: string): Promise<string> {
    return this._ask(question, undefined, true);
  }

  /**
   * Ask a yes/no confirmation question
   * @param question - The question to ask
   * @param defaultYes - Whether to default to yes (true) or no (false)
   * @returns True if user confirms, false otherwise
   */
  async confirm(question: string, defaultYes = false): Promise<boolean> {
    const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
    const answer = await this._ask(question + suffix, defaultYes ? 'y' : 'n');
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Present a list of options for the user to select
   * @param question - The question to ask
   * @param options - Array of options to choose from
   * @param labels - Display labels for each option
   * @returns The selected option
   */
  async select<T>(question: string, options: readonly T[], labels: string[]): Promise<T> {
    this.separator();
    this.heading(question);

    for (let i = 0; i < options.length; i++) {
      console.log(`  [${i + 1}] ${labels[i] || String(options[i])}`);
    }
    console.log('  [0] Cancel');

    const answer = await this._ask('Select', '1');

    const index = parseInt(answer, 10) - 1;
    if (index === -1) {
      throw new Error('Cancelled');
    }
    if (index < 0 || index >= options.length) {
      throw new Error('Invalid selection');
    }

    return options[index];
  }

  /**
   * Print a separator line
   */
  separator(): void {
    console.log('');
  }

  /**
   * Print a heading text
   * @param text - The heading text to display
   */
  heading(text: string): void {
    console.log(`\x1b[1m${text}\x1b[0m`);
  }

  /**
   * Print a success message
   * @param text - The success message to display
   */
  success(text: string): void {
    console.log(`\x1b[32m✓\x1b[0m ${text}`);
  }

  /**
   * Print a warning message
   * @param text - The warning message to display
   */
  warning(text: string): void {
    console.log(`\x1b[33m⚠\x1b[0m ${text}`);
  }

  /**
   * Print an error message
   * @param text - The error message to display
   */
  error(text: string): void {
    console.log(`\x1b[31m✗\x1b[0m ${text}`);
  }

  /**
   * Print an info message
   * @param text - The info message to display
   */
  info(text: string): void {
    console.log(`\x1b[36mℹ\x1b[0m ${text}`);
  }
}

/**
 * Wizard result configuration
 */
export interface WizardResult {
  /** The ZTM Chat configuration */
  config: ZTMChatConfig & { allowFrom?: string[] };
  /** The account ID (username) */
  accountId: string;
  /** Optional path where configuration was saved */
  savePath?: string;
}

/**
 * ZTM Chat Onboarding Wizard
 */
export class ZTMChatWizard {
  private prompts: WizardPrompts;
  private config: WizardConfig;

  /**
   * Create a new ZTMChatWizard instance
   * @param prompts - Optional custom prompts implementation (defaults to ConsolePrompts)
   */
  constructor(prompts?: WizardPrompts) {
    this.prompts = prompts || new ConsolePrompts();
    this.config = {
      messagePath: '/shared',
      enableGroups: false,
      autoReply: true,
      allowFrom: undefined,
      dmPolicy: 'pairing',
      permitSource: 'server',
      permitUrl: 'https://ztm-portal.flomesh.io:7779/permit',
    };
  }

  /**
   * Run the complete onboarding wizard
   * @returns WizardResult if completed successfully, null if cancelled or failed
   */
  async run(): Promise<WizardResult | null> {
    try {
      this.prompts.separator();
      this.prompts.heading('🤖 ZTM Chat Setup Wizard');
      this.prompts.heading('='.repeat(40));
      this.prompts.separator();

      // Step 1: Agent URL
      await this.stepAgentUrl();

      // Step 2: Permit Source
      await this.stepPermitSource();

      // Step 3: User Selection
      await this.stepUserSelection();

      // Step 4: Security Settings
      await this.stepSecuritySettings();

      // Step 5: Group Chat Settings
      await this.stepGroupSettings();

      // Step 6: Summary
      const result = await this.summary();

      this.prompts.close();
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Cancelled') {
        this.prompts.warning('Wizard cancelled.');
      } else {
        this.prompts.error(`Wizard failed: ${error}`);
      }
      this.prompts.close();
      return null;
    }
  }

  /**
   * Step 1: Configure Agent URL
   * @returns Promise that resolves when step is complete
   */
  private async stepAgentUrl(): Promise<void> {
    this.prompts.heading('Step 1: ZTM Agent URL (Required)');
    this.prompts.separator();

    const agentUrl = await this.prompts.ask('ZTM Agent URL', 'http://localhost:7777');

    // Validate URL format (only format, not connectivity - that's handled by gateway lifecycle)
    if (!isValidUrl(agentUrl)) {
      this.prompts.error(`Invalid URL format: ${agentUrl}`);
      throw new Error('Invalid URL format');
    }
    this.config.agentUrl = agentUrl;
    this.prompts.success(`URL validated: ${agentUrl}`);
  }

  /**
   * Step 2: Permit Source Selection
   * @returns Promise that resolves when step is complete
   */
  private async stepPermitSource(): Promise<void> {
    this.prompts.separator();
    this.prompts.heading('Step 2: Permit Source (Required)');
    this.prompts.separator();

    const sources = ['server', 'file'] as const;
    const sourceLabels = [
      'Server - Request permit from permit server (requires agent API access)',
      'File - Use existing permit.json file',
    ];

    const permitSource = await this.prompts.select<'server' | 'file'>(
      'How to obtain permit.json?',
      sources,
      sourceLabels
    );

    this.config.permitSource = permitSource;
    this.prompts.success(`Permit source set to: ${permitSource}`);

    // Conditionally ask for permitUrl or permitFilePath
    if (permitSource === 'server') {
      await this.stepPermitUrl();
    } else {
      await this.stepPermitFilePath();
    }
  }

  /**
   * Step 2a: Permit Server URL (when server)
   * @returns Promise that resolves when step is complete
   */
  private async stepPermitUrl(): Promise<void> {
    const permitUrl = await this.prompts.ask(
      'Permit Server URL',
      'https://ztm-portal.flomesh.io:7779/permit'
    );

    if (!isValidUrl(permitUrl)) {
      this.prompts.error(`Invalid URL format: ${permitUrl}`);
      throw new Error('Invalid URL format');
    }
    this.config.permitUrl = permitUrl;
    this.prompts.success(`URL validated: ${permitUrl}`);
  }

  /**
   * Step 2b: Permit File Path (when file)
   * @returns Promise that resolves when step is complete
   */
  private async stepPermitFilePath(): Promise<void> {
    const permitFilePath = await this.prompts.ask('Permit File Path', '/path/to/permit.json');

    if (!permitFilePath || !permitFilePath.trim()) {
      this.prompts.error('Permit file path is required');
      throw new Error('Permit file path is required');
    }
    this.config.permitFilePath = permitFilePath;
    this.prompts.success(`Permit file path set to: ${permitFilePath}`);
  }

  /**
   * Step 3: Select Bot Username
   * @returns Promise that resolves when step is complete
   */
  private async stepUserSelection(): Promise<void> {
    this.prompts.separator();
    this.prompts.heading('Step 3: Bot Username (Required)');
    this.prompts.separator();

    const username = await this.prompts.ask('Bot username', 'openclaw-bot');

    if (!username.trim()) {
      this.prompts.error('Username is required');
      throw new Error('Username is required');
    }

    // Validate username format
    if (!IDENTIFIER_PATTERN.test(username)) {
      this.prompts.error('Username must contain only letters, numbers, hyphens, and underscores');
      throw new Error('Invalid username format');
    }

    this.config.username = username;
    this.prompts.success(`Bot username configured: ${username}`);
  }

  /**
   * Step 4: Security Settings
   * @returns Promise that resolves when step is complete
   */
  private async stepSecuritySettings(): Promise<void> {
    this.prompts.separator();
    this.prompts.heading('Step 4: Security Settings');
    this.prompts.separator();

    // DM Policy - pairing is the default
    const policies = ['pairing', 'allow', 'deny'] as const;
    const policyLabels = [
      'Require explicit pairing (approval needed)',
      'Allow messages from all users',
      'Deny messages from all users',
    ];

    const policy = await this.prompts.select<DMPolicy>(
      'Direct Message Policy',
      policies,
      policyLabels
    );

    this.config.dmPolicy = policy;
    this.prompts.success(`DM Policy set to: ${policy}`);

    // Allow list (only used if policy is deny or pairing, or for whitelisting)
    const allowFrom = await this.prompts.ask(
      'Allow messages from (comma-separated usernames, * for all users)',
      '*'
    );

    if (allowFrom !== '*') {
      this.config.allowFrom = allowFrom
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }

  /**
   * Step 5: Group Chat Settings
   * @returns Promise that resolves when step is complete
   */
  private async stepGroupSettings(): Promise<void> {
    this.prompts.separator();
    this.prompts.heading('Step 5: Group Chat Settings');
    this.prompts.separator();

    // Ask if user wants to enable groups
    const enableGroups = await this.prompts.confirm('Enable group chat support?', false);

    this.config.enableGroups = enableGroups;

    if (!enableGroups) {
      this.prompts.info('Group chat disabled.');
      return;
    }

    this.prompts.success('Group chat enabled.');

    // Group Policy
    const groupPolicies = ['allowlist', 'open', 'disabled'] as const;
    const groupPolicyLabels = [
      'Allowlist - Only allow whitelisted senders',
      'Open - Allow all group messages',
      'Disabled - Block all group messages',
    ];

    const groupPolicy = await this.prompts.select<GroupPolicy>(
      'Default Group Policy',
      groupPolicies,
      groupPolicyLabels
    );

    this.config.groupPolicy = groupPolicy;
    this.prompts.success(`Group Policy set to: ${groupPolicy}`);

    // Require Mention
    const requireMention = await this.prompts.confirm(
      'Require @mention to process group messages?',
      true
    );

    this.config.requireMention = requireMention;
    this.prompts.success(`Require Mention set to: ${requireMention}`);
  }

  /**
   * Step 6: Summary and Save
   * @returns WizardResult with configuration and account details
   */
  private async summary(): Promise<WizardResult> {
    this.prompts.separator();
    this.prompts.heading('Configuration Summary');
    this.prompts.separator();

    console.log('  Agent URL:', this.config.agentUrl);
    console.log('  Permit Source:', this.config.permitSource);
    if (this.config.permitSource === 'server') {
      console.log('  Permit Server URL:', this.config.permitUrl);
    } else {
      console.log('  Permit File Path:', this.config.permitFilePath);
    }
    console.log('  Username:', this.config.username);
    console.log('  Message Path:', this.config.messagePath);
    console.log('  Auto Reply:', this.config.autoReply);
    console.log('  DM Policy:', this.config.dmPolicy);
    console.log('  Allow From:', this.config.allowFrom?.join(', ') || '* (all users)');
    console.log('  Enable Groups:', this.config.enableGroups ?? false);
    if (this.config.enableGroups) {
      console.log('  Group Policy:', this.config.groupPolicy ?? 'allowlist');
      console.log('  Require Mention:', this.config.requireMention ?? true);
    }

    this.prompts.separator();

    const save = await this.prompts.confirm('Save this configuration?', true);

    let savePath: string | undefined;
    if (save) {
      const config = this.buildConfig();
      const accountId = this.config.username || 'default';

      // Write to openclaw.yaml using runtime
      if (!hasZTMRuntime()) {
        this.prompts.error('Runtime not available. Please run through OpenClaw CLI.');
        return {
          config: this.buildConfig(),
          accountId: this.config.username || 'default',
          savePath: undefined,
        };
      }

      try {
        const rt = getZTMRuntime();
        const currentConfig = rt.config.loadConfig();

        // Build channel config in openclaw.yaml format
        const channelConfig =
          (currentConfig.channels?.['ztm-chat'] as Record<string, unknown>) || {};
        const accounts = (channelConfig.accounts as Record<string, unknown>) || {};
        accounts[accountId] = config;

        const newConfig = {
          ...currentConfig,
          channels: {
            ...currentConfig.channels,
            'ztm-chat': {
              ...channelConfig,
              accounts,
            },
          },
        };

        await rt.config.writeConfigFile(newConfig);
        savePath = 'openclaw.yaml (channels.ztm-chat)';
        this.prompts.success(`Configuration saved to openclaw.yaml`);

        // Show pairing mode info
        if (this.config.dmPolicy === 'pairing') {
          this.prompts.separator();
          this.prompts.heading('Pairing Mode Enabled');
          this.prompts.warning('Your bot is in pairing mode.');
          this.prompts.info('To allow users to message you:');
          console.log('   1. Users send a message to your bot');
          this.prompts.info('   2. The bot will send them a pairing request');
          console.log('   3. Approve them: openclaw pairing approve ztm-chat <code>');
          this.prompts.info('   4. After approval, their messages will be accepted');
        }
      } catch (error) {
        const errorMsg = extractErrorMessage(error);
        this.prompts.error(`Failed to save: ${errorMsg}`);
      }
    }

    return {
      config: this.buildConfig(),
      accountId: this.config.username || 'default',
      savePath,
    };
  }

  /**
   * Build final configuration object
   * @returns The final ZTM Chat configuration
   */
  private buildConfig(): ZTMChatConfig & { allowFrom?: string[] } {
    return {
      agentUrl: this.config.agentUrl || 'http://localhost:7777',
      permitSource: (this.config.permitSource || 'server') as 'server' | 'file',
      permitUrl: this.config.permitUrl || '',
      permitFilePath: this.config.permitFilePath,
      meshName: this.config.meshName || 'openclaw-mesh',
      username: this.config.username || 'openclaw-bot',
      enableGroups: this.config.enableGroups ?? false,
      autoReply: this.config.autoReply ?? true,
      messagePath: this.config.messagePath || '/shared',
      dmPolicy: this.config.dmPolicy ?? 'pairing',
      allowFrom: this.config.allowFrom,
      groupPolicy: this.config.groupPolicy ?? 'allowlist',
      requireMention: this.config.requireMention ?? true,
    };
  }
}

/**
 * Create wizard and run it
 * @returns WizardResult if completed successfully, null if cancelled or failed
 */
export async function runWizard(): Promise<WizardResult | null> {
  const wizard = new ZTMChatWizard();
  return wizard.run();
}

/**
 * Silent configuration discovery - auto-detect settings
 */
export interface DiscoveredConfig {
  /** The ZTM Agent URL */
  agentUrl: string;
  /** The mesh name */
  meshName: string;
  /** The bot username */
  username: string;
}

/**
 * Attempt to auto-discover ZTM configuration from openclaw.yaml via runtime API
 * @returns DiscoveredConfig if found, null otherwise
 */
export async function discoverConfig(): Promise<DiscoveredConfig | null> {
  // Check environment variables first
  const agentUrl = process.env.ZTM_AGENT_URL || 'http://localhost:7777';

  // Try to read from openclaw.yaml via runtime API
  if (!hasZTMRuntime()) {
    return null;
  }

  try {
    const rt = getZTMRuntime();
    const config = rt.config.loadConfig();

    // Look for ztm-chat channel config
    const channelConfig = config.channels?.['ztm-chat'] as Record<string, unknown> | undefined;
    const accounts = channelConfig?.accounts as Record<string, unknown> | undefined;
    const firstAccount = accounts ? (Object.values(accounts)[0] as Record<string, unknown>) : null;

    if (firstAccount) {
      return {
        agentUrl: (firstAccount.agentUrl as string) || agentUrl,
        meshName: (firstAccount.meshName as string) || '',
        username: (firstAccount.username as string) || '',
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}
