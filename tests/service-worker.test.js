// Service worker tests

import { jest } from '@jest/globals';

let storageMocks;
let handlerManagerMocks;

async function importServiceWorker() {
  await jest.unstable_mockModule('../src/handlers/index.js', () => ({
    HandlerManager: class {
      constructor() {
        this.initialize = handlerManagerMocks.initialize;
        this.processRequest = handlerManagerMocks.processRequest;
        this.getCapabilities = handlerManagerMocks.getCapabilities;
        this.addCustomHandler = handlerManagerMocks.addCustomHandler;
        this.removeCustomHandler = handlerManagerMocks.removeCustomHandler;
      }
    }
  }));

  await jest.unstable_mockModule('../src/lib/storage.js', () => storageMocks);

  const module = await import('../src/background/service-worker.js');
  await Promise.resolve();
  return module;
}

function getRequestListener() {
  return chrome.webRequest.onBeforeSendHeaders.addListener.mock.calls[0][0];
}

function getMessageListener() {
  return chrome.runtime.onMessage.addListener.mock.calls[0][0];
}

function getStorageListener() {
  return chrome.storage.onChanged.addListener.mock.calls[0][0];
}

function callMessageListener(message) {
  return new Promise(resolve => {
    const listener = getMessageListener();
    listener(message, {}, resolve);
  });
}

