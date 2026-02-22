/**
 * @fileoverview File operations API for ZTM Chat
 * @module api/file-api
 * Provides file metadata tracking for change detection
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMLogger, RequestHandler } from './request.js';
import { containsPathTraversal } from '../utils/validation.js';

// Maximum number of tracked files to prevent memory leaks
const MAX_TRACKED_FILES = 500;

/**
 * Create file operations API for tracking file metadata changes
 *
 * @param _config - ZTM Chat configuration (unused, kept for API consistency)
 * @param _request - HTTP request handler (unused, kept for API consistency)
 * @param _logger - Logger instance (unused, kept for API consistency)
 * @returns File API interface with methods for tracking file metadata
 */
export function createFileApi(
  _config: ZTMChatConfig,
  _request: RequestHandler,
  _logger: ZTMLogger
) {
  // Track both time and size for each file to detect changes in append-only files
  interface FileMetadata {
    time: number;
    size: number;
  }
  const lastSeenFiles = new Map<string, FileMetadata>();

  // Clean up oldest entries when reaching the limit to prevent memory leaks
  function trimFileMetadata(): void {
    while (lastSeenFiles.size > MAX_TRACKED_FILES) {
      const firstKey = lastSeenFiles.keys().next().value;
      if (firstKey) {
        lastSeenFiles.delete(firstKey);
      } else {
        break;
      }
    }
  }

  return {
    /**
     * Seed file metadata from external source
     * Validates file paths to prevent path traversal attacks
     *
     * @param metadata - Record mapping file paths to their metadata (time and size)
     */
    seedFileMetadata(metadata: Record<string, { time: number; size: number }>): void {
      for (const [filePath, meta] of Object.entries(metadata)) {
        // Validate file path to prevent path traversal attacks
        if (containsPathTraversal(filePath)) {
          _logger.warn?.(`Rejected file path with traversal pattern: ${filePath}`);
          continue;
        }

        const current = lastSeenFiles.get(filePath);
        if (!current || meta.time > current.time || meta.size > current.size) {
          lastSeenFiles.set(filePath, meta);
        }
      }
      trimFileMetadata();
    },

    /**
     * Export file metadata for external use
     *
     * @returns Record mapping file paths to their metadata (time and size)
     */
    exportFileMetadata(): Record<string, { time: number; size: number }> {
      const result: Record<string, { time: number; size: number }> = {};
      for (const [filePath, metadata] of lastSeenFiles) {
        result[filePath] = metadata;
      }
      return result;
    },
  };
}
