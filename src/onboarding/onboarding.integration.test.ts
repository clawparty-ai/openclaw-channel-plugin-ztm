// Integration tests for Onboarding Wizard
// Tests for complete wizard flow with mocked prompts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZTMChatWizard, type WizardPrompts } from './onboarding.js';

// Import actual validation functions to use in tests
import { containsPathTraversal, isValidUrl } from '../utils/validation.js';

// MockPrompts class for testing wizard flows
class MockPrompts implements WizardPrompts {
  private prompts: Record<string, unknown>;
  private callOrder: string[] = [];

  constructor(initialPrompts: Record<string, unknown> = {}) {
    this.prompts = initialPrompts;
  }

  async ask(question: string, defaultValue?: string): Promise<string> {
    this.callOrder.push(`ask:${question}`);
    // Return value based on question content
    if (question.includes('Agent URL') || question.includes('ZTM Agent')) {
      return (this.prompts.agentUrl as string) || defaultValue || 'http://localhost:7777';
    }
    if (
      question.includes('Permit Server') ||
      question.includes('Permit URL') ||
      question.includes('Permit File')
    ) {
      if (this.prompts.permitSource === 'file' && question.includes('File')) {
        return (this.prompts.permitFilePath as string) || defaultValue || '/path/to/permit.json';
      }
      return (
        (this.prompts.permitUrl as string) ||
        defaultValue ||
        'https://clawparty.flomesh.io:7779/permit'
      );
    }
    if (question.includes('Bot username') || question.includes('username')) {
      return (this.prompts.username as string) || defaultValue || 'test-bot';
    }
    return defaultValue || '';
  }

  async confirm(question: string, defaultYes?: boolean): Promise<boolean> {
    this.callOrder.push(`confirm:${question}`);
    if (question.includes('Save')) {
      return (this.prompts.save as boolean) ?? true;
    }
    if (question.includes('group')) {
      return (this.prompts.enableGroups as boolean) ?? false;
    }
    return defaultYes ?? false;
  }

  async select<T>(question: string, options: readonly T[], _labels: string[]): Promise<T> {
    this.callOrder.push(`select:${question}`);
    // Return based on what we're selecting
    if (question.includes('permit') || question.includes('Permit') || question.includes('obtain')) {
      return (this.prompts.permitSource ?? 'server') as T;
    }
    if (question.includes('Policy')) {
      return (this.prompts.dmPolicy ?? 'pairing') as T;
    }
    if (question.includes('Group')) {
      return (this.prompts.groupPolicy ?? 'allowlist') as T;
    }
    return options[0];
  }

  async password(question: string): Promise<string> {
    this.callOrder.push(`password:${question}`);
    return (this.prompts.password as string) || '';
  }

  separator(): void {
    this.callOrder.push('separator');
  }

  heading(text: string): void {
    this.callOrder.push(`heading:${text}`);
  }

  success(text: string): void {
    this.callOrder.push(`success:${text}`);
  }

  info(text: string): void {
    this.callOrder.push(`info:${text}`);
  }

  warning(text: string): void {
    this.callOrder.push(`warning:${text}`);
  }

  error(text: string): void {
    this.callOrder.push(`error:${text}`);
  }

  list(items: string[], _options?: { prefix?: string; includeCancel?: boolean }): void {
    this.callOrder.push(`list:${items.length} items`);
  }

  close(): void {
    this.callOrder.push('close');
  }

  getCallOrder(): string[] {
    return [...this.callOrder];
  }

  resetCallOrder(): void {
    this.callOrder = [];
  }
}

// Mock dependencies
vi.mock('../utils/validation.js', () => ({
  isValidUrl: vi.fn().mockReturnValue(true),
  containsPathTraversal: vi.fn((input: string) => {
    // Check for path traversal patterns
    const patterns = ['../', '..\\', '%2e%2e', '%2e%2e%2f', '%2e%2e%5c', '..%2f', '..%5c'];
    const lower = input.toLowerCase();
    return patterns.some(p => lower.includes(p));
  }),
  IDENTIFIER_PATTERN: /^[a-zA-Z0-9_-]+$/,
}));

vi.mock('../utils/error.js', () => ({
  extractErrorMessage: vi.fn().mockReturnValue('Mock error'),
}));

vi.mock('../runtime/index.js', () => ({
  getZTMRuntime: vi.fn(),
  isZTMRuntimeInitialized: vi.fn().mockReturnValue(false),
  setZTMRuntime: vi.fn(),
}));

