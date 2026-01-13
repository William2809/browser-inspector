// Query Parameter Handler - extracts API keys and tokens from URL query strings

import { BaseHandler } from './base-handler.js';

export class QueryParamHandler extends BaseHandler {
  constructor(config = {}) {
    super(config);
    this.name = 'query-param';
    this.displayName = 'Query Param';

    // Default query parameter names to look for
    this.paramPatterns = config.paramPatterns || [
      'api_key',
      'apikey',
      'api-key',
      'key',
      'token',
      'access_token',
      'auth_token',
      'auth',
      'secret',
      'api_secret',
      'client_id',
      'client_secret'
    ];

    this.urlPatterns = config.urlPatterns || [];
  }

  matches(details) {
    const parsedUrl = this.parseUrl(details.url);
    if (!parsedUrl) return false;

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

    // Check if URL has any target params
    for (const pattern of this.paramPatterns) {
      if (parsedUrl.searchParams.has(pattern)) {
        return true;
      }
    }

    return false;
  }

  extract(details) {
    const parsedUrl = this.parseUrl(details.url);
    if (!parsedUrl) return null;

    const extracted = {};
    let primaryParam = null;

    for (const pattern of this.paramPatterns) {
      const value = parsedUrl.searchParams.get(pattern);
      if (value) {
        extracted[pattern] = value;

        // Prioritize certain param names
        const priority = ['api_key', 'apikey', 'token', 'access_token', 'key'];
        if (!primaryParam || priority.includes(pattern)) {
          primaryParam = { name: pattern, value };
        }
      }
    }

    if (!primaryParam) return null;

    return {
      type: 'query-param',
      value: primaryParam.value,
      paramName: primaryParam.name,
      allParams: extracted,
      source: {
        url: details.url,
        domain: parsedUrl.hostname,
        method: details.method,
        tabId: details.tabId
      }
    };
  }
}
