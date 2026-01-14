// Browser Interceptor - Service Worker for request interception
// 100% LOCAL - No data is sent externally

import { HandlerManager } from '../handlers/index.js';
import {
  getCapturedData,
  updateCapturedItem,
  removeCapturedItem,
  getConfig,
  setConfig,
  getHistory,
  clearHistory,
  clearAllCapturedData,
  getExpiredTokens,
  clearExpiredTokens,
  shouldCaptureDomain,
  // API Tracker
  trackApiRequest,
  getApiTracker,
  getTrackedDomains,
  getApiTrackerForDomain,
  clearApiTracker,
  extractRootDomain
} from '../lib/storage.js';

// Initialize handler manager
const handlerManager = new HandlerManager();

// Track active state
let isEnabled = true;

// Initialize on startup
async function initialize() {
  console.log('[Browser Interceptor] Initializing...');

  const config = await getConfig();
  isEnabled = config.enabled !== false;

  handlerManager.initialize({
    authToken: config.authTokenConfig || {},
    cookie: config.cookieConfig || {},
    customRules: config.rules || []
  });

  console.log('[Browser Interceptor] Initialized with handlers:', handlerManager.getCapabilities());
}

// Set up request listener
chrome.webRequest.onBeforeSendHeaders.addListener(
  handleRequest,
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);

async function handleRequest(details) {
  if (!isEnabled) return;

  // Skip extension and chrome URLs
  if (details.url.startsWith('chrome://') ||
      details.url.startsWith('chrome-extension://') ||
      details.url.startsWith('moz-extension://')) {
    return;
  }

  // Apply domain filtering
  try {
    const url = new URL(details.url);
    const config = await getConfig();

    if (!shouldCaptureDomain(url.hostname, config)) {
      return; // Skip this domain
    }
  } catch (e) {
    // Invalid URL, skip
    return;
  }

  // Track API requests (XHR/fetch) grouped by page domain
  if (details.type === 'xmlhttprequest' && details.tabId > 0) {
    handleApiMonitoring(details);
  }

  try {
    const results = handlerManager.processRequest(details);

    for (const result of results) {
      const key = generateKey(result);
      const { data, rotationDetected, previousToken } = await updateCapturedItem(key, result);

      // Notify popup if open
      chrome.runtime.sendMessage({
        type: rotationDetected ? 'TOKEN_ROTATED' : 'DATA_CAPTURED',
        key,
        data: result,
        rotationDetected,
        previousToken,
        currentData: data[key]
      }).catch(() => {
        // Popup not open, ignore
      });

      // Show notification if enabled
      const config = await getConfig();
      if (config.notifications) {
        if (rotationDetected) {
          showRotationNotification(result, data[key]);
        } else {
          showNotification(result);
        }
      }
    }
  } catch (error) {
    console.error('[Browser Interceptor] Error processing request:', error);
  }
}

function generateKey(result) {
  const domain = result.source?.domain || 'unknown';
  const type = result.type || 'unknown';
  const path = result.source?.path || '';

  // Normalize path to create a pattern (e.g., /api/v1/users/123 -> /api/v1/users/*)
  // This groups tokens from the same API endpoint together
  const pathPattern = normalizePathPattern(path);

  // Include header name for auth tokens to distinguish different auth headers
  const headerName = result.headerName || '';

  return `${domain}::${pathPattern}::${type}${headerName ? `::${headerName}` : ''}`;
}

function normalizePathPattern(path) {
  if (!path) return '';

  // Remove query string if present
  const cleanPath = path.split('?')[0];

  // Split path and normalize numeric/UUID segments to wildcards
  const segments = cleanPath.split('/').map(segment => {
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

function showNotification(result) {
  const domain = result.source?.domain || 'unknown';

  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
    title: 'Browser Interceptor',
    message: `Captured ${result.displayName} from ${domain}`,
    priority: 0
  });
}

function showRotationNotification(result, storedData) {
  const domain = result.source?.domain || 'unknown';
  const rotationCount = storedData?.rotationCount || 1;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
    title: '🔄 Token Rotated',
    message: `${result.displayName} from ${domain} has been refreshed (rotation #${rotationCount}). Old token marked as expired.`,
    priority: 1
  });
}

// API Monitoring - record XHR/fetch requests grouped by page domain
async function handleApiMonitoring(details) {
  try {
    // Get the tab to find the page URL
    const tab = await chrome.tabs.get(details.tabId);
    if (!tab || !tab.url) return;

    // Skip recording for extension pages, new tabs, etc.
    if (tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://')) {
      return;
    }

    const pageUrl = new URL(tab.url);
    const pageDomain = extractRootDomain(pageUrl.hostname);

    if (!pageDomain) return;

    await trackApiRequest(pageDomain, {
      url: details.url,
      method: details.method,
      requestHeaders: details.requestHeaders
    });

    // Notify popup if open (for real-time updates)
    chrome.runtime.sendMessage({
      type: 'API_TRACKED',
      pageDomain,
      url: details.url,
      method: details.method
    }).catch(() => {
      // Popup not open, ignore
    });
  } catch (error) {
    // Tab might not exist or other error - silently fail
  }
}

// Message handling for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_CAPTURED_DATA':
      return await getCapturedData();

    case 'GET_HISTORY':
      return await getHistory();

    case 'CLEAR_HISTORY':
      await clearHistory();
      return { success: true };

    case 'REMOVE_ITEM':
      await removeCapturedItem(message.key);
      return await getCapturedData();

    case 'CLEAR_ALL':
      await clearAllCapturedData();
      return { success: true };

    case 'GET_CONFIG':
      return await getConfig();

    case 'SET_CONFIG':
      await setConfig(message.config);
      isEnabled = message.config.enabled !== false;
      handlerManager.initialize({
        authToken: message.config.authTokenConfig || {},
        cookie: message.config.cookieConfig || {},
        customRules: message.config.rules || []
      });
      return { success: true };

    case 'TOGGLE_ENABLED':
      isEnabled = message.enabled;
      const config = await getConfig();
      config.enabled = isEnabled;
      await setConfig(config);
      return { enabled: isEnabled };

    case 'GET_CAPABILITIES':
      return handlerManager.getCapabilities();

    case 'ADD_CUSTOM_RULE':
      const config2 = await getConfig();
      config2.rules = config2.rules || [];
      config2.rules.push(message.rule);
      await setConfig(config2);
      handlerManager.addCustomHandler(message.rule);
      return { success: true, rules: config2.rules };

    case 'REMOVE_CUSTOM_RULE':
      const config3 = await getConfig();
      config3.rules = (config3.rules || []).filter(r => r.name !== message.name);
      await setConfig(config3);
      handlerManager.removeCustomHandler(message.name);
      return { success: true, rules: config3.rules };

    case 'GET_EXPIRED_TOKENS':
      return await getExpiredTokens();

    case 'CLEAR_EXPIRED_TOKENS':
      await clearExpiredTokens();
      return { success: true };

    // API Tracker messages
    case 'GET_API_TRACKER':
      return await getApiTracker();

    case 'GET_TRACKED_DOMAINS':
      return await getTrackedDomains();

    case 'GET_API_TRACKER_FOR_DOMAIN':
      return await getApiTrackerForDomain(message.domain);

    case 'CLEAR_API_TRACKER':
      await clearApiTracker(message.domain);
      return { success: true };

    default:
      return { error: 'Unknown message type' };
  }
}

// Initialize on load
initialize();

// Re-initialize when storage changes (e.g., from options page)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.config) {
    initialize();
  }
});
