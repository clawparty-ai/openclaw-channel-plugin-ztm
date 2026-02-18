// Type guards and null/undefined handling utilities
// Provides consistent patterns for null checks and default values

/**
 * Type guard to check if a value is not null or undefined
 * @param value - Value to check
 * @returns true if value is not null or undefined
 *
 * @example
 * if (!isDefined(value)) return;
 * const definite: string = value; // TypeScript knows value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if a value is null or undefined
 * @param value - Value to check
 * @returns true if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Require a value to be defined, throwing if null/undefined
 * Use this for invariants that should never be undefined
 *
 * @param value - Value that should be defined
 * @param message - Error message if value is undefined
 * @returns The defined value
 * @throws Error if value is null or undefined
 *
 * @example
 * const config = requireDefined(state.config, "Config must be initialized");
 */
export function requireDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is required but was undefined'
): T {
  if (!isDefined(value)) {
    throw new Error(message);
  }
  return value;
}

/**
 * Get value or throw an error with context
 * Similar to requireDefined but allows custom error factory
 *
 * @param value - Value to check
 * @param errorFactory - Function to create error with context
 * @returns The defined value
 */
export function requireValue<T, E extends Error>(
  value: T | null | undefined,
  errorFactory: () => E
): T {
  if (!isDefined(value)) {
    throw errorFactory();
  }
  return value;
}

/**
 * Get value or return a default
 * Prefer this over `||` when falsy values (0, "", false) are valid
 *
 * @param value - Value that might be null/undefined
 * @param defaultValue - Value to return if input is null/undefined
 * @returns The value if defined, otherwise defaultValue
 *
 * @example
 * const timeout = getOrDefault(config.timeout, 30000); // 0 is valid timeout
 *
 * @example
 * const arr = getOrDefault(config.items, []); // Returns string[] correctly
 */
export function getOrDefault<T, D>(value: T | null | undefined, defaultValue: D): T {
  return (isDefined(value) ? value : defaultValue) as T;
}

/**
 * Get value or compute a default lazily
 * Use when default computation is expensive
 *
 * @param value - Value that might be null/undefined
 * @param defaultFactory - Function to compute default value
 * @returns The value if defined, otherwise computed defaultValue
 *
 * @example
 * const cache = getOrCompute(cacheMap.get(key), () => expensiveLookup(key));
 */
export function getOrCompute<T, D>(value: T | null | undefined, defaultFactory: () => D): T | D {
  return isDefined(value) ? value : defaultFactory();
}

/**
 * Coalesce multiple values, returning the first defined one
 * Useful for fallback chains
 *
 * @param values - Values to check in order
 * @returns First defined value, or undefined if all are null/undefined
 *
 * @example
 * const username = coalesce(
 *   config.username,
 *   environment.USERNAME,
 *   "default_user"
 * );
 */
export function coalesce<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (isDefined(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Check if array is not empty
 * @param arr - Array to check
 * @returns true if array exists and has length > 0
 */
export function isNonEmptyArray<T>(arr: T[] | null | undefined): arr is T[] {
  return isDefined(arr) && arr.length > 0;
}

/**
 * Assert that a condition is true, throwing if false
 * Use for runtime invariants
 *
 * @param condition - Condition that should be true
 * @param message - Error message if condition is false
 *
 * @example
 * assert(state.connected, "Must be connected before sending");
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
