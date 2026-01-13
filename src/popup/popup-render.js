// Popup rendering - UI rendering functions for captured data display

import { escapeHtml, getTimeAgo, highlightMatches } from './popup-utils.js';

// Get CSS class for data type styling
export function getTypeClass(data) {
  if (data.type === 'cookie') return 'cookie';
  if (data.type === 'query-param') return 'query-param';
  if (data.type === 'custom') return 'custom';
  return '';
}

// Create empty state element
export function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        <path d="M9 10h.01M15 10h.01M9.5 15.5s1.5 1 2.5 1 2.5-1 2.5-1"/>
      </svg>
    </div>
    <p class="empty-text">No data captured yet</p>
    <p class="empty-subtext">Browse sites with auth tokens to capture them</p>
  `;
  return div;
}

// Create no results HTML for search
export function createNoResultsHTML() {
  return `
    <div class="no-results">
      <div class="no-results-icon">🔍</div>
      <p class="no-results-text">No matches found</p>
      <p class="no-results-hint">Try a different search or filter</p>
    </div>
  `;
}

// Create HTML for a single data item
export function createDataItemHTML(key, data, searchQuery) {
  const typeClass = getTypeClass(data);
  const truncatedValue = data.value.length > 60 ? data.value.substring(0, 60) + '...' : data.value;
  const timeAgo = getTimeAgo(data.capturedAt);
  const hasRotated = data.rotationCount > 0;
  const rotationClass = hasRotated ? 'rotated' : '';

  // Highlight search matches
  let displayValue = escapeHtml(truncatedValue);
  if (searchQuery) {
    displayValue = highlightMatches(displayValue, searchQuery);
  }

  // Build rotation badge HTML
  const rotationBadge = hasRotated ? `
    <span class="rotation-badge" title="Token has been rotated ${data.rotationCount} time(s)">
      🔄 ${data.rotationCount}
    </span>
  ` : '';

  // Build rotation info for meta
  const rotationMeta = hasRotated ? `
    <span class="rotation-meta" title="Last rotated">🔄 ${getTimeAgo(data.lastRotatedAt)}</span>
  ` : '';

  return `
    <div class="data-item ${typeClass} ${rotationClass}">
      <div class="data-item-header">
        <div class="data-item-info">
          <div class="data-item-type">
            <span>◈</span>
            ${data.displayName || data.type}
            ${rotationBadge}
          </div>
          <div class="data-item-domain">${escapeHtml(data.source?.domain || 'Unknown')}</div>
        </div>
        <div class="data-item-actions">
          <button class="data-item-btn copy-btn" data-key="${escapeHtml(key)}" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button class="data-item-btn delete delete-btn" data-key="${escapeHtml(key)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="data-item-value">${displayValue}</div>
      <div class="data-item-meta">
        <span>⏱ ${timeAgo}</span>
        ${data.headerName ? `<span>◉ ${escapeHtml(data.headerName)}</span>` : ''}
        ${data.tokenType ? `<span>◈ ${escapeHtml(data.tokenType)}</span>` : ''}
        ${rotationMeta}
      </div>
    </div>
  `;
}

// Create history item HTML
export function createHistoryItemHTML(item) {
  return `
    <div class="history-item ${item.type || ''}" data-value="${escapeHtml(item.value)}">
      <div class="history-dot"></div>
      <div class="history-info">
        <div class="history-domain">${escapeHtml(item.source?.domain || item.key)}</div>
        <div class="history-time">${getTimeAgo(item.timestamp)}</div>
      </div>
    </div>
  `;
}

// Render history list
export function renderHistoryList(elements, history, onItemClick) {
  if (history.length === 0) {
    elements.historyList.innerHTML = `
      <div class="empty-state">
        <p class="empty-text">No history yet</p>
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = history.map(item => createHistoryItemHTML(item)).join('');

  elements.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => onItemClick(item.dataset.value));
  });
}

// Update filter counts display
export function updateFilterCounts(elements, counts, filteredCount) {
  elements.capturedCount.textContent = counts.all;
  elements.countAll.textContent = counts.all;
  elements.countBearer.textContent = counts.bearer;
  elements.countCookie.textContent = counts.cookie;
  elements.countQuery.textContent = counts.query;
  elements.totalCount.textContent = counts.all;
  elements.showingCount.textContent = filteredCount;
}
