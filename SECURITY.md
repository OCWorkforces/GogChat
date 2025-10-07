# Security Policy

## Overview

GChat implements multiple layers of security to protect users from common Electron application vulnerabilities and attacks. This document outlines the security measures in place and how to report security issues.

## Security Features

### 1. Process Isolation

**Context Isolation** (`src/main/windowWrapper.ts:10`)
- ✅ **Enabled**: `contextIsolation: true`
- Prevents renderer process from directly accessing Node.js APIs
- All communication goes through secure contextBridge API
- Eliminates XSS → RCE attack vector

**Sandbox Mode** (`src/main/windowWrapper.ts:12`)
- ✅ **Enabled**: `sandbox: true`
- Adds OS-level process isolation
- Limits system resource access from renderer
- Reduces impact of compromised renderer process

**Node Integration** (`src/main/windowWrapper.ts:11`)
- ✅ **Disabled**: `nodeIntegration: false`
- Renderer process cannot require Node.js modules
- Standard security best practice for Electron apps

### 2. Content Security Policy (CSP)

**Implementation** (`src/main/windowWrapper.ts:28-56`)
- ✅ **Balanced CSP** applied to main frame only
- Allows Google Chat full functionality while blocking dangerous content
- Applied selectively to prevent interference with Google Chat features
- `object-src 'none'` blocks plugins and dangerous embeds
- `base-uri 'self'` prevents base tag injection

**Policy Details:**
```
default-src: * (allows all sources for Google Chat functionality)
script-src: * with unsafe-inline/eval (required by Google Chat)
style-src: * with unsafe-inline (required by Google Chat)
object-src: none (blocks plugins and embeds)
base-uri: self (prevents base injection)
```

**Note:** CSP is intentionally permissive to support Google Chat's complex web application. Primary security comes from process isolation, sandbox mode, and input validation layers.

### 3. Input Validation & Sanitization

**IPC Message Validation** (`src/shared/validators.ts`)
- ✅ All IPC messages validated before processing
- Type checking and bounds validation
- URL sanitization with protocol whitelist
- HTML entity encoding for string outputs

**Validators:**
- `validateUnreadCount()` - Numeric bounds [0-9999], NaN protection
- `validateFaviconURL()` - Protocol check, length limit, URL parsing
- `validateExternalURL()` - Protocol whitelist, credential stripping, dangerous pattern blocking
- `validateBoolean()` - Type coercion with strict validation
- `validateString()` - Length limits, type checking

### 4. Rate Limiting

**IPC Rate Limiter** (`src/main/utils/rateLimiter.ts`)
- ✅ Prevents IPC flooding and DoS attacks
- Per-channel rate limits (configurable)
- Default: 10 messages/second
- Stricter limits for sensitive channels:
  - `unreadCount`: 5/sec
  - `faviconChanged`: 5/sec
  - `checkIfOnline`: 1/sec
  - `notificationClicked`: 5/sec
- Auto-cleanup of old entries prevents memory leaks

### 5. External Content Handling

**URL Sanitization** (`src/main/features/externalLinks.ts`)
- ✅ All external URLs validated before opening
- Protocol whitelist: `http:`, `https:` only
- Credential stripping (removes username/password)
- Dangerous pattern blocking:
  - `javascript:` URIs
  - `data:` URIs
  - `vbscript:` URIs
  - `file:` URIs
  - `about:` URIs
- Domain whitelist for Google services

**Shell Execution Protection:**
- `shell.openExternal()` only called with sanitized URLs
- Runs in `setImmediate()` to prevent blocking
- Full error handling and logging

### 6. Certificate Pinning

