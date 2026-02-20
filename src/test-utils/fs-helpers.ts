/**
 * File System Test Utilities
 *
 * Provides utilities for working with temporary files and directories in tests.
 * Uses Node.js built-in fs and os modules - no external dependencies required.
 *
 * @example
 * ```ts
 * import { createTempDir, withTempDir } from './test-utils/fs-helpers.js';
 *
 * // Manual cleanup
 * const tempDir = await createTempDir();
 * try {
 *   await writeFile(join(tempDir, 'test.txt'), 'content');
 *   // test file operations
 * } finally {
 *   await cleanupTempDir(tempDir);
 * }
 *
 * // Automatic cleanup
 * await withTempDir(async (dir) => {
 *   await writeFile(join(dir, 'test.txt'), 'content');
 *   // automatically cleaned up after function returns
 * });
 * ```
 */

import { mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Default prefix for temporary directories
 */
const TEMP_DIR_PREFIX = 'ztm-test-';

/**
 * Create a temporary directory
 *
 * Creates a uniquely named temporary directory in the OS temp directory.
 * The directory will persist until explicitly cleaned up.
 *
 * @param prefix - Optional prefix for the directory name (default: 'ztm-test-')
 * @returns Promise resolving to the absolute path of the created directory
 *
 * @example
 * ```ts
 * const tempDir = await createTempDir();
 * console.log(tempDir); // /var/folders/.../ztm-test-123456
 * ```
 */
export async function createTempDir(prefix: string = TEMP_DIR_PREFIX): Promise<string> {
  const uniqueId = randomBytes(8).toString('hex');
  const dir = join(tmpdir(), `${prefix}${uniqueId}`);

  await mkdir(dir, { recursive: true });

  return dir;
}

/**
 * Clean up a temporary directory
 *
 * Recursively deletes a directory and all its contents.
 * Safe to call even if the directory doesn't exist.
 *
 * @param dir - Path to the directory to clean up
 * @returns Promise that resolves when cleanup is complete
 *
 * @example
 * ```ts
 * const tempDir = await createTempDir();
 * try {
 *   // do work
 * } finally {
 *   await cleanupTempDir(tempDir);
 * }
 * ```
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    const cause = error as { code?: string };
    if (cause.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Execute a callback with a temporary directory
 *
 * Creates a temporary directory, passes it to the callback,
 * and automatically cleans it up when the callback completes.
 *
 * @param fn - Async function to execute with the temp directory path
 * @param prefix - Optional prefix for the directory name
 * @returns Promise resolving to the return value of the callback
 *
 * @example
 * ```ts
 * const result = await withTempDir(async (dir) => {
 *   const filePath = join(dir, 'test.json');
 *   await writeFile(filePath, JSON.stringify({ test: 'data' }));
 *   const content = await readFile(filePath, 'utf-8');
 *   return JSON.parse(content);
 * });
 * // dir is automatically cleaned up here
 * ```
 */
export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
  prefix: string = TEMP_DIR_PREFIX
): Promise<T> {
  const dir = await createTempDir(prefix);

  try {
    return await fn(dir);
  } finally {
    await cleanupTempDir(dir);
  }
}

/**
 * Create a test configuration file
 *
 * Creates a JSON file in the specified directory with the given content.
 * Useful for testing configuration loading and validation.
 *
 * @param dir - Directory to create the file in
 * @param config - Configuration object to serialize to JSON
 * @param filename - Name of the file to create (default: 'config.json')
 * @returns Promise resolving to the absolute path of the created file
 *
 * @example
 * ```ts
 * await withTempDir(async (dir) => {
 *   const configPath = await createTestConfigFile(dir, {
 *     agentUrl: 'http://localhost:8080',
 *     dmPolicy: 'allow'
 *   });
 *   // Test loading configuration from configPath
 * });
 * ```
 */
export async function createTestConfigFile(
  dir: string,
  config: unknown,
  filename: string = 'config.json'
): Promise<string> {
  const filePath = join(dir, filename);
  const json = JSON.stringify(config, null, 2);

  await writeFile(filePath, json, 'utf-8');

  return filePath;
}

/**
 * Create a test state file
 *
 * Creates a state file for testing persistence scenarios.
 *
 * @param dir - Directory to create the file in
 * @param state - State object to serialize
 * @param filename - Name of the file to create (default: 'state.json')
 * @returns Promise resolving to the absolute path of the created file
 */
export async function createTestStateFile<T>(
  dir: string,
  state: T,
  filename: string = 'state.json'
): Promise<string> {
  const filePath = join(dir, filename);
  const json = JSON.stringify(state, null, 2);

  await writeFile(filePath, json, 'utf-8');

  return filePath;
}

