# Phase 2: Security & Performance Review

## Security Findings

### High Severity (3 issues)

| Issue | CWE | Location | Description |
|-------|------|----------|-------------|
| Private Key Storage Without Encryption | CWE-311 | `src/connectivity/permit.ts:76` | Permit data with private keys saved as unencrypted JSON |
| No Certificate Validation | CWE-295 | `src/connectivity/permit.ts:46-58` | Only checks field presence, not certificate expiration/chain |
| Insecure Default Configuration | CWE-1188 | `src/config/defaults.ts:12` | HTTP default for agentUrl instead of HTTPS |

### Medium Severity (4 issues)

| Issue | CWE | Location | Description |
|-------|------|----------|-------------|
| Unvalidated Peer Parameter | CWE-20 | `src/api/message-api.ts:45` | Peer used in URL without defense-in-depth validation |
| Insufficient Error Handling | CWE-755 | `src/utils/retry.ts:106-120` | Retry logic too broad, retries auth failures |
| Potential Log Injection | CWE-117 | Multiple files | User input logged without sanitization |
| Missing Rate Limiting | CWE-770 | `src/api/request.ts` | No API rate limiting |

### Low Severity (3 issues)

| Issue | CWE | Location | Description |
|-------|------|----------|-------------|
| Dependency Version Concerns | - | `package.json` | Check for known CVEs |
| Weak Default API Timeout | CWE-400 | `src/config/defaults.ts:22` | 30s timeout × 3 retries = 90s blocking |

### Security Positives
- Input validation with TypeBox schema
- Username normalization
- HTML escaping for XSS protection
- URL validation with control character detection
- TypeScript strict mode

---

## Performance Findings

### High Severity (4 issues)

| Issue | Location | Description |
|-------|----------|-------------|
| Debounced Writes - Data Loss Risk | `src/runtime/store.ts:215-223` | 1-second debounce can lose watermark updates on crash |
| Watch Interval Cleanup | `src/runtime/state.ts:74-84` | Race condition in account removal |
| Race Condition in Watch Loop | `src/messaging/watcher.ts:229-261` | Boolean flag causes skipped iterations |
| Single Point of Failure | `src/messaging/watcher.ts:229-263` | No error recovery if watch loop crashes |

### Medium Severity (7 issues)

| Issue | Location | Description |
|-------|----------|-------------|
| Unbounded pendingPairings Map | `src/runtime/state.ts:40-56` | No TTL-based cleanup |
| Missing allowFrom Cache | `src/messaging/polling.ts:24-31` | Redundant async calls every poll |
| Missing Group Policy Cache | `src/core/group-policy.ts` | Repeated lookups |
| Synchronous File I/O | `src/runtime/store.ts:162-194` | Blocks event loop |
| No Batch Size Limits | `src/messaging/polling.ts:40-93` | Large chat histories cause memory spikes |
| Semaphore with No Timeout | `src/utils/concurrency.ts:22-30` | Infinite wait possible |
| Gateway Responsibility Overload | `src/channel/gateway.ts` | 642 lines, multiple responsibilities |

### Low Severity (2 issues)

| Issue | Location | Description |
|-------|----------|-------------|
| Eager Service Registration | `index.ts:62-66` | Module load time impact |
| No Connection Pooling | `src/api/ztm-api.ts` | Each account creates new HTTP client |

---

## Critical Issues for Phase 3 Context

1. **Security**: Private key encryption and certificate validation are critical for production
2. **Performance**: Watch loop crash recovery is essential for reliability
3. **Data Loss Risk**: MessageStateStore debounce needs write-through for critical updates
