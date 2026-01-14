// Browser Inspector - Handler Tests
// Tests for request interception handlers

import { jest } from '@jest/globals';
import { BaseHandler } from '../src/handlers/base-handler.js';
import { AuthTokenHandler } from '../src/handlers/auth-token-handler.js';
import { CookieHandler } from '../src/handlers/cookie-handler.js';
import { QueryParamHandler } from '../src/handlers/query-param-handler.js';
import { CustomHandler, createCustomHandlers } from '../src/handlers/custom-handler.js';

// Helper to create mock request details
function createMockRequest(overrides = {}) {
  return {
    url: 'https://api.example.com/v1/users',
    method: 'GET',
    requestHeaders: [],
    ...overrides
  };
}

describe('AuthTokenHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new AuthTokenHandler();
  });

  describe('matches', () => {
    it('should match requests with Authorization header', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer token123' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should match requests with X-Auth-Token header', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'X-Auth-Token', value: 'token123' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should match requests with X-API-Key header', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'X-API-Key', value: 'apikey123' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should not match requests without auth headers', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Content-Type', value: 'application/json' }
        ]
      });

      expect(handler.matches(details)).toBe(false);
    });

    it('should be case-insensitive for header names', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'AUTHORIZATION', value: 'Bearer token' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should handle missing request headers gracefully', () => {
      const details = createMockRequest({
        requestHeaders: undefined
      });

      expect(handler.matches(details)).toBe(false);
      expect(handler.extract(details)).toBeNull();
    });

    it('should respect URL pattern filters', () => {
      const patterned = new AuthTokenHandler({
        urlPatterns: ['*://api.example.com/*']
      });
      const matchesDetails = createMockRequest({
        url: 'https://api.example.com/v1/users',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });
      const nonMatchDetails = createMockRequest({
        url: 'https://other.example.com/v1/users',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });

      expect(patterned.matches(matchesDetails)).toBe(true);
      expect(patterned.matches(nonMatchDetails)).toBe(false);
    });

    it('should match non-wildcard URL patterns', () => {
      const patterned = new AuthTokenHandler({
        urlPatterns: ['api.example.com']
      });
      const details = createMockRequest({
        url: 'https://api.example.com/v1/users',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });

      expect(patterned.matches(details)).toBe(true);
    });
  });

  describe('extract', () => {
    it('should extract Bearer token with correct metadata', () => {
      const details = createMockRequest({
        url: 'https://api.myapp.com/data',
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9.test' }
        ]
      });

      const result = handler.extract(details);

      expect(result).not.toBeNull();
      expect(result.type).toBe('auth-token');
      // Note: handler strips "Bearer " prefix and stores raw token
      expect(result.value).toBe('eyJhbGciOiJIUzI1NiJ9.test');
      expect(result.tokenType).toBe('bearer');
      expect(result.source.domain).toBe('api.myapp.com');
    });

    it('should extract Basic auth token', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }
        ]
      });

      const result = handler.extract(details);

      // Note: Basic tokens are kept as-is (not parsed)
      expect(result.tokenType).toBe('raw');
    });

    it('should extract API key from X-API-Key header', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'X-API-Key', value: 'sk_live_abc123' }
        ]
      });

      const result = handler.extract(details);

      expect(result.headerName).toBe('X-API-Key');
      expect(result.value).toBe('sk_live_abc123');
    });

    it('should track all auth headers in allTokens', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer token1' },
          { name: 'X-API-Key', value: 'apikey123' }
        ]
      });

      const result = handler.extract(details);

      // Returns primary token but allTokens contains both
      expect(result).not.toBeNull();
      expect(result.allTokens).toBeDefined();
      expect(Object.keys(result.allTokens).length).toBe(2);
    });

    it('should return null when no auth headers are present', () => {
      const details = createMockRequest({
        requestHeaders: [{ name: 'Content-Type', value: 'application/json' }]
      });

      expect(handler.extract(details)).toBeNull();
    });

    it('should fall back to unknown domain on invalid URLs', () => {
      const details = createMockRequest({
        url: 'http://',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token1' }]
      });

      const result = handler.extract(details);
      expect(result.source.domain).toBe('unknown');
    });

    it('should keep primary token when authorization header is not present', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'X-API-Key', value: 'apikey123' },
          { name: 'X-Auth-Token', value: 'secondary' }
        ]
      });

      const result = handler.extract(details);
      expect(result.headerName).toBe('X-API-Key');
    });
  });
});