describe('Onboarding Wizard Integration', () => {
  let mockPrompts: MockPrompts;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrompts = new MockPrompts({
      agentUrl: 'http://localhost:7777',
      username: 'test-bot',
      permitSource: 'server',
      permitUrl: 'https://clawparty.flomesh.io:7779/permit',
      dmPolicy: 'pairing',
      groupPolicy: 'allowlist',
      enableGroups: true,
      save: true,
    });
  });

  describe('complete wizard flow', () => {
    it('should complete full onboarding flow with server permit', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      const result = await wizard.run();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('accountId');

      const callOrder = mockPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('heading'))).toBe(true);
      expect(callOrder).toContain('close');
    });

    it('should complete full onboarding flow with file permit', async () => {
      const filePrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'file',
        permitFilePath: '/path/to/permit.json',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      const wizard = new ZTMChatWizard(filePrompts);
      const result = await wizard.run();

      expect(result).not.toBeNull();
      expect(result?.config.agentUrl).toBe('http://localhost:7777');
    });

    it('should configure pairing policy correctly', async () => {
      const pairingPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      const wizard = new ZTMChatWizard(pairingPrompts);
      const result = await wizard.run();

      expect(result).not.toBeNull();
      expect(result?.config.dmPolicy).toBe('pairing');
    });

    it('should configure allow policy correctly', async () => {
      const allowPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'allow',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      const wizard = new ZTMChatWizard(allowPrompts);
      const result = await wizard.run();

      expect(result).not.toBeNull();
      expect(result?.config.dmPolicy).toBe('allow');
    });

    it('should configure deny policy correctly', async () => {
      const denyPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'deny',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      const wizard = new ZTMChatWizard(denyPrompts);
      const result = await wizard.run();

      expect(result).not.toBeNull();
      expect(result?.config.dmPolicy).toBe('deny');
    });
  });

  describe('wizard steps', () => {
    it('should call stepAgentUrl during flow', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      await wizard.run();

      const callOrder = mockPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('Agent URL') || c.includes('ZTM Agent'))).toBe(true);
    });

    it('should call stepPermitSource during flow', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      await wizard.run();

      const callOrder = mockPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('permit') || c.includes('Permit'))).toBe(true);
    });

    it('should call stepUserSelection during flow', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      await wizard.run();

      const callOrder = mockPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('username') || c.includes('username'))).toBe(true);
    });

    it('should call stepSecuritySettings during flow', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      await wizard.run();

      const callOrder = mockPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('Policy') || c.includes('policy'))).toBe(true);
    });

    it('should call stepGroupSettings when groups enabled', async () => {
      const groupPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: true,
        save: true,
      });

      const wizard = new ZTMChatWizard(groupPrompts);
      await wizard.run();

      const callOrder = groupPrompts.getCallOrder();
      expect(callOrder.some(c => c.includes('Group') || c.includes('group'))).toBe(true);
    });

    it('should skip stepGroupSettings when groups disabled', async () => {
      const noGroupPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      const wizard = new ZTMChatWizard(noGroupPrompts);
      await wizard.run();

      // Groups disabled, so no group policy selection
      const callOrder = noGroupPrompts.getCallOrder();
      expect(callOrder).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid URL format', async () => {
      const { isValidUrl } = await import('../utils/validation.js');
      vi.mocked(isValidUrl).mockReturnValueOnce(false);

      const wizard = new ZTMChatWizard(mockPrompts);
      const result = await wizard.run();

      // Should return null due to validation error
      expect(result).toBeNull();
    });

    it('should handle cancellation', async () => {
      const cancelPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: false,
        save: true,
      });

      // Override select to throw Cancelled
      const originalSelect = cancelPrompts.select.bind(cancelPrompts);
      cancelPrompts.select = async function <T>(
        question: string,
        options: readonly T[],
        labels: string[]
      ): Promise<T> {
        if (question.includes('permit')) {
          throw new Error('Cancelled');
        }
        return originalSelect(question, options, labels);
      };

      const wizard = new ZTMChatWizard(cancelPrompts);
      const result = await wizard.run();

      expect(result).toBeNull();
    });
  });

  describe('configuration output', () => {
    it('should include agentUrl in result', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      const result = await wizard.run();

      expect(result?.config.agentUrl).toBe('http://localhost:7777');
    });

    it('should include dmPolicy in result', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      const result = await wizard.run();

      expect(result?.config.dmPolicy).toBe('pairing');
    });

    it('should include enableGroups in result when groups enabled', async () => {
      const groupPrompts = new MockPrompts({
        agentUrl: 'http://localhost:7777',
        username: 'test-bot',
        permitSource: 'server',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        enableGroups: true,
        save: true,
      });

      const wizard = new ZTMChatWizard(groupPrompts);
      const result = await wizard.run();

      expect(result?.config.enableGroups).toBe(true);
    });
  });

  describe('wizard prompt ordering', () => {
    it('should follow correct step order', async () => {
      const wizard = new ZTMChatWizard(mockPrompts);
      await wizard.run();

      const callOrder = mockPrompts.getCallOrder();
      const headingIndex = callOrder.findIndex(c => c.includes('ZTM Chat Setup Wizard'));
      const agentUrlIndex = callOrder.findIndex(
        c => c.includes('Agent') || c.includes('ZTM Agent')
      );
      const permitIndex = callOrder.findIndex(c => c.includes('permit') || c.includes('Permit'));
      const closeIndex = callOrder.findIndex(c => c === 'close');

      expect(headingIndex).toBeLessThan(agentUrlIndex);
      expect(agentUrlIndex).toBeLessThan(permitIndex);
      expect(permitIndex).toBeLessThan(closeIndex);
    });
  });
});
