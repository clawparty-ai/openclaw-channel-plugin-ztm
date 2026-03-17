/**
 * Console-based prompts implementation for ZTM Chat onboarding wizard.
 * @module onboarding/console-prompts
 *
 * Provides interactive CLI prompts using Node.js readline interface.
 * Implements the WizardPrompts interface for user input during wizard flow.
 */

import * as readline from 'readline';
import type { WizardPrompts } from './types.js';

/**
 * Console-based prompts implementation
 *
 * Uses Node.js readline to provide interactive command-line prompts.
 * Supports text input, password entry (hidden), yes/no confirmation,
 * option selection, and formatted output messages.
 *
 * @example
 * ```typescript
 * const prompts = new ConsolePrompts();
 * const name = await prompts.ask('What is your name?');
 * const confirmed = await prompts.confirm('Continue?', true);
 * prompts.close();
 * ```
 */
export class ConsolePrompts implements WizardPrompts {
  private rl: readline.Interface;

  /**
   * Create a new ConsolePrompts instance
   *
   * Initializes a readline interface for stdin/stdout interaction.
   * The interface should be closed when prompts are complete via close().
   */
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Close the prompt interface
   *
   * Closes the readline interface and releases stdin/stdout resources.
   * Should be called when wizard is complete.
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
   *
   * @internal
   */
  private async _ask(question: string, defaultValue?: string, isPassword = false): Promise<string> {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (value: string) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      // Handle case where readline interface is closed before question is answered
      const onClose = () => {
        fail(new Error('Readline interface closed before prompt was answered'));
      };

      this.rl.once('close', onClose);

      this.rl.question(prompt, answer => {
        // Remove close listener since question was answered
        this.rl.off('close', onClose);

        if (answer.trim() === '') {
          settle(defaultValue || '');
        } else {
          settle(isPassword ? answer : answer.trim());
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
   * @throws {Error} If user cancels (selects index 0)
   * @throws {Error} If user enters invalid selection
   */
  async select<T>(question: string, options: readonly T[], labels: string[]): Promise<T> {
    this.separator();
    this.heading(question);

    const items = options.map((_, i) => labels[i] || String(options[i]));
    this.list(items, { prefix: '  [index] ', includeCancel: true });

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

  /**
   * Print a formatted list of items
   * @param items - Array of items to display
   * @param options - Optional formatting options
   * @param options.prefix - Prefix for each item (default: '  [index] ')
   * @param options.includeCancel - Whether to include a cancel option at index 0 (default: false)
   */
  list(items: string[], options?: { prefix?: string; includeCancel?: boolean }): void {
    const prefix = options?.prefix ?? '  ';
    const includeCancel = options?.includeCancel ?? false;

    if (includeCancel) {
      console.log(`${prefix}[0] Cancel`);
    }

    for (let i = 0; i < items.length; i++) {
      const index = includeCancel ? i + 1 : i;
      const itemPrefix = prefix.replace('index', String(index));
      console.log(`${itemPrefix}${items[i]}`);
    }
  }
}
