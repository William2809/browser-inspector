// Browser Interceptor - Storage Manager
// 100% LOCAL - All data stored in chrome.storage.local only

const STORAGE_KEYS = {
  CAPTURED_DATA: 'capturedData',
  CONFIG: 'config',
  HISTORY: 'history',
  EXPIRED_TOKENS: 'expiredTokens',
  API_TRACKER: 'apiTracker'
};

const MAX_HISTORY_ITEMS = 100;
const MAX_EXPIRED_TOKENS = 50;
const MAX_TRACKED_DOMAINS = 50;
const MAX_ENDPOINTS_PER_DOMAIN = 200;

export async function getCapturedData() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CAPTURED_DATA);
  return result[STORAGE_KEYS.CAPTURED_DATA] || {};
}

export async function setCapturedData(data) {
  await chrome.storage.local.set({ [STORAGE_KEYS.CAPTURED_DATA]: data });
}

/**
 * Update a captured item with rotation detection
 * Returns { data, rotationDetected, previousToken }
 */
export async function updateCapturedItem(key, value) {
  const data = await getCapturedData();
  const existingItem = data[key];
  let rotationDetected = false;
  let previousToken = null;

  const now = Date.now();

  if (existingItem && existingItem.value !== value.value) {
    // Token rotation detected - same key, different value
    rotationDetected = true;
    previousToken = {
      value: existingItem.value,
      capturedAt: existingItem.capturedAt,
      expiredAt: now
    };

    // Add to expired tokens list
    await addToExpiredTokens(key, existingItem);

    // Update the item with rotation info
    data[key] = {
      ...value,
      capturedAt: now,
      status: 'active',
      rotationCount: (existingItem.rotationCount || 0) + 1,
      lastRotatedAt: now,
      previousValue: existingItem.value,
      previousCapturedAt: existingItem.capturedAt
    };
  } else if (existingItem && existingItem.value === value.value) {
    // Same token, just update the last seen time
    data[key] = {
      ...existingItem,
      lastSeenAt: now
    };
  } else {
    // New token
    data[key] = {
      ...value,
      capturedAt: now,
      status: 'active',
      rotationCount: 0
    };
  }

  await setCapturedData(data);
  await addToHistory(key, value, rotationDetected);

  return { data, rotationDetected, previousToken };
}

export async function removeCapturedItem(key) {
  const data = await getCapturedData();
  delete data[key];
  await setCapturedData(data);
  return data;
}

export async function clearAllCapturedData() {
  await setCapturedData({});
}

// Expired tokens management
export async function getExpiredTokens() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXPIRED_TOKENS);
  return result[STORAGE_KEYS.EXPIRED_TOKENS] || [];
}

export async function addToExpiredTokens(key, item) {
  const expired = await getExpiredTokens();

  expired.unshift({
    key,
    value: item.value,
    type: item.type,
    source: item.source,
    displayName: item.displayName,
    capturedAt: item.capturedAt,
    expiredAt: Date.now(),
    tokenType: item.tokenType,
    headerName: item.headerName
  });

  // Keep only recent expired tokens
  if (expired.length > MAX_EXPIRED_TOKENS) {
    expired.splice(MAX_EXPIRED_TOKENS);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.EXPIRED_TOKENS]: expired });
}

export async function clearExpiredTokens() {
  await chrome.storage.local.set({ [STORAGE_KEYS.EXPIRED_TOKENS]: [] });
}

// History management
export async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  return result[STORAGE_KEYS.HISTORY] || [];
}

export async function addToHistory(key, value, isRotation = false) {
  const history = await getHistory();
  history.unshift({
    key,
    value: value.value,
    type: value.type,
    source: value.source,
    timestamp: Date.now(),
    event: isRotation ? 'rotation' : 'capture'
  });

  // Keep only the most recent items
  if (history.length > MAX_HISTORY_ITEMS) {
    history.splice(MAX_HISTORY_ITEMS);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
}

export async function clearHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
}

// Config management
export async function getConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  return result[STORAGE_KEYS.CONFIG] || getDefaultConfig();
}

export async function setConfig(config) {
  await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: config });
}

export async function updateConfig(updates) {
  const config = await getConfig();
  const newConfig = { ...config, ...updates };
  await setConfig(newConfig);
  return newConfig;
}

function getDefaultConfig() {
  return {
    enabled: true,
    notifications: true,
    notifyOnRotation: true,
    autoCapture: true,
    rules: [],
    // Domain filtering - empty means capture all
    // Add domains like 'api.myapp.com' to only capture from those
    domainAllowlist: [],
    // Add domains to never capture from
    domainBlocklist: []
  };
}

