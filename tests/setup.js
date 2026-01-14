// Browser Inspector - Test Setup
// Mock Chrome Extension APIs for testing

import { jest } from '@jest/globals';

const mockStorage = new Map();

// Mock chrome.storage.local
global.chrome = {
  storage: {
    local: {
      get: jest.fn(async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: mockStorage.get(keys) };
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = mockStorage.get(key);
          });
          return result;
        }
        // Get all
        const result = {};
        mockStorage.forEach((value, key) => {
          result[key] = value;
        });
        return result;
      }),
      set: jest.fn(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value);
        });
      }),
      remove: jest.fn(async (keys) => {
        if (typeof keys === 'string') {
          mockStorage.delete(keys);
        } else if (Array.isArray(keys)) {
          keys.forEach(key => mockStorage.delete(key));
        }
      }),
      clear: jest.fn(async () => {
        mockStorage.clear();
      })
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  },
  webRequest: {
    onBeforeSendHeaders: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn()
  },
  tabs: {
    get: jest.fn()
  }
};

// Helper to reset storage between tests
global.resetMockStorage = () => {
  mockStorage.clear();
  jest.clearAllMocks();
};

// Helper to set initial storage state
global.setMockStorage = (data) => {
  mockStorage.clear();
  Object.entries(data).forEach(([key, value]) => {
    mockStorage.set(key, value);
  });
};

// Helper to get current storage state
global.getMockStorage = () => {
  const result = {};
  mockStorage.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};
