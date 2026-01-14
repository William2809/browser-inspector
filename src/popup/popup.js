// Browser Inspector Popup - Main controller that orchestrates UI modules

import { applyTheme, sendMessage, showToast } from './popup-utils.js';
import {
  createEmptyState,
  createNoResultsHTML,
  createDataItemHTML,
  renderHistoryList,
  updateFilterCounts
} from './popup-render.js';
import {
  copyValue,
  showCopyMenu,
  removeItem,
  clearAll,
  clearHistory,
  toggleCapture,
  updateStatusUI
} from './popup-actions.js';
import {
  showAddRuleForm,
  hideAddRuleForm,
  saveRule,
  removeRule,
  renderRules
} from './popup-rules.js';
import {
  loadApiTracker,
  clearApiTrackerDomain,
  exportApiTrackerData
} from './popup-api-tracker.js';

// DOM Elements
const elements = {
  statusBadge: document.getElementById('statusBadge'),
  toggleBtn: document.getElementById('toggleBtn'),
  toggleIcon: document.getElementById('toggleIcon'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  capturedCount: document.getElementById('capturedCount'),
  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  filterChips: document.querySelectorAll('.filter-chip'),
  countAll: document.getElementById('countAll'),
  countBearer: document.getElementById('countBearer'),
  countCookie: document.getElementById('countCookie'),
  countQuery: document.getElementById('countQuery'),
  showingCount: document.getElementById('showingCount'),
  totalCount: document.getElementById('totalCount'),
  capturedList: document.getElementById('capturedList'),
  emptyState: document.getElementById('emptyState'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  historyList: document.getElementById('historyList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  rulesList: document.getElementById('rulesList'),
  addRuleBtn: document.getElementById('addRuleBtn'),
  addRuleForm: document.getElementById('addRuleForm'),
  cancelRuleBtn: document.getElementById('cancelRuleBtn'),
  saveRuleBtn: document.getElementById('saveRuleBtn'),
  ruleName: document.getElementById('ruleName'),
  ruleUrl: document.getElementById('ruleUrl'),
  ruleExtractFrom: document.getElementById('ruleExtractFrom'),
  ruleKey: document.getElementById('ruleKey'),
  settingsBtn: document.getElementById('settingsBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeToggleIcon: document.getElementById('themeToggleIcon'),
  toast: document.getElementById('toast'),
  // API Tracker elements
  apiCount: document.getElementById('apiCount'),
  apiDomainSelect: document.getElementById('apiDomainSelect'),
  apiStats: document.getElementById('apiStats'),
  apiSearchInput: document.getElementById('apiSearchInput'),
  apiEndpointList: document.getElementById('apiEndpointList'),
  clearApiBtn: document.getElementById('clearApiBtn'),
  exportApiBtn: document.getElementById('exportApiBtn'),
  exportAllApiBtn: document.getElementById('exportAllApiBtn')
};

// State
let isEnabled = true;
let capturedData = {};
let config = {};
let currentFilter = 'all';
let searchQuery = '';

// API Tracker State
let apiTrackerState = {
  currentApiDomain: '',
  apiSearchQuery: ''
};

// Initialize
async function init() {
  await loadData();
  setupEventListeners();
  setupMessageListener();
  render();
}

async function loadData() {
  try {
    [capturedData, config] = await Promise.all([
      sendMessage({ type: 'GET_CAPTURED_DATA' }),
      sendMessage({ type: 'GET_CONFIG' })
    ]);

    isEnabled = config.enabled !== false;
    config.theme = config.theme || 'dark';
    applyTheme(config.theme);
    updateThemeToggle(config.theme);
    updateStatusUI(elements, isEnabled);
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Event Listeners
function setupEventListeners() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  elements.toggleBtn.addEventListener('click', handleToggle);
  elements.searchInput.addEventListener('input', handleSearch);
  elements.clearSearch.addEventListener('click', handleClearSearch);

  elements.filterChips.forEach(chip => {
    chip.addEventListener('click', () => handleFilterClick(chip));
  });

  elements.clearAllBtn.addEventListener('click', handleClearAll);
  elements.clearHistoryBtn.addEventListener('click', handleClearHistory);

  elements.addRuleBtn.addEventListener('click', () => showAddRuleForm(elements));
  elements.cancelRuleBtn.addEventListener('click', () => hideAddRuleForm(elements));
  elements.saveRuleBtn.addEventListener('click', handleSaveRule);

  elements.settingsBtn.addEventListener('click', () => {
    showToast(elements, 'Settings coming soon');
  });

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', handleThemeToggle);
  }

  // API Tracker event listeners
  if (elements.apiSearchInput) {
    elements.apiSearchInput.addEventListener('input', handleApiSearch);
  }
  if (elements.clearApiBtn) {
    elements.clearApiBtn.addEventListener('click', handleClearApiTracker);
  }
  if (elements.exportApiBtn) {
    elements.exportApiBtn.addEventListener('click', handleExportCurrentDomain);
  }
  if (elements.exportAllApiBtn) {
    elements.exportAllApiBtn.addEventListener('click', handleExportAllDomains);
  }
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DATA_CAPTURED') {
      capturedData[message.key] = message.currentData || message.data;
      render();
      showToast(elements, `Captured ${message.data.displayName}`);
    } else if (message.type === 'TOKEN_ROTATED') {
      capturedData[message.key] = message.currentData;
      render();
      const rotationCount = message.currentData?.rotationCount || 1;
      showToast(elements, `🔄 ${message.data.displayName} rotated (#${rotationCount})`);
    } else if (message.type === 'API_TRACKED') {
      // Refresh API tracker if the panel is active
      const apisPanel = document.getElementById('apisPanel');
      if (apisPanel && apisPanel.classList.contains('active')) {
        refreshApiTracker();
      }
    }
  });
}

// Event Handlers
async function handleToggle() {
  isEnabled = !isEnabled;
  await toggleCapture(isEnabled);
  updateStatusUI(elements, isEnabled);
  showToast(elements, isEnabled ? 'Capture enabled' : 'Capture disabled');
}

async function handleThemeToggle() {
  const nextTheme = config.theme === 'light' ? 'dark' : 'light';
  config = { ...config, theme: nextTheme };
  applyTheme(nextTheme);
  updateThemeToggle(nextTheme);
  try {
    await sendMessage({ type: 'SET_CONFIG', config });
    showToast(elements, `${nextTheme === 'light' ? 'Light' : 'Dark'} theme enabled`);
  } catch (error) {
    console.error('Failed to update theme:', error);
    showToast(elements, 'Theme update failed');
  }
}

function updateThemeToggle(theme) {
  if (!elements.themeToggleBtn || !elements.themeToggleIcon) return;
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const label = `Switch to ${nextTheme} theme`;
  elements.themeToggleBtn.setAttribute('title', label);
  elements.themeToggleBtn.setAttribute('aria-label', label);
  elements.themeToggleBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');

  const sunIcon = `
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  `;
  const moonIcon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  elements.themeToggleIcon.innerHTML = nextTheme === 'light' ? sunIcon : moonIcon;
}

function handleSearch(e) {
  searchQuery = e.target.value.toLowerCase().trim();
  elements.clearSearch.classList.toggle('visible', searchQuery.length > 0);
  render();
}

function handleClearSearch() {
  elements.searchInput.value = '';
  searchQuery = '';
  elements.clearSearch.classList.remove('visible');
  render();
}

function handleFilterClick(chip) {
  const filter = chip.dataset.filter;
  currentFilter = (currentFilter === filter && filter !== 'all') ? 'all' : filter;

  elements.filterChips.forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentFilter);
  });

  render();
}

