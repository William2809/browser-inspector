// Browser Inspector - API Tracker Tests
// Tests for API request tracking and storage

import { jest } from '@jest/globals';

// Import after mocks are set up
let storage;

beforeAll(async () => {
  await import('./setup.js');
  storage = await import('../src/lib/storage.js');
});

beforeEach(() => {
  global.resetMockStorage();
});

describe('extractRootDomain', () => {
  it('should extract root domain from simple hostname', () => {
    expect(storage.extractRootDomain('example.com')).toBe('example.com');
  });

  it('should extract root domain from subdomain', () => {
    expect(storage.extractRootDomain('app.stockbit.com')).toBe('stockbit.com');
  });

  it('should extract root domain from www subdomain', () => {
    expect(storage.extractRootDomain('www.example.com')).toBe('example.com');
  });

  it('should extract root domain from deep subdomain', () => {
    expect(storage.extractRootDomain('api.v2.stockbit.com')).toBe('stockbit.com');
  });

  it('should handle co.uk style TLDs', () => {
    expect(storage.extractRootDomain('app.example.co.uk')).toBe('example.co.uk');
  });

  it('should handle localhost', () => {
    expect(storage.extractRootDomain('localhost')).toBe('localhost');
  });

  it('should handle IP addresses', () => {
    expect(storage.extractRootDomain('192.168.1.1')).toBe('192.168.1.1');
  });
});

describe('getApiTracker', () => {
  it('should return empty object when no data exists', async () => {
    const result = await storage.getApiTracker();
    expect(result).toEqual({});
  });

  it('should return stored API tracker data', async () => {
    const mockData = {
      'stockbit.com': {
        displayName: 'stockbit.com',
        totalRequests: 10,
        endpoints: {}
      }
    };
    global.setMockStorage({ apiTracker: mockData });

    const result = await storage.getApiTracker();
    expect(result).toEqual(mockData);
  });
});

