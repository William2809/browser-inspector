// Custom Handler - user-defined extraction rules

import { BaseHandler } from './base-handler.js';

export class CustomHandler extends BaseHandler {
  constructor(config = {}) {
    super(config);
    this.name = config.name || 'custom';
    this.displayName = config.displayName || 'Custom Rule';
    this.rule = config.rule || {};
  }

  matches(details) {
    const { urlPattern, method } = this.rule;

    // Check URL pattern
    if (urlPattern) {
      const url = details.url.toLowerCase();
      if (urlPattern.includes('*')) {
        const regex = new RegExp(urlPattern.replace(/\*/g, '.*'), 'i');
        if (!regex.test(url)) return false;
      } else if (!url.includes(urlPattern.toLowerCase())) {
        return false;
      }
    }

    // Check method
    if (method && details.method.toUpperCase() !== method.toUpperCase()) {
      return false;
    }

    return true;
  }

  extract(details) {
    const { extractFrom, extractKey, extractPattern } = this.rule;
    let value = null;

    switch (extractFrom) {
      case 'header':
        value = this.getHeader(details.requestHeaders, extractKey);
        break;

      case 'cookie':
        value = this.getCookie(details.requestHeaders, extractKey);
        break;

      case 'query':
        const parsedUrl = this.parseUrl(details.url);
        if (parsedUrl) {
          value = parsedUrl.searchParams.get(extractKey);
        }
        break;

      case 'path':
        const url = this.parseUrl(details.url);
        if (url && extractPattern) {
          const regex = new RegExp(extractPattern);
          const match = url.pathname.match(regex);
          if (match) {
            value = match[1] || match[0];
          }
        }
        break;
    }

    if (!value) return null;

    const parsedUrl = this.parseUrl(details.url);

    return {
      type: 'custom',
      value,
      ruleName: this.name,
      extractFrom,
      extractKey,
      source: {
        url: details.url,
        domain: parsedUrl?.hostname || 'unknown',
        method: details.method,
        tabId: details.tabId
      }
    };
  }
}

// Factory function to create custom handlers from saved rules
export function createCustomHandlers(rules = []) {
  return rules.map((rule, index) => {
    return new CustomHandler({
      name: rule.name || `custom-${index}`,
      displayName: rule.displayName || rule.name || `Custom Rule ${index + 1}`,
      rule
    });
  });
}