describe('CookieHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new CookieHandler();
  });

  describe('matches', () => {
    it('should match requests with session cookie', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'session=abc123; other=value' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should match requests with auth cookie', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'auth_token=xyz789' }
        ]
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should not match requests with unrelated cookies', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'tracking=123; preferences=dark' }
        ]
      });

      expect(handler.matches(details)).toBe(false);
    });

    it('should not match requests without Cookie header', () => {
      const details = createMockRequest({
        requestHeaders: []
      });

      expect(handler.matches(details)).toBe(false);
    });

    it('should respect URL pattern filters', () => {
      const patterned = new CookieHandler({
        urlPatterns: ['https://app.example.com/*']
      });
      const details = createMockRequest({
        url: 'https://app.example.com/api',
        requestHeaders: [{ name: 'Cookie', value: 'session=abc' }]
      });
      const otherDetails = createMockRequest({
        url: 'https://other.example.com/api',
        requestHeaders: [{ name: 'Cookie', value: 'session=abc' }]
      });

      expect(patterned.matches(details)).toBe(true);
      expect(patterned.matches(otherDetails)).toBe(false);
    });

    it('should match non-wildcard URL patterns', () => {
      const patterned = new CookieHandler({
        urlPatterns: ['app.example.com']
      });
      const details = createMockRequest({
        url: 'https://app.example.com/api',
        requestHeaders: [{ name: 'Cookie', value: 'session=abc' }]
      });

      expect(patterned.matches(details)).toBe(true);
    });
  });

  describe('extract', () => {
    it('should extract session cookie with metadata', () => {
      const details = createMockRequest({
        url: 'https://app.example.com/api',
        requestHeaders: [
          { name: 'Cookie', value: 'sessionid=sess_abc123xyz' }
        ]
      });

      const result = handler.extract(details);

      expect(result).not.toBeNull();
      expect(result.type).toBe('cookie');
      expect(result.value).toBe('sess_abc123xyz');
      expect(result.cookieName).toBe('sessionid');
    });

    it('should extract JWT cookie', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'jwt=eyJhbGciOiJIUzI1NiJ9.payload.sig' }
        ]
      });

      const result = handler.extract(details);

      expect(result.cookieName).toBe('jwt');
    });

    it('should track all auth cookies in allCookies', () => {
      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'session=abc; auth=xyz; access_token=123' }
        ]
      });

      const result = handler.extract(details);

      expect(result).not.toBeNull();
      expect(result.allCookies).toBeDefined();
      expect(Object.keys(result.allCookies).length).toBeGreaterThanOrEqual(2);
    });

    it('should return null when cookie header is missing', () => {
      const details = createMockRequest({ requestHeaders: [] });
      expect(handler.extract(details)).toBeNull();
    });

    it('should return null when no matching cookies are found', () => {
      const details = createMockRequest({
        requestHeaders: [{ name: 'Cookie', value: 'theme=dark; prefs=1' }]
      });

      expect(handler.extract(details)).toBeNull();
    });

    it('should fall back to unknown domain for invalid URLs', () => {
      const details = createMockRequest({
        url: 'http://',
        requestHeaders: [{ name: 'Cookie', value: 'session=abc' }]
      });

      const result = handler.extract(details);
      expect(result.source.domain).toBe('unknown');
    });

    it('should keep first matching cookie when no priority match exists', () => {
      const patterned = new CookieHandler({
        cookiePatterns: ['alpha', 'beta']
      });
      const details = createMockRequest({
        requestHeaders: [{ name: 'Cookie', value: 'alpha=1; beta=2' }]
      });

      const result = patterned.extract(details);
      expect(result.cookieName).toBe('alpha');
    });

    it('should ignore empty cookie names during parsing', () => {
      const details = createMockRequest({
        requestHeaders: [{ name: 'Cookie', value: '=; session=abc' }]
      });

      const result = handler.extract(details);
      expect(result.cookieName).toBe('session');
    });
  });
});