describe('trackApiRequest', () => {
  it('should create new domain entry for first request', async () => {
    const requestDetails = {
      url: 'https://api.stockbit.com/v1/portfolio?user_id=123',
      method: 'GET',
      requestHeaders: []
    };

    await storage.trackApiRequest('stockbit.com', requestDetails);

    const tracker = await storage.getApiTracker();
    expect(tracker['stockbit.com']).toBeDefined();
    expect(tracker['stockbit.com'].displayName).toBe('stockbit.com');
    expect(tracker['stockbit.com'].totalRequests).toBe(1);
  });

  it('should create endpoint entry with correct data', async () => {
    const requestDetails = {
      url: 'https://api.stockbit.com/v1/portfolio?user_id=123&period=1M',
      method: 'GET',
      requestHeaders: []
    };

    await storage.trackApiRequest('stockbit.com', requestDetails);

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey]).toMatchObject({
      apiDomain: 'api.stockbit.com',
      path: '/v1/portfolio',
      method: 'GET',
      count: 1
    });
    expect(endpoints[endpointKey].queryParams).toContain('user_id');
    expect(endpoints[endpointKey].queryParams).toContain('period');
  });

  it('should increment count for duplicate endpoint', async () => {
    const requestDetails = {
      url: 'https://api.stockbit.com/v1/portfolio',
      method: 'GET',
      requestHeaders: []
    };

    await storage.trackApiRequest('stockbit.com', requestDetails);
    await storage.trackApiRequest('stockbit.com', requestDetails);
    await storage.trackApiRequest('stockbit.com', requestDetails);

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].count).toBe(3);
    expect(tracker['stockbit.com'].totalRequests).toBe(3);
  });

  it('should merge new query params with existing', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?param1=a',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?param2=b',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].queryParams).toContain('param1');
    expect(endpoints[endpointKey].queryParams).toContain('param2');
  });

  it('should detect auth headers', async () => {
    const requestDetails = {
      url: 'https://api.stockbit.com/v1/portfolio',
      method: 'GET',
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer token123' }
      ]
    };

    await storage.trackApiRequest('stockbit.com', requestDetails);

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].hasAuth).toBe(true);
    expect(endpoints[endpointKey].authType).toBe('bearer');
  });

  it('should normalize paths with IDs', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/users/12345/posts',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].normalizedPath).toBe('/v1/users/*/posts');
  });

  it('should normalize paths with UUIDs', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/items/550e8400-e29b-41d4-a716-446655440000',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].normalizedPath).toBe('/v1/items/*');
  });

  it('should update stats correctly', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/users',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/posts',
      method: 'POST',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://analytics.stockbit.com/track',
      method: 'POST',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const stats = tracker['stockbit.com'].stats;

    expect(stats.uniqueEndpoints).toBe(3);
    expect(stats.byApiDomain['api.stockbit.com']).toBe(2);
    expect(stats.byApiDomain['analytics.stockbit.com']).toBe(1);
    expect(stats.byMethod['GET']).toBe(1);
    expect(stats.byMethod['POST']).toBe(2);
  });

  it('should store example URL on first request', async () => {
    const requestDetails = {
      url: 'https://api.stockbit.com/v1/portfolio?user_id=123',
      method: 'GET',
      requestHeaders: []
    };

    await storage.trackApiRequest('stockbit.com', requestDetails);

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].exampleUrl).toBe('https://api.stockbit.com/v1/portfolio?user_id=123');
  });

  it('should store query parameter values as examples', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?page=1&limit=10',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].queryParamExamples).toBeDefined();
    expect(endpoints[endpointKey].queryParamExamples.page).toContain('1');
    expect(endpoints[endpointKey].queryParamExamples.limit).toContain('10');
  });

  it('should merge multiple parameter values as examples', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?page=1',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?page=2',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?page=3',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].queryParamExamples.page).toContain('1');
    expect(endpoints[endpointKey].queryParamExamples.page).toContain('2');
    expect(endpoints[endpointKey].queryParamExamples.page).toContain('3');
  });

  it('should limit parameter example values to 5', async () => {
    for (let i = 1; i <= 10; i++) {
      await storage.trackApiRequest('stockbit.com', {
        url: `https://api.stockbit.com/v1/data?id=${i}`,
        method: 'GET',
        requestHeaders: []
      });
    }

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].queryParamExamples.id.length).toBe(5);
  });

  it('should store multiple example URLs', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?id=1',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?id=2',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data?id=3',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();
    const endpoints = tracker['stockbit.com'].endpoints;
    const endpointKey = Object.keys(endpoints)[0];

    expect(endpoints[endpointKey].exampleUrls).toBeDefined();
    expect(endpoints[endpointKey].exampleUrls.length).toBe(3);
  });

  it('should track multiple domains separately', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('github.com', {
      url: 'https://api.github.com/repos',
      method: 'GET',
      requestHeaders: []
    });

    const tracker = await storage.getApiTracker();

    expect(tracker['stockbit.com']).toBeDefined();
    expect(tracker['github.com']).toBeDefined();
    expect(Object.keys(tracker['stockbit.com'].endpoints).length).toBe(1);
    expect(Object.keys(tracker['github.com'].endpoints).length).toBe(1);
  });
});

describe('clearApiTracker', () => {
  it('should clear all tracker data when no domain specified', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('github.com', {
      url: 'https://api.github.com/repos',
      method: 'GET',
      requestHeaders: []
    });

    await storage.clearApiTracker();

    const tracker = await storage.getApiTracker();
    expect(tracker).toEqual({});
  });

  it('should clear only specified domain', async () => {
    await storage.trackApiRequest('stockbit.com', {
      url: 'https://api.stockbit.com/v1/data',
      method: 'GET',
      requestHeaders: []
    });

    await storage.trackApiRequest('github.com', {
      url: 'https://api.github.com/repos',
      method: 'GET',
      requestHeaders: []
    });

    await storage.clearApiTracker('stockbit.com');

    const tracker = await storage.getApiTracker();
    expect(tracker['stockbit.com']).toBeUndefined();
    expect(tracker['github.com']).toBeDefined();
  });
});

describe('getTrackedDomains', () => {
  it('should return empty array when no domains tracked', async () => {
    const domains = await storage.getTrackedDomains();
    expect(domains).toEqual([]);
  });

  it('should return list of tracked domains sorted by last visited', async () => {
    await storage.trackApiRequest('alpha.com', {
      url: 'https://api.alpha.com/data',
      method: 'GET',
      requestHeaders: []
    });

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await storage.trackApiRequest('beta.com', {
      url: 'https://api.beta.com/data',
      method: 'GET',
      requestHeaders: []
    });

    const domains = await storage.getTrackedDomains();

    expect(domains.length).toBe(2);
    expect(domains[0].domain).toBe('beta.com'); // Most recent first
    expect(domains[1].domain).toBe('alpha.com');
  });
});
