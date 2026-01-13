# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser Interceptor is a Chrome Extension (Manifest V3) that intercepts network requests to extract auth tokens for local development use. **All data stays 100% local** - stored only in `chrome.storage.local` with no external network calls.

## Commands

```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Run tests with coverage report
```

To run a single test file:
```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/storage.test.js
```

To install the extension: Load unpacked from `chrome://extensions/` with Developer mode enabled.

## Architecture

### Request Flow

1. **Service Worker** (`src/background/service-worker.js`) intercepts requests via `chrome.webRequest.onBeforeSendHeaders`
2. **HandlerManager** (`src/handlers/index.js`) routes requests through all registered handlers
3. **Handlers** check `matches()` then `extract()` auth data
4. **Storage** (`src/lib/storage.js`) persists to `chrome.storage.local` with rotation detection
5. **Popup** (`src/popup/`) displays captured tokens with copy options

### Handler Pattern

All handlers extend `BaseHandler` and implement:
- `matches(details)` - Returns true if handler should process this request
- `extract(details)` - Returns extracted token object or null

Built-in handlers: `AuthTokenHandler`, `CookieHandler`, `QueryParamHandler`, `CustomHandler`

### Token Identity & Rotation

Tokens are keyed by: `${domain}::${normalizedPath}::${type}::${headerName}`

When same key receives different value → rotation detected → old token moved to expired list.

### Storage Keys

- `capturedData` - Active tokens with rotation metadata
- `expiredTokens` - Previous tokens after rotation (max 50)
- `history` - Capture event log (max 100)
- `config` - Settings including `domainAllowlist`/`domainBlocklist`

## Testing

Tests use Jest with ESM modules. Chrome APIs are mocked in `tests/setup.js`.

Key test helpers (available globally):
- `resetMockStorage()` - Clear storage between tests
- `setMockStorage(data)` - Set initial storage state
- `getMockStorage()` - Get current storage state

## Important Constraints

- **No external network calls** - This is a core security guarantee. Never add fetch/XHR/WebSocket.
- **Local storage only** - All persistence must use `chrome.storage.local`
- Handlers return single objects (not arrays) - primary token plus `allTokens`/`allCookies`/`allParams` for additional matches

---

## Security Rules (must-follow)

- Never print, commit, or write any secrets (tokens, cookies, credentials) into markdown, logs, or code.
- Prefer storing Stockbit token only in Postgres `app_settings` (encrypted). `.env` is for local dev only.
- Any debugging output must redact Authorization headers and bearer tokens.

## Data Engineering Principles

- Start from `docs/plan/erd.md`, implement tables incrementally (small slices → validate → expand).
- Prefer normalized tables and stable IDs:
  - Natural keys for reference data (e.g., `stocks.ticker`, `brokers.code`).
  - UUIDs for snapshots/runs.
- Use **source hashes** to implement "Smart Upsert" and avoid re-writing identical payloads.
- Record lineage: every stored dataset should link to an `ingestion_run`.
- Build ingestion as retryable + idempotent:
  - Exponential backoff, jitter, and bounded concurrency.
  - Keep partial failures visible (status + error summaries).

## Code Quality Principles

- KISS: keep ingestion + schema straightforward; avoid clever abstractions early.
- DRY: extract repeated API/DB logic, but don't over-abstract.
- SOLID: keep modules single-purpose (token vault, Stockbit client, DB writers, UI pages).

## Code Style & Conventions

- TypeScript (strict) in the repo.
- Avoid time-based naming ("new", "improved", "better"). Use purpose-based names.
- Prefer evergreen comments that explain "why".
- When adding UI labels/text, update both `messages/en.json` and `messages/id.json` with the same keys.
- **New non-trivial files** should start with a short 1–2 line header comment describing the purpose.
  - Do not add sweeping header edits to existing files unless already touching them for functional changes.

## File Size Limits

- Component files: max 300 lines. If larger, split into smaller components.
- Logic/hook files: max 400 lines. If larger, split into smaller modules.
- Don't over-split into many tiny files—balance readability with modularity.
