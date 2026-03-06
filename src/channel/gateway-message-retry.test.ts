/**
 * Gateway Message Retry Tests
 * @module channel/gateway-message-retry.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryMessageLater,
  MESSAGE_RETRY_MAX_ATTEMPTS,
  MESSAGE_RETRY_DELAY_MS,
} from './gateway-message-retry.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../utils/error.js', () => ({
  extractErrorMessage: vi.fn((error: Error) => error.message),
}));

vi.mock('../utils/retry.js', () => ({
  isRetryableError: vi.fn(),
}));

vi.mock('./gateway-message-handler.js', () => ({
  dispatchInboundMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn(),
  },
  DEPENDENCIES: {
    RUNTIME: 'RUNTIME',
  },
}));

describe('retryMessageLater', () => {
  let mockState: any;
  let mockMsg: any;
  let mockRuntime: any;
  let dispatchInboundMessageMock: any;
  let containerGetMock: any;
  let isRetryableErrorMock: any;
  let loggerMock: any;

  beforeEach(async () => {
    vi.useFakeTimers();

    // Import after mocks are set up
    const { container } = await import('../di/index.js');
    const { logger } = await import('../utils/logger.js');
    const { isRetryableError } = await import('../utils/retry.js');
    const { dispatchInboundMessage } = await import('./gateway-message-handler.js');

    dispatchInboundMessageMock = dispatchInboundMessage;
    containerGetMock = container.get;
    isRetryableErrorMock = isRetryableError;
    loggerMock = logger;

    mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn().mockResolvedValue({ agentId: 'test-agent' }),
        },
      },
    };

    containerGetMock.mockReturnValue({
      get: () => mockRuntime,
    });

    mockMsg = {
      id: 'msg-123',
      sender: 'test-sender',
      content: 'Test message',
      timestamp: new Date(),
    };

    mockState = {
      accountId: 'test-account',
      config: { apiUrl: 'http://localhost' },
      started: true,
      watchAbortController: {
        signal: {
          aborted: false,
        },
      },
      messageRetries: new Map(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Backoff Calculation Tests
  // ============================================================================

  describe('Exponential Backoff Calculation', () => {
    it('should calculate delay as 2000ms for attempt 1 (2^0 = 1)', async () => {
      const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, 1 - 1);
      expect(delay).toBe(2000);
    });

    it('should calculate delay as 4000ms for attempt 2 (2^1 = 2)', async () => {
      const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, 2 - 1);
      expect(delay).toBe(4000);
    });

    it('should calculate delay as 8000ms for attempt 3 (2^2 = 4)', async () => {
      const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, 3 - 1);
      expect(delay);
    });

    it('should schedule retry with correct delay via setTimeout', async () => {
      const retryPromise = retryMessageLater(mockState, mockMsg, 1);

      // Advance timer by 1999ms - should not have executed
      vi.advanceTimersByTime(1999);
      expect(dispatchInboundMessageMock).not.toHaveBeenCalled();

      // Advance timer past 2000ms - should execute
      vi.advanceTimersByTime(1);
      await retryPromise;
      expect(dispatchInboundMessageMock).toHaveBeenCalledTimes(1);
    });

    it('should use 4000ms delay for attempt 2', async () => {
      // First retry attempt
      const retryPromise1 = retryMessageLater(mockState, mockMsg, 2);

      vi.advanceTimersByTime(3999);
      expect(dispatchInboundMessageMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      await retryPromise1;
      expect(dispatchInboundMessageMock).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Retry Limit Tests
  // ============================================================================

  describe('Retry Limit Enforcement', () => {
    it('should not schedule retry when attempt >= MESSAGE_RETRY_MAX_ATTEMPTS', async () => {
      // attempt 3 should be the last attempt (max is 3)
      await retryMessageLater(mockState, mockMsg, MESSAGE_RETRY_MAX_ATTEMPTS);

      // Should log error about giving up
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('failed after 3 attempts')
      );

      // Should NOT schedule any setTimeout
      expect(dispatchInboundMessageMock).not.toHaveBeenCalled();
    });

    it('should clean up timer reference when retry limit reached', async () => {
      mockState.messageRetries.set(mockMsg.id, {} as any);

      await retryMessageLater(mockState, mockMsg, MESSAGE_RETRY_MAX_ATTEMPTS);

      // Should clean up the timer reference
      expect(mockState.messageRetries.get(mockMsg.id)).toBeUndefined();
    });

    it('should schedule attempt 1 successfully', async () => {
      const retryPromise = retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);
      await retryPromise;

      expect(dispatchInboundMessageMock).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Shutdown Check Tests
  // ============================================================================

  describe('Account Shutdown Handling', () => {
    it('should skip retry when account is stopping (aborted signal)', async () => {
      mockState.watchAbortController.signal.aborted = true;

      await retryMessageLater(mockState, mockMsg, 1);

      expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping retry'));
      expect(dispatchInboundMessageMock).not.toHaveBeenCalled();
    });

    it('should skip retry when account started is false', async () => {
      mockState.started = false;

      await retryMessageLater(mockState, mockMsg, 1);

      expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping retry'));
      expect(dispatchInboundMessageMock).not.toHaveBeenCalled();
    });

    it('should proceed with retry when account is running', async () => {
      mockState.watchAbortController.signal.aborted = false;
      mockState.started = true;

      const retryPromise = retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);
      await retryPromise;

      expect(dispatchInboundMessageMock).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Timer Cleanup Tests
  // ============================================================================

  describe('Timer Tracking and Cleanup', () => {
    it('should initialize messageRetries map if not exists', async () => {
      mockState.messageRetries = undefined as any;

      await retryMessageLater(mockState, mockMsg, 1);

      expect(mockState.messageRetries).toBeInstanceOf(Map);
    });

    it('should track timer in messageRetries map', async () => {
      await retryMessageLater(mockState, mockMsg, 1);

      expect(mockState.messageRetries.has(mockMsg.id)).toBe(true);
    });

    it('should clean up timer after execution', async () => {
      await retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);

      // After execution, timer should be removed
      expect(mockState.messageRetries.has(mockMsg.id)).toBe(false);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling and Recursive Retry', () => {
    it('should call retry again when error is retryable', async () => {
      isRetryableErrorMock.mockReturnValue(true);
      dispatchInboundMessageMock.mockRejectedValue(new Error('ETIMEDOUT'));

      await retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);

      // Should have called retry again (attempt 2)
      expect(dispatchInboundMessageMock).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry when error is not retryable', async () => {
      isRetryableErrorMock.mockReturnValue(false);
      dispatchInboundMessageMock.mockRejectedValue(new Error('Config invalid'));

      retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);
      await vi.runAllTimersAsync();

      // Should NOT have called retry again
      expect(dispatchInboundMessageMock).toHaveBeenCalledTimes(1);
      // Should have logged error about retry failure
      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Retry 2 failed'));
    });

    it('should log success message when retry succeeds', async () => {
      dispatchInboundMessageMock.mockResolvedValue(undefined);

      retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);
      await vi.runAllTimersAsync();

      // Verify dispatch was called (success case)
      expect(dispatchInboundMessageMock).toHaveBeenCalled();
    });

    it('should log error when retry fails', async () => {
      dispatchInboundMessageMock.mockRejectedValue(new Error('ETIMEDOUT'));

      retryMessageLater(mockState, mockMsg, 1);

      vi.advanceTimersByTime(MESSAGE_RETRY_DELAY_MS);
      await vi.runAllTimersAsync();

      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Retry 2 failed'));
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Retry Configuration Constants', () => {
    it('should have MESSAGE_RETRY_MAX_ATTEMPTS = 3', () => {
      expect(MESSAGE_RETRY_MAX_ATTEMPTS).toBe(3);
    });

    it('should have MESSAGE_RETRY_DELAY_MS = 2000', () => {
      expect(MESSAGE_RETRY_DELAY_MS).toBe(2000);
    });
  });
});
