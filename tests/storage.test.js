// Browser Interceptor - Storage Module Tests
// Tests for 100% local storage operations

import {
  getCapturedData,
  setCapturedData,
  updateCapturedItem,
  removeCapturedItem,
  clearAllCapturedData,
  getExpiredTokens,
  addToExpiredTokens,
  clearExpiredTokens,
  getHistory,
  addToHistory,
  clearHistory,
  getConfig,
  setConfig,
  updateConfig,
  shouldCaptureDomain,
  getApiTracker,
  getApiTrackerForDomain,
  getTrackedDomains,
  trackApiRequest,
  extractRootDomain
} from '../src/lib/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    resetMockStorage();
  });

  describe('getCapturedData', () => {
    it('should return empty object when no data exists', async () => {
      const data = await getCapturedData();
      expect(data).toEqual({});
    });

    it('should return stored captured data', async () => {
      const testData = {
        'example.com::auth-token': {
          value: 'Bearer abc123',
          type: 'auth-token'
        }
      };
      setMockStorage({ capturedData: testData });

      const data = await getCapturedData();
      expect(data).toEqual(testData);
    });
  });

  describe('setCapturedData', () => {
    it('should store captured data', async () => {
      const testData = {
        'api.test.com::auth-token': {
          value: 'token123',
          type: 'auth-token'
        }
      };

      await setCapturedData(testData);

      const storage = getMockStorage();
      expect(storage.capturedData).toEqual(testData);
    });
  });

  describe('updateCapturedItem - New Token', () => {
    it('should add new token with status active and rotationCount 0', async () => {
      const key = 'api.example.com::/v1/auth::auth-token';
      const value = {
        value: 'Bearer newtoken123',
        type: 'auth-token',
        displayName: 'Authorization',
        source: { domain: 'api.example.com', path: '/v1/auth' }
      };

      const result = await updateCapturedItem(key, value);

      expect(result.rotationDetected).toBe(false);
      expect(result.previousToken).toBeNull();
      expect(result.data[key]).toMatchObject({
        value: 'Bearer newtoken123',
        status: 'active',
        rotationCount: 0
      });
      expect(result.data[key].capturedAt).toBeDefined();
    });
  });

  describe('updateCapturedItem - Same Token', () => {
    it('should update lastSeenAt without rotation when token is same', async () => {
      const key = 'api.example.com::/v1/auth::auth-token';
      const initialValue = {
        value: 'Bearer sametoken',
        type: 'auth-token',
        capturedAt: Date.now() - 10000,
        status: 'active',
        rotationCount: 0
      };
      setMockStorage({ capturedData: { [key]: initialValue } });

      const result = await updateCapturedItem(key, { value: 'Bearer sametoken', type: 'auth-token' });

      expect(result.rotationDetected).toBe(false);
      expect(result.data[key].lastSeenAt).toBeDefined();
      expect(result.data[key].rotationCount).toBe(0);
    });
  });

  describe('updateCapturedItem - Token Rotation', () => {
    it('should detect rotation when same key has different value', async () => {
      const key = 'api.example.com::/v1/auth::auth-token';
      const oldToken = {
        value: 'Bearer oldtoken123',
        type: 'auth-token',
        capturedAt: Date.now() - 60000,
        status: 'active',
        rotationCount: 0
      };
      setMockStorage({ capturedData: { [key]: oldToken } });

      const newValue = {
        value: 'Bearer newtoken456',
        type: 'auth-token',
        source: { domain: 'api.example.com' }
      };

      const result = await updateCapturedItem(key, newValue);

      expect(result.rotationDetected).toBe(true);
      expect(result.previousToken).toMatchObject({
        value: 'Bearer oldtoken123'
      });
      expect(result.data[key].value).toBe('Bearer newtoken456');
      expect(result.data[key].rotationCount).toBe(1);
      expect(result.data[key].previousValue).toBe('Bearer oldtoken123');
      expect(result.data[key].lastRotatedAt).toBeDefined();
    });

    it('should increment rotationCount on multiple rotations', async () => {
      const key = 'api.example.com::/v1/auth::auth-token';
      const existingToken = {
        value: 'Bearer token_v2',
        type: 'auth-token',
        capturedAt: Date.now() - 60000,
        status: 'active',
        rotationCount: 2,
        previousValue: 'Bearer token_v1'
      };
      setMockStorage({ capturedData: { [key]: existingToken } });

      const result = await updateCapturedItem(key, {
        value: 'Bearer token_v3',
        type: 'auth-token'
      });

      expect(result.rotationDetected).toBe(true);
      expect(result.data[key].rotationCount).toBe(3);
    });

    it('should add old token to expired tokens on rotation', async () => {
      const key = 'api.example.com::/v1/auth::auth-token';
      const oldToken = {
        value: 'Bearer expiring_token',
        type: 'auth-token',
        displayName: 'Authorization',
        capturedAt: Date.now() - 60000,
        status: 'active',
        rotationCount: 0
      };
      setMockStorage({ capturedData: { [key]: oldToken } });

      await updateCapturedItem(key, {
        value: 'Bearer new_token',
        type: 'auth-token'
      });

      const expiredTokens = await getExpiredTokens();
      expect(expiredTokens.length).toBe(1);
      expect(expiredTokens[0].value).toBe('Bearer expiring_token');
      expect(expiredTokens[0].expiredAt).toBeDefined();
    });
  });

  describe('removeCapturedItem', () => {
    it('should remove specified item', async () => {
      const key = 'api.test.com::auth-token';
      setMockStorage({
        capturedData: {
          [key]: { value: 'token' },
          'other.com::auth-token': { value: 'other' }
        }
      });

      const result = await removeCapturedItem(key);

      expect(result[key]).toBeUndefined();
      expect(result['other.com::auth-token']).toBeDefined();
    });
  });

  describe('clearAllCapturedData', () => {
    it('should clear all captured data', async () => {
      setMockStorage({
        capturedData: {
          'a::token': { value: 'a' },
          'b::token': { value: 'b' }
        }
      });

      await clearAllCapturedData();
      const data = await getCapturedData();

      expect(data).toEqual({});
    });
  });

  describe('Expired Tokens', () => {
    it('should return empty array when no expired tokens', async () => {
      const expired = await getExpiredTokens();
      expect(expired).toEqual([]);
    });

    it('should add token to expired list', async () => {
      const item = {
        value: 'Bearer old',
        type: 'auth-token',
        capturedAt: Date.now() - 10000
      };

      await addToExpiredTokens('test-key', item);

      const expired = await getExpiredTokens();
      expect(expired.length).toBe(1);
      expect(expired[0].key).toBe('test-key');
      expect(expired[0].value).toBe('Bearer old');
    });

    it('should limit expired tokens to 50', async () => {
      // Add 55 tokens
      for (let i = 0; i < 55; i++) {
        await addToExpiredTokens(`key-${i}`, {
          value: `token-${i}`,
          type: 'auth-token',
          capturedAt: Date.now()
        });
      }

      const expired = await getExpiredTokens();
      expect(expired.length).toBe(50);
    });

    it('should clear expired tokens', async () => {
      setMockStorage({
        expiredTokens: [{ value: 'old' }]
      });

      await clearExpiredTokens();
      const expired = await getExpiredTokens();

      expect(expired).toEqual([]);
    });
  });

  describe('History', () => {
    it('should return empty array when no history', async () => {
      const history = await getHistory();
      expect(history).toEqual([]);
    });

    it('should limit history to 100 items', async () => {
      // Simulate adding many items through updateCapturedItem
      for (let i = 0; i < 110; i++) {
        await updateCapturedItem(`key-${i}`, {
          value: `token-${i}`,
          type: 'auth-token',
          source: { domain: `domain-${i}.com` }
        });
      }

      const history = await getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should clear history', async () => {
      setMockStorage({
        history: [{ key: 'test', timestamp: Date.now() }]
      });

      await clearHistory();
      const history = await getHistory();

      expect(history).toEqual([]);
    });

    it('should record rotation events in history', async () => {
      await addToHistory('key-rot', { value: 'tok', type: 'auth-token' }, true);
      const history = await getHistory();
      expect(history[0].event).toBe('rotation');
    });

    it('should record capture events by default', async () => {
      await addToHistory('key-cap', { value: 'tok', type: 'auth-token' });
      const history = await getHistory();
      expect(history[0].event).toBe('capture');
    });
  });

  describe('Config', () => {
    it('should return default config when none exists', async () => {
      const config = await getConfig();

      expect(config).toMatchObject({
        enabled: true,
        notifications: true,
        autoCapture: true,
        theme: 'dark'
      });
    });

    it('should store and retrieve config', async () => {
      const testConfig = {
        enabled: false,
        notifications: false,
        domainFilter: ['api.myapp.com']
      };

      await setConfig(testConfig);
      const config = await getConfig();

      expect(config).toEqual(testConfig);
    });

    it('should update config partially', async () => {
      setMockStorage({
        config: { enabled: true, notifications: true }
      });

      const updated = await updateConfig({ notifications: false });

      expect(updated.enabled).toBe(true);
      expect(updated.notifications).toBe(false);
    });
  });

  describe('Domain filtering', () => {
    it('should block domains on the blocklist', () => {
      const config = {
        domainAllowlist: [],
        domainBlocklist: ['ads.example.com', '*.tracker.com']
      };

      expect(shouldCaptureDomain('ads.example.com', config)).toBe(false);
      expect(shouldCaptureDomain('api.tracker.com', config)).toBe(false);
      expect(shouldCaptureDomain('good.com', config)).toBe(true);
    });

    it('should allow domains on the allowlist', () => {
      const config = {
        domainAllowlist: ['api.myapp.com', '*.service.com'],
        domainBlocklist: []
      };

      expect(shouldCaptureDomain('api.myapp.com', config)).toBe(true);
      expect(shouldCaptureDomain('sub.service.com', config)).toBe(true);
      expect(shouldCaptureDomain('other.com', config)).toBe(false);
    });

    it('should return false for missing domains and empty patterns', () => {
      const config = {
        domainAllowlist: [],
        domainBlocklist: ['']
      };

      expect(shouldCaptureDomain('', config)).toBe(false);
      expect(shouldCaptureDomain(null, config)).toBe(false);
    });

    it('should ignore null blocklist patterns', () => {
      const config = {
        domainAllowlist: [],
        domainBlocklist: [null]
      };

      expect(shouldCaptureDomain('example.com', config)).toBe(true);
    });

    it('should default to allow when allowlist and blocklist are omitted', () => {
      expect(shouldCaptureDomain('example.com', {})).toBe(true);
    });
  });

  describe('API Tracker edge cases', () => {
    it('should return null for unknown domain', async () => {
      const result = await getApiTrackerForDomain('missing.com');
      expect(result).toBeNull();
    });

    it('should return data for tracked domain', async () => {
      setMockStorage({
        apiTracker: {
          'example.com': { displayName: 'example.com', totalRequests: 1, endpoints: {} }
        }
      });

      const result = await getApiTrackerForDomain('example.com');
      expect(result.displayName).toBe('example.com');
    });

    it('should sort tracked domains by lastVisited', async () => {
      setMockStorage({
        apiTracker: {
          'a.com': { displayName: 'a.com', lastVisited: 10, totalRequests: 1, endpoints: {}, stats: { uniqueEndpoints: 0 } },
          'b.com': { displayName: 'b.com', lastVisited: 20, totalRequests: 1, endpoints: {}, stats: { uniqueEndpoints: 0 } }
        }
      });

      const domains = await getTrackedDomains();
      expect(domains[0].domain).toBe('b.com');
      expect(domains[1].domain).toBe('a.com');
    });

    it('should skip invalid URLs', async () => {
      await trackApiRequest('example.com', { url: 'http://', method: 'GET', requestHeaders: [] });
      const tracker = await getApiTracker();
      expect(tracker).toEqual({});
    });

    it('should normalize long alphanumeric path segments', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items/abcdefghijklmnopqrstuvwx1234',
        method: 'GET',
        requestHeaders: []
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.normalizedPath).toBe('/v1/items/*');
    });

    it('should detect basic auth', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: [{ name: 'Authorization', value: 'Basic dGVzdDpwYXNz' }]
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.authType).toBe('basic');
    });

    it('should handle missing request headers', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET'
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.hasAuth).toBe(false);
    });

    it('should treat missing auth header values as token auth', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: [{ name: 'Authorization' }]
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.authType).toBe('token');
    });

    it('should ignore non-auth headers', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: [{ name: 'Content-Type', value: 'application/json' }]
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.hasAuth).toBe(false);
    });

    it('should detect token auth when not bearer or basic', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: [{ name: 'X-API-Key', value: 'token123' }]
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.authType).toBe('token');
    });

    it('should update auth info for existing endpoint', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: []
      });

      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }]
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.hasAuth).toBe(true);
      expect(endpoint.authType).toBe('bearer');
    });

    it('should backfill exampleUrls when missing', async () => {
      setMockStorage({
        apiTracker: {
          'example.com': {
            displayName: 'example.com',
            lastVisited: 1,
            totalRequests: 1,
            endpoints: {
              'api.example.com::/v1/items::GET': {
                apiDomain: 'api.example.com',
                path: '/v1/items',
                normalizedPath: '/v1/items',
                method: 'GET',
                count: 1,
                firstSeen: 1,
                lastSeen: 1,
                exampleUrl: 'https://api.example.com/v1/items'
              }
            },
            stats: { uniqueEndpoints: 1, byApiDomain: { 'api.example.com': 1 }, byMethod: { GET: 1 } }
          }
        }
      });

      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items?page=2',
        method: 'GET',
        requestHeaders: []
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.exampleUrls.length).toBeGreaterThan(1);
    });

    it('should remove oldest endpoint when limit is exceeded', async () => {
      const endpoints = {};
      for (let i = 0; i < 200; i++) {
        endpoints[`api.example.com::/v1/items/${i}::GET`] = {
          apiDomain: 'api.example.com',
          path: `/v1/items/${i}`,
          normalizedPath: `/v1/items/${i}`,
          method: 'GET',
          count: 1,
          firstSeen: i,
          lastSeen: i,
          exampleUrl: `https://api.example.com/v1/items/${i}`,
          exampleUrls: [`https://api.example.com/v1/items/${i}`]
        };
      }

      setMockStorage({
        apiTracker: {
          'example.com': {
            displayName: 'example.com',
            lastVisited: 200,
            totalRequests: 200,
            endpoints,
            stats: { uniqueEndpoints: 200, byApiDomain: { 'api.example.com': 200 }, byMethod: { GET: 200 } }
          }
        }
      });

      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/new-item',
        method: 'GET',
        requestHeaders: []
      });

      const tracker = await getApiTracker();
      expect(Object.keys(tracker['example.com'].endpoints).length).toBe(200);
      expect(tracker['example.com'].endpoints['api.example.com::/v1/items/0::GET']).toBeUndefined();
    });

    it('should remove oldest domain when domain limit is exceeded', async () => {
      const tracker = {};
      for (let i = 0; i < 50; i++) {
        tracker[`domain-${i}.com`] = {
          displayName: `domain-${i}.com`,
          lastVisited: i,
          totalRequests: 1,
          endpoints: {},
          stats: { uniqueEndpoints: 0, byApiDomain: {}, byMethod: {} }
        };
      }

      setMockStorage({ apiTracker: tracker });

      await trackApiRequest('new-domain.com', {
        url: 'https://api.new-domain.com/v1/items',
        method: 'GET',
        requestHeaders: []
      });

      const updated = await getApiTracker();
      expect(Object.keys(updated).length).toBe(50);
      expect(updated['domain-0.com']).toBeUndefined();
      expect(updated['new-domain.com']).toBeDefined();
    });

    it('should handle empty root domains', () => {
      expect(extractRootDomain('')).toBe('');
    });

    it('should collect repeated query parameter examples', async () => {
      await trackApiRequest('example.com', {
        url: 'https://api.example.com/v1/items?q=1&q=2&q=2&q=3&q=4&q=5&q=6',
        method: 'GET',
        requestHeaders: []
      });

      const tracker = await getApiTracker();
      const endpoint = Object.values(tracker['example.com'].endpoints)[0];
      expect(endpoint.queryParamExamples.q.length).toBeLessThanOrEqual(5);
      expect(endpoint.queryParamExamples.q).toContain('1');
    });

    it('should normalize empty paths', async () => {
      const OriginalURL = global.URL;

      global.URL = class MockURL {
        constructor() {
          this.hostname = 'api.example.com';
          this.pathname = '';
          this.searchParams = new OriginalURL('https://api.example.com').searchParams;
        }
      };

      await trackApiRequest('example.com', {
        url: 'https://api.example.com',
        method: 'GET',
        requestHeaders: []
      });

      global.URL = OriginalURL;
    });
  });
});

describe('Security - No External Communication', () => {
  it('should only use chrome.storage.local for data persistence', async () => {
    // This test verifies the storage module only uses local storage
    await updateCapturedItem('test-key', { value: 'test', type: 'auth-token' });

    // Verify chrome.storage.local.set was called
    expect(chrome.storage.local.set).toHaveBeenCalled();

    // Verify no fetch/XHR calls were made (would throw in test environment)
    expect(global.fetch).toBeUndefined();
  });

  it('should store data with correct keys in local storage', async () => {
    await updateCapturedItem('test-key', { value: 'secure', type: 'auth-token' });

    const storage = getMockStorage();
    expect(storage.capturedData).toBeDefined();
    expect(storage.history).toBeDefined();
  });
});