/**
 * Check if a domain should be captured based on allowlist/blocklist
 * @param {string} domain - The domain to check
 * @param {Object} config - The config object with domainAllowlist/domainBlocklist
 * @returns {boolean} - Whether to capture from this domain
 */
export function shouldCaptureDomain(domain, config) {
  if (!domain) return false;

  const { domainAllowlist = [], domainBlocklist = [] } = config;

  // Check blocklist first (always applied)
  if (domainBlocklist.length > 0) {
    for (const pattern of domainBlocklist) {
      if (matchDomainPattern(domain, pattern)) {
        return false;
      }
    }
  }

  // If allowlist is empty, capture all (except blocked)
  if (domainAllowlist.length === 0) {
    return true;
  }

  // Check allowlist
  for (const pattern of domainAllowlist) {
    if (matchDomainPattern(domain, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Match domain against a pattern (supports wildcards)
 * @param {string} domain - The domain to check
 * @param {string} pattern - The pattern (e.g., '*.example.com', 'api.myapp.com')
 * @returns {boolean}
 */
function matchDomainPattern(domain, pattern) {
  if (!pattern) return false;

  // Exact match
  if (domain === pattern) return true;

  // Wildcard pattern (*.example.com matches sub.example.com)
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.example.com'
    return domain.endsWith(suffix) || domain === pattern.slice(2);
  }

  return false;
}

// ============================================================================
// API Tracker - Track all XHR/fetch requests grouped by page domain
// ============================================================================

// Known multi-part TLDs that should be kept together
const MULTI_PART_TLDS = ['co.uk', 'co.id', 'co.jp', 'com.au', 'com.br', 'org.uk'];

/**
 * Extract root domain from hostname (e.g., 'app.stockbit.com' -> 'stockbit.com')
 */
export function extractRootDomain(hostname) {
  if (!hostname) return '';

  // Handle localhost and IP addresses
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }

  const parts = hostname.split('.');

  // Single part domain
  if (parts.length <= 2) {
    return hostname;
  }

  // Check for multi-part TLDs
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }

  // Standard case: return last two parts
  return parts.slice(-2).join('.');
}

/**
 * Normalize path by replacing IDs with wildcards
 */
function normalizeApiPath(path) {
  if (!path) return '';

  const segments = path.split('/').map(segment => {
    // Replace UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      return '*';
    }
    // Replace pure numeric IDs
    if (/^\d+$/.test(segment)) {
      return '*';
    }
    // Replace long alphanumeric strings (likely IDs)
    if (/^[a-zA-Z0-9]{20,}$/.test(segment)) {
      return '*';
    }
    return segment;
  });

  return segments.join('/');
}

/**
 * Detect auth type from request headers
 */
function detectAuthType(requestHeaders) {
  if (!requestHeaders) return { hasAuth: false, authType: null };

  const authHeaders = ['authorization', 'x-auth-token', 'x-api-key', 'x-access-token'];

  for (const header of requestHeaders) {
    const headerName = header.name.toLowerCase();
    if (authHeaders.includes(headerName)) {
      const value = header.value || '';
      if (value.toLowerCase().startsWith('bearer ')) {
        return { hasAuth: true, authType: 'bearer' };
      } else if (value.toLowerCase().startsWith('basic ')) {
        return { hasAuth: true, authType: 'basic' };
      }
      return { hasAuth: true, authType: 'token' };
    }
  }

  return { hasAuth: false, authType: null };
}

/**
 * Get all API tracker data
 */
export async function getApiTracker() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_TRACKER);
  return result[STORAGE_KEYS.API_TRACKER] || {};
}

/**
 * Get API tracker data for a specific domain
 */
export async function getApiTrackerForDomain(pageDomain) {
  const tracker = await getApiTracker();
  return tracker[pageDomain] || null;
}

/**
 * Get list of tracked domains sorted by last visited
 */
export async function getTrackedDomains() {
  const tracker = await getApiTracker();
  const domains = Object.entries(tracker).map(([domain, data]) => ({
    domain,
    displayName: data.displayName,
    lastVisited: data.lastVisited,
    totalRequests: data.totalRequests,
    uniqueEndpoints: data.stats?.uniqueEndpoints || 0
  }));

  // Sort by last visited (most recent first)
  domains.sort((a, b) => b.lastVisited - a.lastVisited);
  return domains;
}

const MAX_PARAM_EXAMPLES = 5; // Max example values per parameter

/**
 * Extract query parameters with their values
 */
function extractQueryParamsWithValues(searchParams) {
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    if (!params[key]) {
      params[key] = [];
    }
    // Store unique values, limit to MAX_PARAM_EXAMPLES
    if (!params[key].includes(value) && params[key].length < MAX_PARAM_EXAMPLES) {
      params[key].push(value);
    }
  }
  return params;
}