async function handleClearAll() {
  await clearAll();
  capturedData = {};
  render();
  showToast(elements, 'All data cleared');
}

async function handleClearHistory() {
  await clearHistory();
  loadHistory();
  showToast(elements, 'History cleared');
}

async function handleSaveRule() {
  await saveRule(elements, async () => {
    await loadData();
    renderRules(elements, config, handleDeleteRule);
  });
}

async function handleDeleteRule(ruleName) {
  await removeRule(elements, ruleName, async () => {
    await loadData();
    renderRules(elements, config, handleDeleteRule);
  });
}

async function handleRemoveItem(key) {
  capturedData = await removeItem(key);
  render();
  showToast(elements, 'Item removed');
}

function handleCopyClick(e, key) {
  const data = capturedData[key];
  if (data) {
    showCopyMenu(e, data, key, elements, (text, format) => copyValue(elements, text, format));
  }
}

// Tab switching
function switchTab(tabName) {
  elements.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  elements.panels.forEach(p => p.classList.toggle('active', p.id === `${tabName}Panel`));

  if (tabName === 'history') {
    loadHistory();
  } else if (tabName === 'rules') {
    renderRules(elements, config, handleDeleteRule);
  } else if (tabName === 'apis') {
    refreshApiTracker();
  }
}

// History loading
async function loadHistory() {
  const history = await sendMessage({ type: 'GET_HISTORY' });
  renderHistoryList(elements, history || [], (value) => copyValue(elements, value));
}

