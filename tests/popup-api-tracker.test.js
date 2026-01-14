// Popup API tracker tests

import { jest } from '@jest/globals';
import {
  exportApiTrackerData,
  renderDomainSelector,
  renderApiStats,
  renderEndpointList,
  loadApiTracker,
  clearApiTrackerDomain
} from '../src/popup/popup-api-tracker.js';

describe('popup-api-tracker', () => {
  let elements;
  let capturedBlob;
  let originalBlob;

  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.runtime.sendMessage.mockReset();

    originalBlob = global.Blob;
    global.Blob = class MockBlob {
      constructor(parts) {
        this._text = parts.join('');
      }
      async text() {
        return this._text;
      }
    };
    if (typeof window !== 'undefined') {
      window.Blob = global.Blob;
    }

    elements = {
      apiCount: document.createElement('span'),
      apiDomainSelect: document.createElement('select'),
      apiStats: document.createElement('div'),
      apiEndpointList: document.createElement('div'),
      toast: document.createElement('div')
    };
    elements.toast.innerHTML = '<span class="toast-message"></span>';

    capturedBlob = null;
    global.URL.createObjectURL = jest.fn((blob) => {
      capturedBlob = blob;
      return 'blob:mock';
    });
    global.URL.revokeObjectURL = jest.fn();

    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click.mockRestore();
    global.Blob = originalBlob;
    if (typeof window !== 'undefined') {
      window.Blob = originalBlob;
    }
  });

  it('should render empty domain selector', () => {
    renderDomainSelector(elements, [], '', () => {});
    expect(elements.apiDomainSelect.disabled).toBe(true);
    expect(elements.apiDomainSelect.innerHTML).toContain('No domains tracked');
  });

  it('should render domain selector options and handle change', () => {
    const onChange = jest.fn();
    renderDomainSelector(elements, [
      { domain: 'a.com', displayName: 'a.com', uniqueEndpoints: 2 },
      { domain: 'b.com', displayName: 'b.com', uniqueEndpoints: 1 }
    ], 'b.com', onChange);

    expect(elements.apiDomainSelect.disabled).toBe(false);
    expect(elements.apiDomainSelect.innerHTML).toContain('b.com');

    elements.apiDomainSelect.value = 'a.com';
    elements.apiDomainSelect.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('a.com');
  });

  it('should render empty API stats when no domain data', () => {
    renderApiStats(elements, null);
    expect(elements.apiStats.textContent).toContain('Select a domain');
  });

  it('should render API stats when data is provided', () => {
    renderApiStats(elements, {
      totalRequests: 5,
      stats: { uniqueEndpoints: 2, byMethod: { GET: 3, POST: 2 } }
    });

    expect(elements.apiStats.textContent).toContain('Endpoints:');
    expect(elements.apiStats.textContent).toContain('GET: 3');
  });

  it('should render empty endpoint list when no data', () => {
    renderEndpointList(elements, null, '', () => {});
    expect(elements.apiEndpointList.textContent).toContain('No API requests tracked yet');
  });

  it('should render endpoints and handle copy button', () => {
    const onCopy = jest.fn();
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: ['page']
        }
      }
    };

    renderEndpointList(elements, domainData, '', onCopy);

    const button = elements.apiEndpointList.querySelector('.api-copy-btn');
    button.dispatchEvent(new MouseEvent('click'));

    expect(onCopy).toHaveBeenCalledWith('https://api.example.com/v1/items');
  });

  it('should render no results for filtered endpoint list', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: ['q']
        }
      }
    };

    renderEndpointList(elements, domainData, 'nomatch', () => {});
    expect(elements.apiEndpointList.textContent).toContain('No matching endpoints');
  });

  it('should filter endpoints by query params', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now() - 1000,
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: ['q']
        },
        'key-2': {
          apiDomain: 'api.example.com',
          path: '/v1/users',
          normalizedPath: '/v1/users',
          method: 'POST',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/users',
          queryParams: ['page']
        }
      }
    };

    renderEndpointList(elements, domainData, 'q', () => {});
    expect(elements.apiEndpointList.textContent).toContain('/v1/items');
  });

  it('should load API tracker data with defaults', async () => {
    chrome.runtime.sendMessage
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null);

    const state = { currentApiDomain: '', apiSearchQuery: '' };

    await loadApiTracker(elements, state, {
      onDomainChange: jest.fn(),
      onCopyUrl: jest.fn()
    });

    expect(elements.apiCount.textContent).toBe('0');
    expect(elements.apiStats.textContent).toContain('Select a domain');
  });

  it('should load API tracker data for current domain', async () => {
    const domains = [
      { domain: 'example.com', displayName: 'example.com', uniqueEndpoints: 1 }
    ];
    const domainData = {
      totalRequests: 2,
      stats: { uniqueEndpoints: 1, byMethod: { GET: 2 } },
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 2,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items'
        }
      }
    };

    chrome.runtime.sendMessage
      .mockResolvedValueOnce(domains)
      .mockResolvedValueOnce(domainData);

    const state = { currentApiDomain: '', apiSearchQuery: '' };

    await loadApiTracker(elements, state, {
      onDomainChange: jest.fn(),
      onCopyUrl: jest.fn()
    });

    expect(state.currentApiDomain).toBe('example.com');
    expect(elements.apiStats.textContent).toContain('Total Requests');
  });

  it('should clear API tracker domain and show toast', async () => {
    await clearApiTrackerDomain(elements, 'example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CLEAR_API_TRACKER',
      domain: 'example.com'
    });
    expect(elements.toast.querySelector('.toast-message').textContent).toContain('Cleared');
  });

  it('should export single domain data with parameter descriptions', async () => {
    const domainData = {
      totalRequests: 10,
      lastVisited: Date.now(),
      stats: { byMethod: { GET: 5 }, byApiDomain: { 'api.example.com': 1 } },
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 2,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: [
            'page', 'p', 'limit', 'per_page', 'offset', 'skip', 'sort', 'order',
            'filter', 'q', 'query', 'search', 'start', 'from', 'begin', 'end', 'to', 'until',
            'id', '_id', 'token', 'key', 'api_key', 'type', 'category',
            'format', 'callback', 'jsonp', 'timestamp', 't', 'ts', 'lang', 'locale',
            'numval', 'dateval', 'boolval', 'noneval'
          ],
          queryParamExamples: {
            page: ['1'],
            p: ['2'],
            limit: ['10'],
            per_page: ['20'],
            offset: ['0'],
            skip: ['5'],
            sort: ['asc'],
            order: ['desc'],
            filter: ['name'],
            q: ['search'],
            query: ['search'],
            search: ['search'],
            start: ['2024-01-01'],
            from: ['2024-01-01'],
            begin: ['2024-01-01'],
            end: ['2024-01-02'],
            to: ['2024-01-02'],
            until: ['2024-01-02'],
            id: ['42'],
            _id: ['99'],
            token: ['abc'],
            key: ['k'],
            api_key: ['api'],
            type: ['basic'],
            category: ['cat'],
            format: ['json'],
            callback: ['cb'],
            jsonp: ['cb'],
            timestamp: ['123'],
            t: ['123'],
            ts: ['123'],
            lang: ['en'],
            locale: ['en-US'],
            numval: ['123'],
            dateval: ['2024-02-01'],
            boolval: ['true'],
            noneval: ['abc']
          }
        }
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);

    await exportApiTrackerData(elements, 'example.com');

    expect(elements.toast.querySelector('.toast-message').textContent).toContain('Exported to');
    expect(URL.createObjectURL).toHaveBeenCalled();

    const blobText = typeof capturedBlob.text === 'function' ? await capturedBlob.text() : capturedBlob._text;
    const payload = JSON.parse(blobText);
    const params = payload.endpoints[0].parameters;
    const descMap = Object.fromEntries(params.map(p => [p.name, p.description]));
    expect(descMap.numval).toBe('Numeric parameter');
    expect(descMap.dateval).toBe('Date parameter (ISO format)');
    expect(descMap.boolval).toBe('Boolean flag');
    expect(descMap.noneval).toBeNull();
  });

  it('should export endpoints without query parameters', async () => {
    const domainData = {
      totalRequests: 1,
      lastVisited: Date.now(),
      stats: { byMethod: { GET: 1 }, byApiDomain: { 'api.example.com': 1 } },
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: [],
          queryParamExamples: {}
        }
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');
  });

  it('should export domain data with auth and example URLs', async () => {
    const domainData = {
      totalRequests: 2,
      lastVisited: Date.now(),
      stats: {},
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 2,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          exampleUrls: ['https://api.example.com/v1/items', 'https://api.example.com/v1/items?page=2'],
          hasAuth: true,
          authType: 'bearer'
        }
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');

    const payload = JSON.parse(await capturedBlob.text());
    expect(payload.endpoints[0].exampleUrls.length).toBe(2);
    expect(payload.endpoints[0].authentication.required).toBe(true);
    expect(payload.endpoints[0].authentication.type).toBe('bearer');
  });

  it('should sort endpoints by call count', async () => {
    const domainData = {
      totalRequests: 3,
      lastVisited: Date.now(),
      stats: {},
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/a',
          normalizedPath: '/v1/a',
          method: 'GET',
          count: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/a'
        },
        'key-2': {
          apiDomain: 'api.example.com',
          path: '/v1/b',
          normalizedPath: '/v1/b',
          method: 'GET',
          count: 2,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/b'
        }
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');

    const payload = JSON.parse(await capturedBlob.text());
    expect(payload.endpoints[0].stats.callCount).toBe(2);
  });

  it('should handle missing stats in export', async () => {
    const domainData = {
      totalRequests: 1,
      lastVisited: Date.now(),
      endpoints: {}
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');

    const payload = JSON.parse(await capturedBlob.text());
    expect(payload.summary.methodBreakdown).toEqual({});
    expect(payload.summary.apiDomains).toEqual([]);
  });

  it('should handle params without example values', async () => {
    const domainData = {
      totalRequests: 1,
      lastVisited: Date.now(),
      stats: {},
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          queryParams: ['mystery'],
          queryParamExamples: {}
        }
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');

    const payload = JSON.parse(await capturedBlob.text());
    expect(payload.endpoints[0].parameters[0].exampleValues).toEqual([]);
    expect(payload.endpoints[0].parameters[0].description).toBeNull();
  });

  it('should export when endpoints are missing', async () => {
    const domainData = {
      totalRequests: 0,
      lastVisited: Date.now(),
      stats: {}
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(domainData);
    await exportApiTrackerData(elements, 'example.com');
  });

  it('should export all domains data', async () => {
    const tracker = {
      'a.com': {
        totalRequests: 1,
        lastVisited: Date.now() - 1000,
        stats: { byMethod: { GET: 1 }, byApiDomain: { 'api.a.com': 1 } },
        endpoints: {}
      },
      'b.com': {
        totalRequests: 2,
        lastVisited: Date.now(),
        stats: { byMethod: { POST: 2 }, byApiDomain: { 'api.b.com': 1 } },
        endpoints: {}
      }
    };

    chrome.runtime.sendMessage.mockResolvedValueOnce(tracker);

    await exportApiTrackerData(elements, null);

    expect(elements.toast.querySelector('.toast-message').textContent).toContain('Exported to');
  });

  it('should show no data toast for empty exports', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    await exportApiTrackerData(elements, 'example.com');
    expect(elements.toast.querySelector('.toast-message').textContent).toBe('No data to export');

    chrome.runtime.sendMessage.mockResolvedValueOnce({});
    await exportApiTrackerData(elements, null);
    expect(elements.toast.querySelector('.toast-message').textContent).toBe('No data to export');
  });

  it('should handle export errors', async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('boom'));
    await exportApiTrackerData(elements, 'example.com');
    expect(elements.toast.querySelector('.toast-message').textContent).toBe('Export failed');
  });

  it('should export all domains when domain argument is omitted', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      'a.com': {
        totalRequests: 1,
        lastVisited: Date.now(),
        stats: { byMethod: {}, byApiDomain: {} },
        endpoints: {}
      }
    });

    await exportApiTrackerData(elements);
    expect(elements.toast.querySelector('.toast-message').textContent).toContain('Exported to');
  });

  it('should render stats with no methods', () => {
    renderApiStats(elements, { totalRequests: 0, stats: {} });
    expect(elements.apiStats.textContent).toContain('None');
  });

  it('should render stats without a stats object', () => {
    renderApiStats(elements, { totalRequests: 0 });
    expect(elements.apiStats.textContent).toContain('Endpoints:');
  });

  it('should render domain selector without selected domain', () => {
    renderDomainSelector(elements, [
      { domain: 'a.com', displayName: 'a.com', uniqueEndpoints: 1 }
    ], 'missing.com', () => {});

    expect(elements.apiDomainSelect.innerHTML).toContain('a.com');
    expect(elements.apiDomainSelect.innerHTML).not.toContain('selected');
  });

  it('should render endpoint items with auth and params', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: null,
          method: 'GET',
          count: 2,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          hasAuth: true,
          authType: 'bearer',
          queryParams: ['page']
        }
      }
    };

    renderEndpointList(elements, domainData, '', () => {});
    expect(elements.apiEndpointList.textContent).toContain('Params:');
    expect(elements.apiEndpointList.textContent).toContain('calls');
    expect(elements.apiEndpointList.textContent).toContain('🔐');
  });

  it('should render auth badge with default label', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items',
          hasAuth: true
        }
      }
    };

    renderEndpointList(elements, domainData, '', () => {});
    expect(elements.apiEndpointList.textContent).toContain('🔐');
  });

  it('should handle search with missing query params', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items'
        }
      }
    };

    renderEndpointList(elements, domainData, 'items', () => {});
    expect(elements.apiEndpointList.textContent).toContain('/v1/items');
  });

  it('should handle search misses when query params are absent', () => {
    const domainData = {
      endpoints: {
        'key-1': {
          apiDomain: 'api.example.com',
          path: '/v1/items',
          normalizedPath: '/v1/items',
          method: 'GET',
          count: 1,
          lastSeen: Date.now(),
          exampleUrl: 'https://api.example.com/v1/items'
        }
      }
    };

    renderEndpointList(elements, domainData, 'nomatch', () => {});
    expect(elements.apiEndpointList.textContent).toContain('No matching endpoints');
  });

  it('should not override current domain when already set', async () => {
    const domains = [
      { domain: 'example.com', displayName: 'example.com', uniqueEndpoints: 1 }
    ];
    chrome.runtime.sendMessage
      .mockResolvedValueOnce(domains)
      .mockResolvedValueOnce({ totalRequests: 0, stats: {}, endpoints: {} });

    const state = { currentApiDomain: 'example.com', apiSearchQuery: '' };
    await loadApiTracker({ ...elements, apiCount: null }, state, {
      onDomainChange: jest.fn(),
      onCopyUrl: jest.fn()
    });

    expect(state.currentApiDomain).toBe('example.com');
  });

  it('should clear all API data when domain is empty', async () => {
    await clearApiTrackerDomain(elements, '');
    expect(elements.toast.querySelector('.toast-message').textContent).toContain('Cleared all API data');
  });
});