/**
 * Merge parameter examples (new values into existing)
 */
function mergeParamExamples(existing, newParams) {
  const merged = { ...existing };
  for (const [key, values] of Object.entries(newParams)) {
    if (!merged[key]) {
      merged[key] = [];
    }
    for (const value of values) {
      if (!merged[key].includes(value) && merged[key].length < MAX_PARAM_EXAMPLES) {
        merged[key].push(value);
      }
    }
  }
  return merged;
}

/**
 * Track an API request
 */
export async function trackApiRequest(pageDomain, requestDetails) {
  const { url, method, requestHeaders } = requestDetails;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return; // Invalid URL, skip
  }

  const apiDomain = parsedUrl.hostname;
  const path = parsedUrl.pathname;
  const normalizedPath = normalizeApiPath(path);
  const queryParams = Array.from(parsedUrl.searchParams.keys());
  const queryParamExamples = extractQueryParamsWithValues(parsedUrl.searchParams);
  const { hasAuth, authType } = detectAuthType(requestHeaders);

  const endpointKey = `${apiDomain}::${normalizedPath}::${method}`;
  const now = Date.now();

  const tracker = await getApiTracker();

  // Initialize domain if not exists
  if (!tracker[pageDomain]) {
    tracker[pageDomain] = {
      displayName: pageDomain,
      lastVisited: now,
      totalRequests: 0,
      endpoints: {},
      stats: {
        uniqueEndpoints: 0,
        byApiDomain: {},
        byMethod: {}
      }
    };
  }

  const domainData = tracker[pageDomain];
  domainData.lastVisited = now;
  domainData.totalRequests++;

  // Check if endpoint exists
  if (domainData.endpoints[endpointKey]) {
    // Update existing endpoint
    const endpoint = domainData.endpoints[endpointKey];
    endpoint.count++;
    endpoint.lastSeen = now;

    // Merge new query params (keys)
    const existingParams = new Set(endpoint.queryParams || []);
    queryParams.forEach(p => existingParams.add(p));
    endpoint.queryParams = Array.from(existingParams);

    // Merge query param examples (values)
    endpoint.queryParamExamples = mergeParamExamples(
      endpoint.queryParamExamples || {},
      queryParamExamples
    );

    // Update auth info if newly detected
    if (hasAuth && !endpoint.hasAuth) {
      endpoint.hasAuth = hasAuth;
      endpoint.authType = authType;
    }

    // Store multiple example URLs (up to 3)
    if (!endpoint.exampleUrls) {
      endpoint.exampleUrls = [endpoint.exampleUrl];
    }
    if (!endpoint.exampleUrls.includes(url) && endpoint.exampleUrls.length < 3) {
      endpoint.exampleUrls.push(url);
    }
  } else {
    // Check endpoint limit
    const endpointCount = Object.keys(domainData.endpoints).length;
    if (endpointCount >= MAX_ENDPOINTS_PER_DOMAIN) {
      // Remove oldest endpoint (LRU)
      const oldestKey = Object.entries(domainData.endpoints)
        .sort(([, a], [, b]) => a.lastSeen - b.lastSeen)[0][0];
      delete domainData.endpoints[oldestKey];
    }

    // Create new endpoint
    domainData.endpoints[endpointKey] = {
      apiDomain,
      path,
      normalizedPath,
      method,
      queryParams,
      queryParamExamples,
      hasAuth,
      authType,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      exampleUrl: url,
      exampleUrls: [url]
    };

    // Update stats
    domainData.stats.uniqueEndpoints = Object.keys(domainData.endpoints).length;
    domainData.stats.byApiDomain[apiDomain] = (domainData.stats.byApiDomain[apiDomain] || 0) + 1;
  }

  // Update method stats
  domainData.stats.byMethod[method] = (domainData.stats.byMethod[method] || 0) + 1;

  // Check domain limit
  const domainCount = Object.keys(tracker).length;
  if (domainCount > MAX_TRACKED_DOMAINS) {
    // Remove oldest domain (LRU)
    const oldestDomain = Object.entries(tracker)
      .filter(([d]) => d !== pageDomain)
      .sort(([, a], [, b]) => a.lastVisited - b.lastVisited)[0][0];
    delete tracker[oldestDomain];
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.API_TRACKER]: tracker });
}

/**
 * Clear API tracker data
 */
export async function clearApiTracker(pageDomain = null) {
  if (pageDomain) {
    const tracker = await getApiTracker();
    delete tracker[pageDomain];
    await chrome.storage.local.set({ [STORAGE_KEYS.API_TRACKER]: tracker });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.API_TRACKER]: {} });
  }
}
