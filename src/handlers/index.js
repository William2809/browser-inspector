// Handler registry and manager

import { AuthTokenHandler } from './auth-token-handler.js';
import { CookieHandler } from './cookie-handler.js';
import { QueryParamHandler } from './query-param-handler.js';
import { CustomHandler, createCustomHandlers } from './custom-handler.js';

export class HandlerManager {
  constructor() {
    this.handlers = [];
    this.customHandlers = [];
  }

  initialize(config = {}) {
    // Initialize built-in handlers
    this.handlers = [
      new AuthTokenHandler(config.authToken || {}),
      new CookieHandler(config.cookie || {}),
      new QueryParamHandler(config.queryParam || {})
    ];

    // Initialize custom handlers from config
    if (config.customRules) {
      this.customHandlers = createCustomHandlers(config.customRules);
    }
  }

  addCustomHandler(rule) {
    const handler = new CustomHandler({
      name: rule.name,
      displayName: rule.displayName,
      rule
    });
    this.customHandlers.push(handler);
    return handler;
  }

  removeCustomHandler(name) {
    this.customHandlers = this.customHandlers.filter(h => h.name !== name);
  }

  getAllHandlers() {
    return [...this.handlers, ...this.customHandlers];
  }

  processRequest(details) {
    const results = [];

    for (const handler of this.getAllHandlers()) {
      try {
        const result = handler.process(details);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Handler ${handler.name} error:`, error);
      }
    }

    return results;
  }

  // Get a summary of what data types this manager can extract
  getCapabilities() {
    return this.getAllHandlers().map(h => ({
      name: h.name,
      displayName: h.displayName,
      enabled: h.enabled
    }));
  }
}

// Export handler classes for direct use
export { AuthTokenHandler, CookieHandler, QueryParamHandler, CustomHandler, createCustomHandlers };
