// Popup actions tests

import { jest } from '@jest/globals';
import {
  copyValue,
  getCopyOptions,
  formatCopyValue,
  showCopyMenu,
  removeItem,
  clearAll,
  clearHistory,
  toggleCapture,
  updateStatusUI
} from '../src/popup/popup-actions.js';

describe('popup-actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.runtime.sendMessage.mockClear();
    global.navigator.clipboard = {
      writeText: jest.fn(() => Promise.resolve())
    };
  });

  it('should copy value and show success toast', async () => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span>';
    document.body.appendChild(toast);

    await copyValue({ toast }, 'token-123', 'raw');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('token-123');
    expect(toast.querySelector('.toast-message').textContent).toBe('Copied value');
  });

  it('should use fallback label for unknown copy formats', async () => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span>';
    document.body.appendChild(toast);

    await copyValue({ toast }, 'token-123', 'unknown');
    expect(toast.querySelector('.toast-message').textContent).toBe('Copied to clipboard');
  });

  it('should default to raw format when none is provided', async () => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span>';
    document.body.appendChild(toast);

    await copyValue({ toast }, 'token-123');
    expect(toast.querySelector('.toast-message').textContent).toBe('Copied value');
  });

  it('should show failure toast on clipboard errors', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('fail'));

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span>';
    document.body.appendChild(toast);

    await copyValue({ toast }, 'token-123', 'raw');
    expect(toast.querySelector('.toast-message').textContent).toBe('Copy failed');
  });

  it('should build copy options based on data type', () => {
    const options = getCopyOptions({
      type: 'auth-token',
      headerName: 'Authorization',
      tokenType: 'bearer',
      value: 'Bearer abc',
      source: { domain: 'api.example.com' }
    });

    const formats = options.map(opt => opt.format);
    expect(formats).toEqual(expect.arrayContaining(['raw', 'header', 'curl', 'bearer-only']));
  });

  it('should return only raw option when no extra metadata', () => {
    const options = getCopyOptions({ type: 'custom', value: 'x' });
    expect(options).toHaveLength(1);
    expect(options[0].format).toBe('raw');
  });

  it('should format values for copy formats', () => {
    const authData = {
      type: 'auth-token',
      headerName: 'Authorization',
      value: 'Bearer abc',
      source: { domain: 'api.example.com', path: '/v1' }
    };
    const cookieData = {
      type: 'cookie',
      cookieName: 'session',
      value: 'abc',
      source: { domain: 'api.example.com', path: '/v1' }
    };
    const queryData = {
      type: 'query-param',
      paramName: 'token',
      value: 'abc',
      source: { domain: 'api.example.com', path: '/v1' }
    };
    const otherData = {
      type: 'other',
      value: 'abc',
      source: { domain: 'api.example.com', path: '/v1' }
    };
    const defaultData = {
      type: 'auth-token',
      value: 'abc'
    };

    expect(formatCopyValue(authData, 'raw')).toBe('Bearer abc');
    expect(formatCopyValue(authData, 'header')).toContain('Authorization: Bearer abc');
    expect(formatCopyValue(authData, 'curl')).toContain('-H "Authorization: Bearer abc"');
    expect(formatCopyValue(cookieData, 'curl')).toContain('Cookie: session=abc');
    expect(formatCopyValue(queryData, 'curl')).toContain('?token=abc');
    expect(formatCopyValue(otherData, 'curl')).toContain('curl -X GET');
    expect(formatCopyValue({ value: 'Bearer ABC' }, 'bearer-only')).toBe('ABC');
    expect(formatCopyValue({ value: 'plain' }, 'unknown')).toBe('plain');
    expect(formatCopyValue(defaultData, 'curl')).toContain('Authorization: abc');
  });

  it('should show copy menu and call onCopy', async () => {
    document.body.innerHTML = '<button class="copy-btn">Copy</button>';
    const button = document.querySelector('.copy-btn');
    button.getBoundingClientRect = () => ({ bottom: 10, right: 10 });

    const event = { target: button, stopPropagation: jest.fn() };
    const onCopy = jest.fn(() => Promise.resolve());

    showCopyMenu(event, { value: 'token', source: { domain: 'api.example.com' } }, 'key', {}, onCopy);

    const menu = document.querySelector('.copy-menu');
    expect(menu).toBeTruthy();

    const firstItem = menu.querySelector('.copy-menu-item');
    firstItem.dispatchEvent(new MouseEvent('click'));
    await Promise.resolve();

    expect(onCopy).toHaveBeenCalled();
    expect(document.querySelector('.copy-menu')).toBeNull();
  });

  it('should close copy menu on outside click', () => {
    jest.useFakeTimers();

    document.body.innerHTML = '<button class="copy-btn">Copy</button>';
    const button = document.querySelector('.copy-btn');
    button.getBoundingClientRect = () => ({ bottom: 10, right: 10 });

    const event = { target: button, stopPropagation: jest.fn() };
    showCopyMenu(event, { value: 'token', source: { domain: 'api.example.com' } }, 'key', {}, () => Promise.resolve());

    jest.runAllTimers();
    document.dispatchEvent(new MouseEvent('click'));

    expect(document.querySelector('.copy-menu')).toBeNull();

    jest.useRealTimers();
  });

  it('should keep copy menu open when clicking inside', () => {
    jest.useFakeTimers();

    document.body.innerHTML = '<button class="copy-btn">Copy</button>';
    const button = document.querySelector('.copy-btn');
    button.getBoundingClientRect = () => ({ bottom: 10, right: 10 });

    const event = { target: button, stopPropagation: jest.fn() };
    showCopyMenu(event, { value: 'token', source: { domain: 'api.example.com' } }, 'key', {}, () => Promise.resolve());

    jest.runAllTimers();

    const menu = document.querySelector('.copy-menu');
    menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.copy-menu')).not.toBeNull();

    jest.useRealTimers();
  });

  it('should replace existing copy menu', () => {
    document.body.innerHTML = '<button class="copy-btn">Copy</button>';
    const button = document.querySelector('.copy-btn');
    button.getBoundingClientRect = () => ({ bottom: 10, right: 10 });

    const event = { target: button, stopPropagation: jest.fn() };
    showCopyMenu(event, { value: 'token', source: { domain: 'api.example.com' } }, 'key', {}, () => Promise.resolve());
    showCopyMenu(event, { value: 'token', source: { domain: 'api.example.com' } }, 'key', {}, () => Promise.resolve());

    expect(document.querySelectorAll('.copy-menu').length).toBe(1);
  });

  it('should send messages for data operations', async () => {
    await removeItem('abc');
    await clearAll();
    await clearHistory();
    await toggleCapture(true);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REMOVE_ITEM', key: 'abc' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_ALL' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'TOGGLE_ENABLED', enabled: true });
  });

  it('should update status UI', () => {
    document.body.innerHTML = '<div id="statusBadge"><span class="status-text"></span></div><svg id="toggleIcon"></svg>';
    const elements = {
      statusBadge: document.getElementById('statusBadge'),
      toggleIcon: document.getElementById('toggleIcon')
    };

    updateStatusUI(elements, true);
    expect(elements.statusBadge.classList.contains('inactive')).toBe(false);
    expect(elements.statusBadge.querySelector('.status-text').textContent).toBe('ACTIVE');

    updateStatusUI(elements, false);
    expect(elements.statusBadge.classList.contains('inactive')).toBe(true);
    expect(elements.statusBadge.querySelector('.status-text').textContent).toBe('PAUSED');
  });
});
