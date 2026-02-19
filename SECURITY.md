# Security Policy

This document outlines the security policy for the ZTM Chat Channel Plugin for OpenClaw.

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2026.x  | :white_check_mark: |
| < 2026  | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns privately to the maintainers
3. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We aim to acknowledge reports within 48 hours
- **Timeline**: We work to release fixes as quickly as possible, typically within 7 days for critical issues
- **Disclosure**: We appreciate responsible disclosure and will coordinate release timing with reporters

## Security Best Practices

This plugin implements the following security measures:

### Input Validation
- All user inputs are validated before processing
- Path traversal protection for file operations
- XSS prevention through HTML escaping of message content
- Parameter validation to prevent injection attacks

### Authentication & Authorization
- DM policy enforcement: `allow`, `deny`, or `pairing` modes
- Group permissions: `all_members`, `only_mentioned`, `admins`
- Pairing request validation with expiration (1 hour)

### Data Handling
- Message watermarks for deduplication
- Secure file path validation
- Encrypted communication via ZTM Agent API

### Dependencies
- Regular dependency updates via Dependabot
- Security scanning in CI/CD pipeline
- TypeScript strict mode enabled

## Security Updates

- Security fixes are released as patch versions
- Critical security issues may trigger immediate hotfix releases
- All security releases are documented in CHANGELOG.md

## Scope

This security policy applies to:
- The plugin code in this repository
- Communication between the plugin and ZTM Agent API

This policy does NOT cover:
- ZTM Agent itself (see ZTM Agent documentation)
- Underlying network transport security
- End-user device security

## Contact

For security-related inquiries, please contact the project maintainers through the project's GitHub repository.

---

Last updated: 2026-02-20