/**
 * Verify file exists and return its stats
 *
 * @param filePath - Path to the file to check
 * @returns Promise resolving to file stats, or null if file doesn't exist
 *
 * @example
 * ```ts
 * const stats = await checkFileExists('/path/to/file');
 * if (stats) {
 *   console.log(`File size: ${stats.size}`);
 * }
 * ```
 */
export async function checkFileExists(filePath: string): Promise<ReturnType<typeof stat> | null> {
  try {
    return await stat(filePath);
  } catch (error) {
    const cause = error as { code?: string };
    if (cause.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read and parse a JSON file
 *
 * @param filePath - Path to the JSON file
 * @returns Promise resolving to the parsed JSON content
 * @throws Error if file doesn't exist or contains invalid JSON
 *
 * @example
 * ```ts
 * const config = await readJSONFile('/path/to/config.json');
 * console.log(config.agentUrl);
 * ```
 */
export async function readJSONFile<T = unknown>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write an object to a JSON file
 *
 * @param filePath - Path to write the file to
 * @param data - Object to serialize to JSON
 * @param spaces - Number of spaces for indentation (default: 2)
 * @returns Promise that resolves when the file is written
 */
export async function writeJSONFile(
  filePath: string,
  data: unknown,
  spaces: number = 2
): Promise<void> {
  const json = JSON.stringify(data, null, spaces);
  await writeFile(filePath, json, 'utf-8');
}

/**
 * Create a corrupted JSON file for testing error scenarios
 *
 * Creates a file with invalid JSON content.
 *
 * @param dir - Directory to create the file in
 * @param filename - Name of the file to create (default: 'corrupted.json')
 * @returns Promise resolving to the absolute path of the created file
 *
 * @example
 * ```ts
 * await withTempDir(async (dir) => {
 *   const corruptedPath = await createCorruptedJSONFile(dir);
 *   // Test that loading this file handles the error gracefully
 *   await expect(loadConfig(corruptedPath)).rejects.toThrow();
 * });
 * ```
 */
export async function createCorruptedJSONFile(
  dir: string,
  filename: string = 'corrupted.json'
): Promise<string> {
  const filePath = join(dir, filename);
  await writeFile(filePath, '{ invalid json content', 'utf-8');
  return filePath;
}

/**
 * Create a file with specific permissions for testing permission errors
 *
 * @param dir - Directory to create the file in
 * @param mode - File mode (e.g., 0o444 for read-only)
 * @param filename - Name of the file to create (default: 'restricted.json')
 * @returns Promise resolving to the absolute path of the created file
 *
 * @example
 * ```ts
 * await withTempDir(async (dir) => {
 *   const readOnlyPath = await createRestrictedFile(dir, 0o444);
 *   // Test that writing to this file fails
 *   await expect(writeFile(readOnlyPath, 'data')).rejects.toThrow();
 * });
 * ```
 */
export async function createRestrictedFile(
  dir: string,
  mode: number,
  filename: string = 'restricted.json'
): Promise<string> {
  const filePath = join(dir, filename);

  // First create the file with content
  await writeFile(filePath, '{}', 'utf-8');

  // Then change permissions using chmod
  const { chmod } = await import('node:fs/promises');
  await chmod(filePath, mode);

  return filePath;
}

/**
 * Count files in a directory
 *
 * @param dir - Directory to count files in
 * @returns Promise resolving to the number of files (excluding directories)
 */
export async function countFiles(dir: string): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });

  return entries.filter(entry => entry.isFile()).length;
}

/**
 * Get directory size in bytes
 *
 * @param dir - Directory to measure
 * @returns Promise resolving to the total size in bytes
 */
export async function getDirectorySize(dir: string): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });

  let totalSize = 0;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isFile()) {
      const stats = await stat(fullPath);
      totalSize += stats.size;
    } else if (entry.isDirectory()) {
      totalSize += await getDirectorySize(fullPath);
    }
  }

  return totalSize;
}

/**
 * Create multiple temporary directories for testing multi-account scenarios
 *
 * @param count - Number of directories to create
 * @param prefix - Optional prefix for directory names
 * @returns Promise resolving to an array of directory paths
 *
 * @example
 * ```ts
 * const dirs = await createTempDirs(3);
 * try {
 *   // Test multi-account isolation
 * } finally {
 *   await Promise.all(dirs.map(cleanupTempDir));
 * }
 * ```
 */
export async function createTempDirs(
  count: number,
  prefix: string = TEMP_DIR_PREFIX
): Promise<string[]> {
  const dirs: string[] = [];

  for (let i = 0; i < count; i++) {
    dirs.push(await createTempDir(`${prefix}${i}-`));
  }

  return dirs;
}
