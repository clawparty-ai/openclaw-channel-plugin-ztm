# Authentication Error Sanitization Test Design

> Date: 2026-02-24
> Status: Draft
> Related: CRITICAL-002 (Auth Error Information Leakage)

## Overview

Add test coverage for authentication error sanitization to ensure sensitive information is not leaked through error messages in API responses or logs.

## Problem Statement

**Issue**: No specific tests exist for error message sanitization in authentication flows.

**Current State**:
- `src/utils/retry.ts` has retry logic
- `src/types/errors.ts` defines error types including `ZTMApiError`
- `src/utils/log-sanitize.ts` provides `sanitizeForLog()` function
- **Missing**: No tests verify that auth errors don't leak sensitive information

## Security Context

Authentication errors (401/403) may contain sensitive information:
- Server internal paths and version info
- Database connection errors
- API keys or token fragments
- Internal IP addresses
- Stack traces

This information must be filtered before being logged or returned to users.

## Test Strategy

### 1. Unit Tests - ZTMApiError Sanitization

**File**: `src/types/errors-sanitization.test.ts`

**Tests**:
- `ZTMApiError` should not expose sensitive info in error message for 401
- `ZTMApiError` should not expose sensitive info in error message for 403
- `ZTMApiError` should truncate long response bodies (500 chars)
- `ZTMApiError` should sanitize control characters in response body

### 2. Integration Tests - API Error Response Handling

**File**: `src/api/request.integration.test.ts` (extend existing)

**Tests**:
- 401 Unauthorized response body should be sanitized
- 403 Forbidden response body should be sanitized
- Internal error details should not be exposed

### 3. Log Tests - Error Log Output

**File**: `src/utils/error-sanitization-log.test.ts`

**Tests**:
- Auth errors should be sanitized before logging
- Sensitive response data should not be logged

## Implementation Details

### Test Data

Sensitive data patterns to test against:
```typescript
const sensitivePatterns = [
  'Bearer eyJhbGciOiJIUzI1NiIs',  // Token fragment
  '/etc/passwd',                    // Internal path
  '192.168.1.1',                    // Internal IP
  'mysql://user:pass@localhost',    // DB connection string
  'stack trace: at com.app.Auth',   // Stack trace
];
```

### Expected Behavior

When receiving 401/403 responses:
1. `ZTMApiError.message` should contain generic message only
2. `ZTMApiError.context.responseBodyPreview` should be truncated to 500 chars
3. Control characters should be removed from response body
4. Logged errors should use `sanitizeForLog()` before output

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/types/errors-sanitization.test.ts` | Create |
| `src/api/request.integration.test.ts` | Extend |
| `src/utils/error-sanitization-log.test.ts` | Create |

## Acceptance Criteria

- [ ] Unit tests cover ZTMApiError sanitization
- [ ] Integration tests cover API error handling
- [ ] Log sanitization tests cover error logging
- [ ] All tests pass
- [ ] No sensitive information leakage in test assertions
