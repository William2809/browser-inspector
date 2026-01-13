// Cookie Handler - extracts session/auth cookies from requests

import { BaseHandler } from './base-handler.js';

export class CookieHandler extends BaseHandler {
  constructor(config = {}) {
    super(config);
    this.name = 'cookie';
    this.displayName = 'Session Cookie';

    // Default cookie names to look for
    this.cookiePatterns = config.cookiePatterns || [
      'session',
      'sessionid',
      'session_id',
      'sid',
      'auth',
      'auth_token',
      'token',
      'jwt',
      'access_token',
      'refresh_token',
      '__session',
      '_session',
      'connect.sid',
      'PHPSESSID',
      'JSESSIONID',
      'ASP.NET_SessionId'
    ];

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

    const cookieHeader = this.getHeader(details.requestHeaders, 'cookie');
    if (!cookieHeader) return false;

    // Check if any target cookies exist
    const cookies = this.parseCookies(cookieHeader);
    return Object.keys(cookies).some(name =>
      this.cookiePatterns.some(pattern =>
        name.toLowerCase().includes(pattern.toLowerCase())
      )
    );
  }

  extract(details) {
    const cookieHeader = this.getHeader(details.requestHeaders, 'cookie');
    if (!cookieHeader) return null;

    const cookies = this.parseCookies(cookieHeader);
    const extracted = {};
    let primaryCookie = null;

    for (const [name, value] of Object.entries(cookies)) {
      const matchedPattern = this.cookiePatterns.find(pattern =>
        name.toLowerCase().includes(pattern.toLowerCase())
      );

      if (matchedPattern) {
        extracted[name] = value;

        // Prioritize certain cookie names
        const priority = ['session', 'auth', 'token', 'jwt', 'access_token'];
        if (!primaryCookie || priority.some(p => name.toLowerCase().includes(p))) {
          primaryCookie = { name, value };
        }
      }
    }

    if (!primaryCookie) return null;

    const parsedUrl = this.parseUrl(details.url);

    return {
      type: 'cookie',
      value: primaryCookie.value,
      cookieName: primaryCookie.name,
      allCookies: extracted,
      source: {
        url: details.url,
        domain: parsedUrl?.hostname || 'unknown',
        method: details.method,
        tabId: details.tabId
      }
    };
  }

  parseCookies(cookieHeader) {
    const cookies = {};
    const pairs = cookieHeader.split(';');

    for (const pair of pairs) {
      const [name, ...valueParts] = pair.trim().split('=');
      if (name) {
        cookies[name.trim()] = valueParts.join('=');
      }
    }

    return cookies;
  }
}
