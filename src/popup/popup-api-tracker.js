// Popup API Tracker - UI for displaying tracked API requests

import { sendMessage, showToast, escapeHtml, getTimeAgo } from './popup-utils.js';

/**
 * Export API tracker data as JSON file
 */
export async function exportApiTrackerData(elements, domain = null) {
  try {
    let data;
    let filename;

    if (domain) {
      // Export single domain
      data = await sendMessage({ type: 'GET_API_TRACKER_FOR_DOMAIN', domain });
      if (!data) {
        showToast(elements, 'No data to export');
        return;
      }
      // Format for analysis
      data = formatDomainDataForExport(domain, data);
      filename = `api-tracker-${domain}-${getDateString()}.json`;
    } else {
      // Export all domains
      const tracker = await sendMessage({ type: 'GET_API_TRACKER' });
      if (!tracker || Object.keys(tracker).length === 0) {
        showToast(elements, 'No data to export');
        return;
      }
      data = formatAllDataForExport(tracker);
      filename = `api-tracker-all-${getDateString()}.json`;
    }

    // Create and download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(elements, `Exported to ${filename}`);
  } catch (error) {
    console.error('Export failed:', error);
    showToast(elements, 'Export failed');
  }
}

function getDateString() {
  const now = new Date();
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Format single domain data for export/analysis
 * Note: Only auth type is included, not actual tokens
 */
function formatDomainDataForExport(domain, domainData) {
  const endpoints = Object.entries(domainData.endpoints || {}).map(([key, ep]) => ({
    id: key,
    method: ep.method,
    apiDomain: ep.apiDomain,
    path: ep.path,
    normalizedPath: ep.normalizedPath,
    fullUrl: ep.exampleUrl,
    exampleUrls: ep.exampleUrls || [ep.exampleUrl],
    parameters: formatParametersForExport(ep),
    authentication: {
      required: ep.hasAuth || false,
      type: ep.authType || null
    },
    stats: {
      callCount: ep.count,
      firstSeen: new Date(ep.firstSeen).toISOString(),
      lastSeen: new Date(ep.lastSeen).toISOString()
    }
  }));

  // Sort by call count (most used first)
  endpoints.sort((a, b) => b.stats.callCount - a.stats.callCount);

  return {
    exportedAt: new Date().toISOString(),
    exportType: 'single-domain',
    domain: domain,
    summary: {
      totalEndpoints: endpoints.length,
      totalRequests: domainData.totalRequests,
      lastVisited: new Date(domainData.lastVisited).toISOString(),
      methodBreakdown: domainData.stats?.byMethod || {},
      apiDomains: Object.keys(domainData.stats?.byApiDomain || {})
    },
    endpoints: endpoints
  };
}

/**
 * Format all tracker data for export
 */
function formatAllDataForExport(tracker) {
  const domains = Object.entries(tracker).map(([domain, data]) =>
    formatDomainDataForExport(domain, data)
  );

  // Sort by last visited
  domains.sort((a, b) => new Date(b.summary.lastVisited) - new Date(a.summary.lastVisited));

  const totalEndpoints = domains.reduce((sum, d) => sum + d.summary.totalEndpoints, 0);
  const totalRequests = domains.reduce((sum, d) => sum + d.summary.totalRequests, 0);

  return {
    exportedAt: new Date().toISOString(),
    exportType: 'all-domains',
    summary: {
      totalDomains: domains.length,
      totalEndpoints: totalEndpoints,
      totalRequests: totalRequests
    },
    domains: domains
  };
}

/**
 * Format parameters for export with examples
 */
function formatParametersForExport(endpoint) {
  const params = endpoint.queryParams || [];
  const examples = endpoint.queryParamExamples || {};

  if (params.length === 0) {
    return null;
  }

  return params.map(param => ({
    name: param,
    exampleValues: examples[param] || [],
    description: inferParamDescription(param, examples[param] || [])
  }));
}

/**
 * Infer parameter description based on name and values
 */
function inferParamDescription(paramName, values) {
  const name = paramName.toLowerCase();

  // Common parameter patterns
  if (name.includes('page') || name === 'p') return 'Pagination - page number';
  if (name.includes('limit') || name === 'size' || name === 'per_page') return 'Pagination - items per page';
  if (name.includes('offset') || name === 'skip') return 'Pagination - offset/skip';
  if (name.includes('sort') || name === 'order') return 'Sorting parameter';
  if (name.includes('filter') || name === 'q' || name === 'query' || name === 'search') return 'Search/filter parameter';
  if (name.includes('start') || name.includes('from') || name.includes('begin')) return 'Range start (date/time/id)';
  if (name.includes('end') || name.includes('to') || name.includes('until')) return 'Range end (date/time/id)';
  if (name.includes('id') || name.includes('_id')) return 'Identifier parameter';
  if (name.includes('token') || name.includes('key') || name.includes('api')) return 'Authentication/API key';
  if (name.includes('type') || name.includes('category')) return 'Type/category filter';
  if (name.includes('format')) return 'Response format';
  if (name.includes('callback') || name === 'jsonp') return 'JSONP callback';
  if (name.includes('timestamp') || name === 't' || name === 'ts') return 'Timestamp/cache buster';
  if (name.includes('lang') || name.includes('locale')) return 'Language/locale';

  // Infer from values if available
  if (values.length > 0) {
    const firstVal = values[0];
    if (/^\d+$/.test(firstVal)) return 'Numeric parameter';
    if (/^\d{4}-\d{2}-\d{2}/.test(firstVal)) return 'Date parameter (ISO format)';
    if (/^(true|false)$/i.test(firstVal)) return 'Boolean flag';
  }

  return null;
}

/**
 * Render the domain selector dropdown
 */
export function renderDomainSelector(elements, domains, currentDomain, onChange) {
  if (domains.length === 0) {
    elements.apiDomainSelect.innerHTML = '<option value="">No domains tracked</option>';
    elements.apiDomainSelect.disabled = true;
    return;
  }

  elements.apiDomainSelect.disabled = false;
  elements.apiDomainSelect.innerHTML = domains.map(d => `
    <option value="${escapeHtml(d.domain)}" ${d.domain === currentDomain ? 'selected' : ''}>
      ${escapeHtml(d.displayName)} (${d.uniqueEndpoints} endpoints)
    </option>
  `).join('');

  elements.apiDomainSelect.onchange = (e) => onChange(e.target.value);
}

/**
 * Render API stats summary
 */
export function renderApiStats(elements, domainData) {
  if (!domainData) {
    elements.apiStats.innerHTML = '<span class="api-stat-empty">Select a domain to view stats</span>';
    return;
  }

  const stats = domainData.stats || {};
  const methodCounts = Object.entries(stats.byMethod || {})
    .map(([method, count]) => `<span class="method-badge ${method.toLowerCase()}">${method}: ${count}</span>`)
    .join('');

  elements.apiStats.innerHTML = `
    <div class="api-stat-row">
      <span class="api-stat-label">Endpoints:</span>
      <span class="api-stat-value">${stats.uniqueEndpoints || 0}</span>
    </div>
    <div class="api-stat-row">
      <span class="api-stat-label">Total Requests:</span>
      <span class="api-stat-value">${domainData.totalRequests || 0}</span>
    </div>
    <div class="api-stat-row">
      <span class="api-stat-label">Methods:</span>
      <span class="api-stat-methods">${methodCounts || 'None'}</span>
    </div>
  `;
}

/**
 * Render endpoint list
 */
export function renderEndpointList(elements, domainData, searchQuery, onCopyUrl) {
  if (!domainData || !domainData.endpoints) {
    elements.apiEndpointList.innerHTML = `
      <div class="empty-state">
        <p class="empty-text">No API requests tracked yet</p>
        <p class="empty-subtext">Browse a website to capture its API calls</p>
      </div>
    `;
    return;
  }

  let endpoints = Object.entries(domainData.endpoints)
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.lastSeen - a.lastSeen);

  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    endpoints = endpoints.filter(ep =>
      ep.path.toLowerCase().includes(query) ||
      ep.apiDomain.toLowerCase().includes(query) ||
      ep.method.toLowerCase().includes(query) ||
      (ep.queryParams || []).some(p => p.toLowerCase().includes(query))
    );
  }

  if (endpoints.length === 0) {
    elements.apiEndpointList.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p class="no-results-text">No matching endpoints</p>
      </div>
    `;
    return;
  }

  elements.apiEndpointList.innerHTML = endpoints.map(ep => createEndpointItemHTML(ep)).join('');

  // Attach copy handlers
  elements.apiEndpointList.querySelectorAll('.api-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      onCopyUrl(url);
    });
  });
}

/**
 * Create HTML for a single endpoint item
 */
function createEndpointItemHTML(endpoint) {
  const methodClass = endpoint.method.toLowerCase();
  const authBadge = endpoint.hasAuth
    ? `<span class="auth-badge" title="Requires ${endpoint.authType || 'auth'}">🔐</span>`
    : '';

  const params = endpoint.queryParams?.length > 0
    ? `<div class="endpoint-params">Params: ${endpoint.queryParams.map(p => escapeHtml(p)).join(', ')}</div>`
    : '';

  return `
    <div class="endpoint-item">
      <div class="endpoint-header">
        <span class="endpoint-method ${methodClass}">${endpoint.method}</span>
        <span class="endpoint-path">${escapeHtml(endpoint.normalizedPath || endpoint.path)}</span>
        ${authBadge}
      </div>
      <div class="endpoint-domain">${escapeHtml(endpoint.apiDomain)}</div>
      ${params}
      <div class="endpoint-meta">
        <span class="endpoint-count">${endpoint.count} call${endpoint.count !== 1 ? 's' : ''}</span>
        <span class="endpoint-time">${getTimeAgo(endpoint.lastSeen)}</span>
        <button class="api-copy-btn" data-url="${escapeHtml(endpoint.exampleUrl)}" title="Copy example URL">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Load and render API tracker data
 */
export async function loadApiTracker(elements, state, handlers) {
  const domains = await sendMessage({ type: 'GET_TRACKED_DOMAINS' });

  // Update domain count in tab
  const totalEndpoints = domains.reduce((sum, d) => sum + d.uniqueEndpoints, 0);
  if (elements.apiCount) {
    elements.apiCount.textContent = totalEndpoints;
  }

  renderDomainSelector(elements, domains, state.currentApiDomain, handlers.onDomainChange);

  if (domains.length > 0 && !state.currentApiDomain) {
    state.currentApiDomain = domains[0].domain;
  }

  if (state.currentApiDomain) {
    const domainData = await sendMessage({
      type: 'GET_API_TRACKER_FOR_DOMAIN',
      domain: state.currentApiDomain
    });

    renderApiStats(elements, domainData);
    renderEndpointList(elements, domainData, state.apiSearchQuery, handlers.onCopyUrl);
  } else {
    renderApiStats(elements, null);
    renderEndpointList(elements, null, '', handlers.onCopyUrl);
  }
}

/**
 * Clear API tracker for current domain
 */
export async function clearApiTrackerDomain(elements, domain) {
  await sendMessage({ type: 'CLEAR_API_TRACKER', domain });
  showToast(elements, domain ? `Cleared ${domain} data` : 'Cleared all API data');
}