**Implementation** (`src/main/features/certificatePinning.ts`)
- ✅ Validates SSL certificates for Google domains
- Prevents Man-in-the-Middle (MITM) attacks
- Trusted certificate authorities:
  - Google Trust Services (GTS)
  - GlobalSign (Google's CA partner)
- Certificate validity period verification
- Applies to all Google-owned domains

**Pinned Domains:**
- `google.com` and all subdomains
- `mail.google.com`
- `chat.google.com`
- `accounts.google.com`
- `googleapis.com`
- `gstatic.com`
- `googleusercontent.com`

### 7. Data Encryption at Rest

**Store Encryption** (`src/main/config.ts`)
- ✅ All configuration data encrypted using AES-256-GCM
- Encryption key derived from app-specific data
- Protects user preferences and window state
- electron-store handles encryption transparently

**What's Encrypted:**
- Window position and size
- User preferences (auto-launch, auto-update, etc.)
- Application state

### 8. Permission Management

**Permission Handler** (`src/main/windowWrapper.ts:56-67`)
- ✅ Restrictive permission model
- Only allowed permissions:
  - `notifications` - For message notifications
  - `media` - For voice/video calls
  - `mediaKeySystem` - For media playback
  - `geolocation` - For location sharing (if used)
- All other permissions denied by default
- All requests logged for audit

### 9. Secure Communication

**contextBridge API** (`src/preload/index.ts:16-64`)
- ✅ Secure bridge between renderer and main process
- No direct IPC access from renderer
- Input validation at bridge layer
- Type-safe API with TypeScript
- Cleanup functions prevent memory leaks

**Exposed API:**
```typescript
window.gchat {
  sendUnreadCount(count: number)
  sendFaviconChanged(href: string)
  sendNotificationClicked()
  checkIfOnline()
  onSearchShortcut(callback)
  onOnlineStatus(callback)
}
```

### 10. Error Handling & Logging

**Comprehensive Error Boundaries:**
- All features wrapped in try-catch blocks
- Errors logged with electron-log
- Sensitive data not included in logs
- Graceful degradation on feature failures

**Security Logging:**
- Rate limit violations
- Permission denials
- Certificate validation failures
- URL sanitization blocks
- IPC validation failures

## Security Audit Checklist

- [x] Context isolation enabled
- [x] Sandbox mode enabled
- [x] Node integration disabled
- [x] Content Security Policy implemented
- [x] Input validation on all IPC messages
- [x] Rate limiting on IPC channels
- [x] URL sanitization for external links
- [x] Certificate pinning for Google domains
- [x] Data encryption at rest
- [x] Restrictive permission handler
- [x] Secure contextBridge API
- [x] No remote module usage
- [x] webSecurity enabled
- [x] allowRunningInsecureContent disabled
- [x] No eval() in application code
- [x] Dependencies audited (0 vulnerabilities)
- [x] Error handling throughout
- [x] Security logging in place

## Known Limitations

### 1. Google Chat Requirements
- **Permissive CSP**: Required to support Google Chat's complex web application
- **`unsafe-inline` and `unsafe-eval`**: Required by Google Chat's JavaScript framework
- CSP is balanced to allow functionality while blocking dangerous content (plugins, base injection)
- Primary security relies on process isolation, sandbox mode, and input validation

### 2. Notification Override Removed
- Native Electron notification handling used instead
- Previous approach required `contextIsolation: false` (insecure)
- Current approach is more secure but slightly less customizable

## Reporting Security Issues

If you discover a security vulnerability, please report it by:

1. **DO NOT** create a public GitHub issue
2. Email security details to the repository maintainers
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for fixes.

## Security Updates

- We regularly audit dependencies for vulnerabilities
- Security patches are prioritized and released quickly
- Users are notified of critical security updates via the built-in update mechanism

## Best Practices for Users

1. **Keep Updated**: Always use the latest version
2. **Verify Source**: Only download from official sources
3. **Review Permissions**: Check what permissions are requested
4. **Monitor Logs**: Review application logs for suspicious activity
5. **Report Issues**: Report any unusual behavior immediately

## Security Contacts

For security-related questions or concerns:
- GitHub: Create a private security advisory
- Repository: https://github.com/CCWorkforce/GChat

## Version

This security policy applies to GChat version 3.0.6 and later.

Last Updated: 2025-10-07