describe('QueryParamHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new QueryParamHandler();
  });

  describe('matches', () => {
    it('should match URLs with api_key parameter', () => {
      const details = createMockRequest({
        url: 'https://api.example.com/data?api_key=key123'
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should match URLs with access_token parameter', () => {
      const details = createMockRequest({
        url: 'https://api.example.com/data?access_token=token123'
      });

      expect(handler.matches(details)).toBe(true);
    });

    it('should not match URLs without auth parameters', () => {
      const details = createMockRequest({
        url: 'https://api.example.com/data?page=1&limit=10'
      });

      expect(handler.matches(details)).toBe(false);
    });
  });

  describe('extract', () => {
    it('should extract api_key from URL', () => {
      const details = createMockRequest({
        url: 'https://maps.example.com/api?api_key=AIza_secretkey123'
      });

      const result = handler.extract(details);

      expect(result).not.toBeNull();
      expect(result.type).toBe('query-param');
      expect(result.value).toBe('AIza_secretkey123');
      expect(result.paramName).toBe('api_key');
    });

    it('should track all auth params in allParams', () => {
      const details = createMockRequest({
        url: 'https://api.example.com/data?api_key=key1&token=tok1'
      });

      const result = handler.extract(details);

      expect(result).not.toBeNull();
      expect(result.allParams).toBeDefined();
      expect(Object.keys(result.allParams).length).toBe(2);
    });

    it('should return null when no matching params exist', () => {
      const details = createMockRequest({
        url: 'https://api.example.com/data?foo=bar'
      });

      expect(handler.extract(details)).toBeNull();
    });

    it('should prioritize preferred params when multiple match', () => {
      const patterned = new QueryParamHandler({
        paramPatterns: ['client_id', 'token']
      });
      const details = createMockRequest({
        url: 'https://api.example.com/data?client_id=abc&token=def'
      });

      const result = patterned.extract(details);
      expect(result.paramName).toBe('token');
    });

    it('should keep existing primary param when later match is not priority', () => {
      const patterned = new QueryParamHandler({
        paramPatterns: ['token', 'client_id']
      });
      const details = createMockRequest({
        url: 'https://api.example.com/data?token=abc&client_id=def'
      });

      const result = patterned.extract(details);
      expect(result.paramName).toBe('token');
    });

    it('should return false for invalid URLs', () => {
      const details = createMockRequest({
        url: 'http://'
      });

      expect(handler.matches(details)).toBe(false);
      expect(handler.extract(details)).toBeNull();
    });

    it('should honor URL patterns for query parameters', () => {
      const patterned = new QueryParamHandler({
        urlPatterns: ['*://api.myapp.com/*']
      });
      const matchingDetails = createMockRequest({
        url: 'https://api.myapp.com/data?token=abc'
      });
      const nonMatchingDetails = createMockRequest({
        url: 'https://api.other.com/data?token=abc'
      });

      expect(patterned.matches(matchingDetails)).toBe(true);
      expect(patterned.matches(nonMatchingDetails)).toBe(false);
    });

    it('should match non-wildcard URL patterns', () => {
      const patterned = new QueryParamHandler({
        urlPatterns: ['api.myapp.com']
      });
      const details = createMockRequest({
        url: 'https://api.myapp.com/data?token=abc'
      });

      expect(patterned.matches(details)).toBe(true);
    });
  });
});

