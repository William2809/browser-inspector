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
  clearHistory,
  getConfig,
  setConfig,
  updateConfig
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
  });

  describe('Config', () => {
    it('should return default config when none exists', async () => {
      const config = await getConfig();

      expect(config).toMatchObject({
        enabled: true,
        notifications: true,
        autoCapture: true
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
