// Popup utils tests

import { jest } from '@jest/globals';
import {
  sendMessage,
  showToast,
  escapeHtml,
  getTimeAgo,
  formatTime,
  escapeRegex,
  highlightMatches
} from '../src/popup/popup-utils.js';

describe('popup-utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetMockStorage();
  });

  it('should send messages via chrome.runtime', async () => {
    const message = { type: 'TEST' };
    await sendMessage(message);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
  });

  it('should show and hide toast messages', () => {
    jest.useFakeTimers();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span>';
    document.body.appendChild(toast);

    showToast({ toast }, 'Hello');
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.querySelector('.toast-message').textContent).toBe('Hello');

    jest.advanceTimersByTime(2000);
    expect(toast.classList.contains('show')).toBe(false);

    jest.useRealTimers();
  });

  it('should escape HTML content', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('')).toBe('');
  });

  it('should format relative times', () => {
    const now = Date.now();
    expect(getTimeAgo(null)).toBe('Unknown');
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);

    expect(getTimeAgo(now - 30 * 1000)).toBe('Just now');
    expect(getTimeAgo(now - 2 * 60 * 1000)).toBe('2m ago');
    expect(getTimeAgo(now - 3 * 60 * 60 * 1000)).toBe('3h ago');
    expect(getTimeAgo(now - 2 * 24 * 60 * 60 * 1000)).toBe('2d ago');

    spy.mockRestore();
  });

  it('should format timestamps into readable dates', () => {
    const output = formatTime(new Date('2024-01-15T10:30:00Z').getTime());
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should return empty string for missing timestamps', () => {
    expect(formatTime(null)).toBe('');
  });

  it('should escape regex special characters', () => {
    expect(escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?');
  });

  it('should highlight matches when query is provided', () => {
    expect(highlightMatches('Token ABC', 'abc')).toBe('Token <mark>ABC</mark>');
    expect(highlightMatches('Token ABC', '')).toBe('Token ABC');
  });
});
