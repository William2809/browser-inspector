// Popup actions - user interaction handlers for copy, delete, and toggle operations

import { sendMessage, showToast } from './popup-utils.js';

// Copy value to clipboard
export async function copyValue(elements, value, format = 'raw') {
  try {
    await navigator.clipboard.writeText(value);
    const labels = {
      'raw': 'Copied value',
      'header': 'Copied header',
      'curl': 'Copied cURL',
      'bearer-only': 'Copied token'
    };
    showToast(elements, labels[format] || 'Copied to clipboard');
  } catch (err) {
    console.error('Copy failed:', err);
    showToast(elements, 'Copy failed');
  }
}

// Get copy format options based on data type
export function getCopyOptions(data) {
  const options = [
    { format: 'raw', label: 'Raw Value', icon: '◈' }
  ];

  // Add header format for auth tokens
  if (data.type === 'auth-token' && data.headerName) {
    options.push({
      format: 'header',
      label: `${data.headerName}: ...`,
      icon: '◉'
    });
  }

  // Add cURL format
  if (data.source?.domain) {
    options.push({
      format: 'curl',
      label: 'cURL Command',
      icon: '⌘'
    });
  }

  // Add Bearer format if it's a bearer token
  if (data.tokenType === 'bearer' || data.value?.toLowerCase().startsWith('bearer ')) {
    options.push({
      format: 'bearer-only',
      label: 'Token Only (no Bearer)',
      icon: '◇'
    });
  }

  return options;
}

// Format value for copying based on selected format
export function formatCopyValue(data, format) {
  switch (format) {
    case 'raw':
      return data.value;

    case 'header':
      return `${data.headerName}: ${data.value}`;

    case 'curl': {
      const domain = data.source?.domain || 'example.com';
      const path = data.source?.path || '/';
      const url = `https://${domain}${path}`;

      if (data.type === 'auth-token') {
        return `curl -X GET "${url}" \\\n  -H "${data.headerName || 'Authorization'}: ${data.value}"`;
      } else if (data.type === 'cookie') {
        return `curl -X GET "${url}" \\\n  -H "Cookie: ${data.cookieName}=${data.value}"`;
      } else if (data.type === 'query-param') {
        const urlWithParam = `${url}?${data.paramName}=${data.value}`;
        return `curl -X GET "${urlWithParam}"`;
      }
      return `curl -X GET "${url}"`;
    }

    case 'bearer-only':
      // Remove "Bearer " prefix if present
      return data.value.replace(/^bearer\s+/i, '');

    default:
      return data.value;
  }
}

// Show copy format menu
export function showCopyMenu(event, data, key, elements, onCopy) {
  event.stopPropagation();

  // Remove any existing menu
  const existingMenu = document.querySelector('.copy-menu');
  if (existingMenu) existingMenu.remove();

  const menu = document.createElement('div');
  menu.className = 'copy-menu';

  const options = getCopyOptions(data);

  menu.innerHTML = options.map(opt => `
    <button class="copy-menu-item" data-format="${opt.format}">
      <span class="copy-menu-icon">${opt.icon}</span>
      <span class="copy-menu-label">${opt.label}</span>
    </button>
  `).join('');

  // Position menu
  const rect = event.target.closest('.copy-btn').getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  document.body.appendChild(menu);

  // Handle clicks
  menu.querySelectorAll('.copy-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const format = item.dataset.format;
      const text = formatCopyValue(data, format);
      await onCopy(text, format);
      menu.remove();
    });
  });

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}

// Remove a captured item
export async function removeItem(key) {
  return await sendMessage({ type: 'REMOVE_ITEM', key });
}

// Clear all captured data
export async function clearAll() {
  await sendMessage({ type: 'CLEAR_ALL' });
}

// Clear history
export async function clearHistory() {
  await sendMessage({ type: 'CLEAR_HISTORY' });
}

// Toggle capture enabled/disabled
export async function toggleCapture(isEnabled) {
  await sendMessage({ type: 'TOGGLE_ENABLED', enabled: isEnabled });
}

// Update status UI based on enabled state
export function updateStatusUI(elements, isEnabled) {
  elements.statusBadge.classList.toggle('inactive', !isEnabled);
  elements.statusBadge.querySelector('.status-text').textContent = isEnabled ? 'ACTIVE' : 'PAUSED';

  if (isEnabled) {
    elements.toggleIcon.innerHTML = `
      <circle cx="12" cy="12" r="10"/>
      <line x1="10" y1="15" x2="10" y2="9"/>
      <line x1="14" y1="15" x2="14" y2="9"/>
    `;
  } else {
    elements.toggleIcon.innerHTML = `
      <circle cx="12" cy="12" r="10"/>
      <polygon points="10,8 16,12 10,16"/>
    `;
  }
}
