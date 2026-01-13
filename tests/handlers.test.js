// Browser Interceptor - Handler Tests
// Tests for request interception handlers

import { jest } from '@jest/globals';
import { AuthTokenHandler } from '../src/handlers/auth-token-handler.js';
import { CookieHandler } from '../src/handlers/cookie-handler.js';
import { QueryParamHandler } from '../src/handlers/query-param-handler.js';
import { CustomHandler } from '../src/handlers/custom-handler.js';

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