// Filtering
function getFilteredData() {
  const items = Object.entries(capturedData);

  return items.filter(([key, data]) => {
    if (currentFilter !== 'all') {
      if (currentFilter === 'bearer' && data.tokenType !== 'bearer' && data.type !== 'auth-token') {
        return false;
      }
      if (currentFilter === 'cookie' && data.type !== 'cookie') {
        return false;
      }
      if (currentFilter === 'query-param' && data.type !== 'query-param') {
        return false;
      }
    }

    if (searchQuery) {
      const searchableText = [
        data.value || '',
        data.source?.domain || '',
        data.displayName || '',
        data.type || '',
        data.tokenType || '',
        data.headerName || '',
        key
      ].join(' ').toLowerCase();

      if (!searchableText.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });
}

function getCounts() {
  const items = Object.values(capturedData);

  return {
    all: items.length,
    bearer: items.filter(d => d.tokenType === 'bearer' || d.type === 'auth-token').length,
    cookie: items.filter(d => d.type === 'cookie').length,
    query: items.filter(d => d.type === 'query-param').length
  };
}

// Main render function
function render() {
  const filteredItems = getFilteredData();
  const counts = getCounts();

  updateFilterCounts(elements, counts, filteredItems.length);

  elements.filterChips.forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentFilter);
  });

  if (counts.all === 0) {
    elements.capturedList.innerHTML = '';
    elements.capturedList.appendChild(createEmptyState());
    return;
  }

  if (filteredItems.length === 0) {
    elements.capturedList.innerHTML = createNoResultsHTML();
    return;
  }

  elements.capturedList.innerHTML = filteredItems.map(([key, data]) =>
    createDataItemHTML(key, data, searchQuery)
  ).join('');

  // Attach event listeners
  elements.capturedList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleCopyClick(e, btn.dataset.key));
  });

  elements.capturedList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRemoveItem(btn.dataset.key);
    });
  });
}

// API Tracker functions
async function refreshApiTracker() {
  await loadApiTracker(elements, apiTrackerState, {
    onDomainChange: handleApiDomainChange,
    onCopyUrl: (url) => copyValue(elements, url, 'URL')
  });
}

function handleApiDomainChange(domain) {
  apiTrackerState.currentApiDomain = domain;
  refreshApiTracker();
}

function handleApiSearch(e) {
  apiTrackerState.apiSearchQuery = e.target.value.toLowerCase().trim();
  refreshApiTracker();
}

async function handleClearApiTracker() {
  await clearApiTrackerDomain(elements, apiTrackerState.currentApiDomain);
  apiTrackerState.currentApiDomain = '';
  refreshApiTracker();
}

async function handleExportCurrentDomain() {
  if (!apiTrackerState.currentApiDomain) {
    showToast(elements, 'Select a domain first');
    return;
  }
  await exportApiTrackerData(elements, apiTrackerState.currentApiDomain);
}

async function handleExportAllDomains() {
  await exportApiTrackerData(elements, null);
}

// Initialize on load
init();
