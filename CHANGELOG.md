# Changelog

All notable changes to Browser Interceptor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-14

### Added

- Initial release of Browser Interceptor
- **Token Interception**
  - Authorization header capture (Bearer tokens, API keys)
  - Support for common auth header patterns (Authorization, X-API-Key, etc.)
- **Cookie Extraction**
  - Session cookie capture
  - Auth cookie detection (session_id, auth_token, jwt, etc.)
- **Query Parameter Capture**
  - URL parameter extraction (api_key, access_token, token, etc.)
- **Custom Rules**
  - User-defined extraction rules
  - Pattern matching for custom APIs
- **Token Rotation Detection**
  - Automatic detection when tokens are refreshed
  - Rotation count tracking
  - Previous token history
- **Popup Interface**
  - View all captured tokens
  - Search and filter functionality
  - One-click copy (raw value, header format, cURL command)
  - Token expiration indicators
- **Domain Filtering**
  - Allowlist for specific domains
  - Blocklist to exclude domains
  - Wildcard pattern support
- **Storage Management**
  - Local-only storage (chrome.storage.local)
  - Automatic cleanup of old entries
  - Export/import functionality
- **Security**
  - 100% local operation - no external network calls
  - No analytics or telemetry
  - Transparent, auditable source code

### Security

- All data stored locally in chrome.storage.local
- No external network requests
- No data transmission of any kind

## [Unreleased]

### Planned

- Firefox extension support
- Dark mode UI
- Bulk token export
- Token grouping by domain
