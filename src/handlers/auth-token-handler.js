// Auth Token Handler - extracts authorization tokens from headers

import { BaseHandler } from './base-handler.js';

export class AuthTokenHandler extends BaseHandler {
  constructor(config = {}) {
    super(config);
    this.name = 'auth-token';
    this.displayName = 'Auth Token';

    // Default patterns for auth headers
    this.headerPatterns = config.headerPatterns || [
      'authorization',
      'x-auth-token',
      'x-access-token',
      'x-api-key',
      'api-key',
      'x-token',
      'token',
      'x-session-token',
      'x-csrf-token',
      'x-xsrf-token'
    ];

    // URL patterns to monitor (empty = all URLs)
    this.urlPatterns = config.urlPatterns || [];
  }

  matches(details) {
    // Check URL patterns if specified
    if (this.urlPatterns.length > 0) {
      const url = details.url.toLowerCase();
      const matchesUrl = this.urlPatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
          return regex.test(url);
        }
        return url.includes(pattern.toLowerCase());
      });
      if (!matchesUrl) return false;
    }

    // Check if request has any auth headers
    const headers = details.requestHeaders || [];
    return headers.some(h =>
      this.headerPatterns.includes(h.name.toLowerCase())
    );
  }

  extract(details) {
    const headers = details.requestHeaders || [];
    const extracted = {};
    let primaryToken = null;

    for (const header of headers) {
      const headerName = header.name.toLowerCase();
      if (this.headerPatterns.includes(headerName)) {
        let value = header.value;
        let tokenType = 'raw';

        // Parse Bearer tokens
        if (value.toLowerCase().startsWith('bearer ')) {
          value = value.substring(7);
          tokenType = 'bearer';
        }

        extracted[headerName] = {
          value,
          tokenType,
          originalHeader: header.name
        };

        // Prioritize authorization header as primary
        if (headerName === 'authorization' || !primaryToken) {
          primaryToken = {
            value,
            tokenType,
            headerName: header.name
          };
        }
      }
    }

    if (!primaryToken) return null;

    const parsedUrl = this.parseUrl(details.url);

    return {
      type: 'auth-token',
      value: primaryToken.value,
      tokenType: primaryToken.tokenType,
      headerName: primaryToken.headerName,
      allTokens: extracted,
      source: {
        url: details.url,
        domain: parsedUrl?.hostname || 'unknown',
        method: details.method,
        tabId: details.tabId
      }
    };
  }
}
