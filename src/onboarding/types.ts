/**
 * ZTM Chat Wizard Types
 * @module onboarding/types
 * Type definitions for the interactive configuration wizard
 */

/**
 * Interactive prompts interface for user input
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
   * Present a selection list and get user's choice
   * @param question - The question to ask
   * @param options - Array of options to choose from
   * @param labels - Human-readable labels for each option
   * @returns The selected option value
   */
  select<T>(question: string, options: readonly T[], labels: string[]): Promise<T>;

  /**
   * Ask for a password (hidden input)
   * @param question - The password prompt
   * @returns The entered password
   */
  password(question: string): Promise<string>;

  /**
   * Display a visual separator
   */
  separator(): void;

  /**
   * Display a heading
   * @param text - The heading text
   */
  heading(text: string): void;

  /**
   * Display a success message
   * @param text - The success message
   */
  success(text: string): void;

  /**
   * Display a warning message
   * @param text - The warning message
   */
  warning(text: string): void;

  /**
   * Display an error message
   * @param text - The error message
   */
  error(text: string): void;

  /**
   * Display an info message
   * @param text - The info message
   */
  info(text: string): void;

  /**
   * Display a list of items
   * @param items - Array of items to display
   * @param options - Display options
   */
  list(items: string[], options?: { prefix?: string; includeCancel?: boolean }): void;
}