describe('CustomHandler', () => {
  describe('header extraction', () => {
    it('should extract custom header by name', () => {
      const handler = new CustomHandler({
        name: 'my-custom-auth',
        displayName: 'My Custom Auth',
        rule: {
          extractFrom: 'header',
          extractKey: 'X-Custom-Auth'
        }
      });

      const details = createMockRequest({
        requestHeaders: [
          { name: 'X-Custom-Auth', value: 'custom_token_value' }
        ]
      });

      expect(handler.matches(details)).toBe(true);

      const result = handler.extract(details);
      expect(result).not.toBeNull();
      expect(result.value).toBe('custom_token_value');
    });
  });

  describe('cookie extraction', () => {
    it('should extract specific cookie by name', () => {
      const handler = new CustomHandler({
        name: 'my-app-session',
        displayName: 'My App Session',
        rule: {
          extractFrom: 'cookie',
          extractKey: 'my_app_session'
        }
      });

      const details = createMockRequest({
        requestHeaders: [
          { name: 'Cookie', value: 'my_app_session=sess123; other=val' }
        ]
      });

      expect(handler.matches(details)).toBe(true);

      const result = handler.extract(details);
      expect(result).not.toBeNull();
      expect(result.value).toBe('sess123');
    });
  });

  describe('query param extraction', () => {
    it('should extract specific query parameter', () => {
      const handler = new CustomHandler({
        name: 'custom-api-key',
        displayName: 'Custom API Key',
        rule: {
          extractFrom: 'query',
          extractKey: 'custom_key'
        }
      });

      const details = createMockRequest({
        url: 'https://api.example.com/data?custom_key=mykey123&other=val'
      });

      expect(handler.matches(details)).toBe(true);

      const result = handler.extract(details);
      expect(result).not.toBeNull();
      expect(result.value).toBe('mykey123');
    });

    it('should return null for invalid URLs in query extraction', () => {
      const handler = new CustomHandler({
        rule: {
          extractFrom: 'query',
          extractKey: 'custom_key'
        }
      });

      const details = createMockRequest({
        url: 'http://'
      });

      expect(handler.extract(details)).toBeNull();
    });
  });

  describe('URL pattern matching', () => {
    it('should only match specified URL patterns', () => {
      const handler = new CustomHandler({
        name: 'specific-api',
        displayName: 'Specific API Token',
        rule: {
          urlPattern: '*://api.myapp.com/*',
          extractFrom: 'header',
          extractKey: 'Authorization'
        }
      });

      const matchingDetails = createMockRequest({
        url: 'https://api.myapp.com/v1/data',
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer token' }
        ]
      });

      const nonMatchingDetails = createMockRequest({
        url: 'https://api.other.com/data',
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer token' }
        ]
      });

      expect(handler.matches(matchingDetails)).toBe(true);
      expect(handler.matches(nonMatchingDetails)).toBe(false);
    });
  });

  it('should match non-wildcard URL patterns', () => {
    const handler = new CustomHandler({
      rule: {
        urlPattern: 'api.example.com',
        extractFrom: 'header',
        extractKey: 'Authorization'
      }
    });

    const details = createMockRequest({
      url: 'https://api.example.com/v1/data',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
    });

    expect(handler.matches(details)).toBe(true);
  });

  it('should reject non-matching URL patterns without wildcards', () => {
    const handler = new CustomHandler({
      rule: {
        urlPattern: 'api.example.com',
        extractFrom: 'header',
        extractKey: 'Authorization'
      }
    });

    const details = createMockRequest({
      url: 'https://other.example.com/v1/data',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
    });

    expect(handler.matches(details)).toBe(false);
  });

  describe('method matching', () => {
    it('should enforce HTTP method when configured', () => {
      const handler = new CustomHandler({
        name: 'post-only',
        rule: {
          method: 'POST',
          extractFrom: 'header',
          extractKey: 'Authorization'
        }
      });

      const getDetails = createMockRequest({
        method: 'GET',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });
      const postDetails = createMockRequest({
        method: 'POST',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });

      expect(handler.matches(getDetails)).toBe(false);
      expect(handler.matches(postDetails)).toBe(true);
    });
  });

  describe('path extraction', () => {
    it('should extract path segments using regex', () => {
      const handler = new CustomHandler({
        name: 'path-id',
        rule: {
          extractFrom: 'path',
          extractPattern: '/users/(\\d+)',
          extractKey: 'userId'
        }
      });

      const details = createMockRequest({
        url: 'https://api.example.com/users/42/profile'
      });

      const result = handler.extract(details);
      expect(result.value).toBe('42');
      expect(result.extractFrom).toBe('path');
    });

    it('should return null when no match is found', () => {
      const handler = new CustomHandler({
        name: 'path-id',
        rule: {
          extractFrom: 'path',
          extractPattern: '/users/(\\d+)',
          extractKey: 'userId'
        }
      });

      const details = createMockRequest({
        url: 'https://api.example.com/projects/abc'
      });

      expect(handler.extract(details)).toBeNull();
    });

    it('should use the full match when no capture group is provided', () => {
      const handler = new CustomHandler({
        rule: {
          extractFrom: 'path',
          extractPattern: '/users/\\d+',
          extractKey: 'userPath'
        }
      });

      const details = createMockRequest({
        url: 'https://api.example.com/users/42/profile'
      });

      const result = handler.extract(details);
      expect(result.value).toBe('/users/42');
    });

    it('should return null when extract pattern is missing', () => {
      const handler = new CustomHandler({
        rule: {
          extractFrom: 'path',
          extractKey: 'userPath'
        }
      });

      const details = createMockRequest({
        url: 'https://api.example.com/users/42/profile'
      });

      expect(handler.extract(details)).toBeNull();
    });
  });

  it('should apply default names when config is empty', () => {
    const handler = new CustomHandler();
    expect(handler.name).toBe('custom');
    expect(handler.displayName).toBe('Custom Rule');
  });

  it('should fall back to unknown domain when URL parsing fails', () => {
    const handler = new CustomHandler({
      rule: {
        extractFrom: 'header',
        extractKey: 'Authorization'
      }
    });

    const details = createMockRequest({
      url: 'http://',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
    });

    const result = handler.extract(details);
    expect(result.source.domain).toBe('unknown');
  });

  it('should return null for unsupported extract types', () => {
    const handler = new CustomHandler({
      rule: {
        extractFrom: 'unknown',
        extractKey: 'x'
      }
    });

    const details = createMockRequest({
      requestHeaders: [{ name: 'X-Test', value: 'value' }]
    });

    expect(handler.extract(details)).toBeNull();
  });
});

