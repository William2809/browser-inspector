// Browser Inspector - Handler Manager Tests

import { jest } from '@jest/globals';
import { HandlerManager } from '../src/handlers/index.js';

function createMockDetails(overrides = {}) {
  return {
    url: 'https://api.example.com/v1/data',
    method: 'GET',
    requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }],
    ...overrides
  };
}

describe('HandlerManager', () => {
  it('should initialize built-in and custom handlers', () => {
    const manager = new HandlerManager();
    manager.initialize({
      authToken: { headerPatterns: ['authorization'] },
      cookie: { cookiePatterns: ['session'] },
      customRules: [{ name: 'custom-a', extractFrom: 'header', extractKey: 'X-Key' }]
    });

    expect(manager.getAllHandlers().length).toBeGreaterThan(3);
    expect(manager.customHandlers.length).toBe(1);
  });

  it('should add and remove custom handlers', () => {
    const manager = new HandlerManager();
    manager.initialize();

    manager.addCustomHandler({ name: 'custom-x', displayName: 'Custom X' });
    expect(manager.customHandlers.length).toBe(1);

    manager.removeCustomHandler('custom-x');
    expect(manager.customHandlers.length).toBe(0);
  });

  it('should return capabilities for all handlers', () => {
    const manager = new HandlerManager();
    manager.initialize();

    const capabilities = manager.getCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities[0]).toHaveProperty('name');
    expect(capabilities[0]).toHaveProperty('displayName');
  });

  it('should process requests and handle handler errors', () => {
    const manager = new HandlerManager();

    const okHandler = {
      name: 'ok',
      displayName: 'OK',
      enabled: true,
      process: jest.fn(() => ({ value: 'ok' }))
    };
    const failingHandler = {
      name: 'bad',
      displayName: 'Bad',
      enabled: true,
      process: jest.fn(() => {
        throw new Error('boom');
      })
    };
    const nullHandler = {
      name: 'null',
      displayName: 'Null',
      enabled: true,
      process: jest.fn(() => null)
    };

    manager.handlers = [okHandler, failingHandler, nullHandler];
    manager.customHandlers = [];

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = manager.processRequest(createMockDetails());

    expect(results.length).toBe(1);
    expect(okHandler.process).toHaveBeenCalled();
    expect(failingHandler.process).toHaveBeenCalled();

    spy.mockRestore();
  });
});