describe('service-worker', () => {
  beforeEach(() => {
    jest.resetModules();
    chrome.runtime.sendMessage.mockClear();
    chrome.webRequest.onBeforeSendHeaders.addListener.mockClear();
    chrome.runtime.onMessage.addListener.mockClear();
    chrome.storage.onChanged.addListener.mockClear();
    chrome.notifications.create.mockClear();
    chrome.tabs.get.mockClear();

    handlerManagerMocks = {
      initialize: jest.fn(),
      processRequest: jest.fn(() => []),
      getCapabilities: jest.fn(() => []),
      addCustomHandler: jest.fn(),
      removeCustomHandler: jest.fn()
    };

    storageMocks = {
      getCapturedData: jest.fn(async () => ({})),
      updateCapturedItem: jest.fn(async () => ({ data: {}, rotationDetected: false, previousToken: null })),
      removeCapturedItem: jest.fn(async () => ({})),
      getConfig: jest.fn(async () => ({ enabled: true, notifications: true, rules: [] })),
      setConfig: jest.fn(async () => {}),
      getHistory: jest.fn(async () => []),
      clearHistory: jest.fn(async () => {}),
      clearAllCapturedData: jest.fn(async () => {}),
      getExpiredTokens: jest.fn(async () => []),
      clearExpiredTokens: jest.fn(async () => {}),
      shouldCaptureDomain: jest.fn(() => true),
      trackApiRequest: jest.fn(async () => {}),
      getApiTracker: jest.fn(async () => ({})),
      getTrackedDomains: jest.fn(async () => []),
      getApiTrackerForDomain: jest.fn(async () => null),
      clearApiTracker: jest.fn(async () => {}),
      extractRootDomain: jest.fn((host) => host.split('.').slice(-2).join('.'))
    };
  });

  it('should initialize handlers with config on load', async () => {
    storageMocks.getConfig.mockResolvedValueOnce({
      enabled: true,
      authTokenConfig: { headerPatterns: ['authorization'] },
      cookieConfig: { cookiePatterns: ['session'] },
      rules: [{ name: 'rule-1' }]
    });

    await importServiceWorker();

    expect(handlerManagerMocks.initialize).toHaveBeenCalledWith({
      authToken: { headerPatterns: ['authorization'] },
      cookie: { cookiePatterns: ['session'] },
      customRules: [{ name: 'rule-1' }]
    });
  });

  it('should default custom rules when missing from config', async () => {
    storageMocks.getConfig.mockResolvedValueOnce({ enabled: true });
    await importServiceWorker();

    expect(handlerManagerMocks.initialize).toHaveBeenCalledWith({
      authToken: {},
      cookie: {},
      customRules: []
    });
  });

  it('should skip request processing when disabled', async () => {
    storageMocks.getConfig.mockResolvedValueOnce({ enabled: false, rules: [] });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({ url: 'https://api.example.com', requestHeaders: [] });
    expect(handlerManagerMocks.processRequest).not.toHaveBeenCalled();
  });

  it('should skip chrome URLs and invalid URLs', async () => {
    await importServiceWorker();
    const listener = getRequestListener();

    await listener({ url: 'chrome://extensions', requestHeaders: [] });
    await listener({ url: 'chrome-extension://test-id/popup.html', requestHeaders: [] });
    await listener({ url: 'moz-extension://test-id/popup.html', requestHeaders: [] });
    await listener({ url: 'http://', requestHeaders: [] });

    expect(storageMocks.shouldCaptureDomain).not.toHaveBeenCalled();
    expect(handlerManagerMocks.processRequest).not.toHaveBeenCalled();
  });

  it('should skip domains that fail filtering', async () => {
    storageMocks.shouldCaptureDomain.mockReturnValueOnce(false);
    await importServiceWorker();

    const listener = getRequestListener();
    await listener({ url: 'https://blocked.example.com', requestHeaders: [] });

    expect(handlerManagerMocks.processRequest).not.toHaveBeenCalled();
  });

  it('should process requests and notify for captured data', async () => {
    const result = {
      type: 'auth-token',
      value: 'token',
      displayName: 'Authorization',
      headerName: 'Authorization',
      source: { domain: 'api.example.com', path: '/v1/users/123' }
    };

    handlerManagerMocks.processRequest.mockReturnValueOnce([result]);
    storageMocks.updateCapturedItem.mockResolvedValueOnce({
      data: { 'key': { rotationCount: 0 } },
      rotationDetected: false,
      previousToken: null
    });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/users/123',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(storageMocks.updateCapturedItem).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'DATA_CAPTURED' }));
    expect(chrome.notifications.create).toHaveBeenCalled();
  });

  it('should ignore sendMessage failures', async () => {
    const result = {
      type: 'auth-token',
      value: 'token',
      displayName: 'Authorization',
      source: { domain: 'api.example.com', path: '/v1/items' }
    };

    handlerManagerMocks.processRequest.mockReturnValueOnce([result]);
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('send fail'));

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });

  it('should skip notifications when disabled in config', async () => {
    storageMocks.getConfig.mockResolvedValue({ enabled: true, notifications: false, rules: [] });
    handlerManagerMocks.processRequest.mockReturnValueOnce([{
      type: 'auth-token',
      value: 'token',
      displayName: 'Authorization',
      source: { domain: 'api.example.com', path: '/v1/items' }
    }]);

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('should generate keys when source data is missing', async () => {
    handlerManagerMocks.processRequest.mockReturnValueOnce([{
      type: undefined,
      value: 'token'
    }]);
    storageMocks.updateCapturedItem.mockResolvedValueOnce({
      data: { key: {} },
      rotationDetected: false,
      previousToken: null
    });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    const keyArg = storageMocks.updateCapturedItem.mock.calls[0][0];
    expect(keyArg).toContain('unknown::');
  });

  it('should skip API tracking for non-XHR or missing tab', async () => {
    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'image',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 0,
      method: 'GET',
      requestHeaders: []
    });

    expect(storageMocks.trackApiRequest).not.toHaveBeenCalled();
  });

  it('should handle token rotation notifications', async () => {
    const result = {
      type: 'auth-token',
      value: 'new',
      displayName: 'Authorization',
      headerName: 'Authorization',
      source: { domain: 'api.example.com', path: '/v1/token' }
    };

    handlerManagerMocks.processRequest.mockReturnValueOnce([result]);
    storageMocks.updateCapturedItem.mockImplementationOnce(async (key) => ({
      data: { [key]: { rotationCount: 2 } },
      rotationDetected: true,
      previousToken: { value: 'old' }
    }));

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/token',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'TOKEN_ROTATED' }));
    expect(chrome.notifications.create).toHaveBeenCalled();
  });

  it('should default rotation count when missing', async () => {
    const result = {
      type: 'auth-token',
      value: 'new',
      displayName: 'Authorization',
      headerName: 'Authorization',
      source: { domain: 'api.example.com', path: '/v1/token' }
    };

    handlerManagerMocks.processRequest.mockReturnValueOnce([result]);
    storageMocks.updateCapturedItem.mockImplementationOnce(async (key) => ({
      data: { [key]: { rotationCount: 0 } },
      rotationDetected: true,
      previousToken: { value: 'old' }
    }));

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/token',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(chrome.notifications.create).toHaveBeenCalled();
  });

  it('should handle rotation notifications without source metadata', async () => {
    handlerManagerMocks.processRequest.mockReturnValueOnce([{
      type: 'auth-token',
      value: 'new',
      displayName: 'Authorization'
    }]);
    storageMocks.updateCapturedItem.mockImplementationOnce(async (key) => ({
      data: { [key]: { rotationCount: 1 } },
      rotationDetected: true,
      previousToken: { value: 'old' }
    }));

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/token',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(chrome.notifications.create).toHaveBeenCalled();
  });

  it('should normalize path patterns in generated keys', async () => {
    const result = {
      type: 'auth-token',
      value: 'token',
      displayName: 'Authorization',
      headerName: 'Authorization',
      source: {
        domain: 'api.example.com',
        path: '/v1/items/550e8400-e29b-41d4-a716-446655440000/abcdefghijklmnopqrstuvwx1234'
      }
    };

    handlerManagerMocks.processRequest.mockReturnValueOnce([result]);
    storageMocks.updateCapturedItem.mockResolvedValueOnce({
      data: { key: {} },
      rotationDetected: false,
      previousToken: null
    });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items/550e8400-e29b-41d4-a716-446655440000/abcdefghijklmnopqrstuvwx1234',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    const keyArg = storageMocks.updateCapturedItem.mock.calls[0][0];
    expect(keyArg).toContain('/v1/items/*/*');
  });

  it('should log errors during request processing', async () => {
    handlerManagerMocks.processRequest.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should track API requests grouped by page domain', async () => {
    chrome.tabs.get.mockResolvedValueOnce({ url: 'https://app.example.com' });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await Promise.resolve();

    expect(storageMocks.trackApiRequest).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'API_TRACKED' }));
  });

  it('should ignore API tracking sendMessage failures', async () => {
    chrome.tabs.get.mockResolvedValueOnce({ url: 'https://app.example.com' });
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('send fail'));

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await Promise.resolve();
    expect(storageMocks.trackApiRequest).toHaveBeenCalled();
  });

  it('should skip API tracking for extension pages', async () => {
    chrome.tabs.get.mockResolvedValueOnce({ url: 'chrome://extensions' });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await Promise.resolve();

    expect(storageMocks.trackApiRequest).not.toHaveBeenCalled();
  });

  it('should skip API tracking for invalid tab or missing root domain', async () => {
    chrome.tabs.get.mockResolvedValueOnce(null);

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    chrome.tabs.get.mockResolvedValueOnce({ url: 'about:blank' });
    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    storageMocks.extractRootDomain.mockReturnValueOnce('');
    chrome.tabs.get.mockResolvedValueOnce({ url: 'https://app.example.com' });
    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await Promise.resolve();
    expect(storageMocks.trackApiRequest).not.toHaveBeenCalled();
  });

  it('should skip API tracking for edge URLs', async () => {
    chrome.tabs.get.mockResolvedValueOnce({ url: 'edge://extensions' });

    await importServiceWorker();
    const listener = getRequestListener();

    await listener({
      url: 'https://api.example.com/v1/items',
      type: 'xmlhttprequest',
      tabId: 2,
      method: 'GET',
      requestHeaders: []
    });

    await Promise.resolve();
    expect(storageMocks.trackApiRequest).not.toHaveBeenCalled();
  });

  it('should handle runtime messages', async () => {
    await importServiceWorker();

    await callMessageListener({ type: 'GET_CAPTURED_DATA' });
    await callMessageListener({ type: 'GET_HISTORY' });
    await callMessageListener({ type: 'CLEAR_HISTORY' });
    await callMessageListener({ type: 'REMOVE_ITEM', key: 'k' });
    await callMessageListener({ type: 'CLEAR_ALL' });
    await callMessageListener({ type: 'GET_CONFIG' });
    await callMessageListener({ type: 'SET_CONFIG', config: { enabled: false } });
    await callMessageListener({ type: 'TOGGLE_ENABLED', enabled: false });
    await callMessageListener({ type: 'GET_CAPABILITIES' });
    storageMocks.getConfig.mockResolvedValueOnce({});
    await callMessageListener({ type: 'ADD_CUSTOM_RULE', rule: { name: 'rule' } });
    storageMocks.getConfig.mockResolvedValueOnce({ rules: [{ name: 'keep' }, { name: 'rule' }] });
    await callMessageListener({ type: 'REMOVE_CUSTOM_RULE', name: 'rule' });
    storageMocks.getConfig.mockResolvedValueOnce({});
    await callMessageListener({ type: 'REMOVE_CUSTOM_RULE', name: 'rule' });
    await callMessageListener({ type: 'GET_EXPIRED_TOKENS' });
    await callMessageListener({ type: 'CLEAR_EXPIRED_TOKENS' });
    await callMessageListener({ type: 'GET_API_TRACKER' });
    await callMessageListener({ type: 'GET_TRACKED_DOMAINS' });
    await callMessageListener({ type: 'GET_API_TRACKER_FOR_DOMAIN', domain: 'example.com' });
    await callMessageListener({ type: 'CLEAR_API_TRACKER', domain: 'example.com' });
    const defaultResponse = await callMessageListener({ type: 'UNKNOWN' });

    expect(defaultResponse).toEqual({ error: 'Unknown message type' });
    expect(storageMocks.setConfig).toHaveBeenCalled();
    expect(handlerManagerMocks.addCustomHandler).toHaveBeenCalled();
    expect(handlerManagerMocks.removeCustomHandler).toHaveBeenCalled();
  });

  it('should re-initialize on storage config changes', async () => {
    await importServiceWorker();

    const listener = getStorageListener();
    listener({ config: { newValue: {} } }, 'local');

    expect(handlerManagerMocks.initialize).toHaveBeenCalled();
  });

  it('should ignore non-config storage changes', async () => {
    await importServiceWorker();
    const listener = getStorageListener();
    const initialCalls = handlerManagerMocks.initialize.mock.calls.length;

    listener({}, 'sync');
    listener({ other: { newValue: {} } }, 'local');

    expect(handlerManagerMocks.initialize).toHaveBeenCalledTimes(initialCalls);
  });
});