describe('BaseHandler helpers', () => {
  it('should get headers and cookies case-insensitively', () => {
    const handler = new BaseHandler();
    const headers = [
      { name: 'Authorization', value: 'Bearer token' },
      { name: 'Cookie', value: 'session=abc=123; other=val' }
    ];

    expect(handler.getHeader(headers, 'authorization')).toBe('Bearer token');
    expect(handler.getCookie(headers, 'session')).toBe('abc=123');
  });

  it('should return null for invalid URLs', () => {
    const handler = new BaseHandler();
    expect(handler.parseUrl('http://')).toBeNull();
  });

  it('should return null when headers or cookies are missing', () => {
    const handler = new BaseHandler();
    expect(handler.getHeader(null, 'authorization')).toBeNull();
    expect(handler.getCookie([{ name: 'Cookie', value: 'foo=bar' }], 'missing')).toBeNull();
    expect(handler.getCookie([{ name: 'Authorization', value: 'x' }], 'session')).toBeNull();
  });

  it('should process extracted data when enabled', () => {
    class TestHandler extends BaseHandler {
      matches() {
        return true;
      }
      extract() {
        return { value: 'ok' };
      }
    }

    const handler = new TestHandler();
    const result = handler.process({ url: 'https://example.com' });
    expect(result).toMatchObject({ handler: 'base', displayName: 'Base Handler', value: 'ok' });
  });

  it('should return null when disabled or no extraction', () => {
    class TestHandler extends BaseHandler {
      matches() {
        return true;
      }
      extract() {
        return null;
      }
    }

    const handler = new TestHandler();
    expect(handler.process({})).toBeNull();

    handler.enabled = false;
    expect(handler.process({})).toBeNull();
  });

  it('should return defaults from base matches and extract', () => {
    const handler = new BaseHandler();
    expect(handler.matches({})).toBe(false);
    expect(handler.extract({})).toBeNull();
  });
});

describe('Custom handler factory', () => {
  it('should create handlers with defaults for missing names', () => {
    const handlers = createCustomHandlers([
      { extractFrom: 'header', extractKey: 'Authorization' },
      { name: 'explicit', extractFrom: 'header', extractKey: 'X-Key' }
    ]);

    expect(handlers[0].name).toBe('custom-0');
    expect(handlers[0].displayName).toBe('Custom Rule 1');
    expect(handlers[1].name).toBe('explicit');
  });

  it('should return empty list when no rules provided', () => {
    expect(createCustomHandlers()).toEqual([]);
  });
});

describe('Handler Security', () => {
  it('should not modify request headers', () => {
    const handler = new AuthTokenHandler();
    const originalHeaders = [
      { name: 'Authorization', value: 'Bearer token' }
    ];
    const details = createMockRequest({
      requestHeaders: [...originalHeaders]
    });

    handler.extract(details);

    // Headers should remain unchanged
    expect(details.requestHeaders).toEqual(originalHeaders);
  });

  it('should not make any network requests', () => {
    const handler = new AuthTokenHandler();
    const details = createMockRequest({
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer token' }
      ]
    });

    // Verify no fetch was called during extraction
    const originalFetch = global.fetch;
    global.fetch = jest.fn();

    handler.extract(details);

    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });
});
