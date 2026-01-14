// Popup render tests

import { jest } from '@jest/globals';
import {
  getTypeClass,
  createEmptyState,
  createNoResultsHTML,
  createDataItemHTML,
  createHistoryItemHTML,
  renderHistoryList,
  updateFilterCounts
} from '../src/popup/popup-render.js';

describe('popup-render', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return type class names', () => {
    expect(getTypeClass({ type: 'cookie' })).toBe('cookie');
    expect(getTypeClass({ type: 'query-param' })).toBe('query-param');
    expect(getTypeClass({ type: 'custom' })).toBe('custom');
    expect(getTypeClass({ type: 'auth-token' })).toBe('');
  });

  it('should create empty state element', () => {
    const el = createEmptyState();
    expect(el.className).toBe('empty-state');
    expect(el.textContent).toContain('No data captured yet');
  });

  it('should create no results HTML', () => {
    const html = createNoResultsHTML();
    expect(html).toContain('No matches found');
  });

  it('should create data item HTML with highlights and rotation info', () => {
    const html = createDataItemHTML('key-1', {
      type: 'auth-token',
      value: 'Bearer SECRET_TOKEN',
      displayName: 'Authorization',
      capturedAt: Date.now() - 60000,
      rotationCount: 2,
      lastRotatedAt: Date.now() - 30000,
      headerName: 'Authorization',
      tokenType: 'bearer',
      source: { domain: 'api.example.com' }
    }, 'secret');

    expect(html).toContain('rotation-badge');
    expect(html).toContain('Authorization');
    expect(html).toContain('<mark>SECRET</mark>');
    expect(html).toContain('Authorization');
    expect(html).toContain('bearer');
  });

  it('should create data item HTML without optional metadata', () => {
    const longValue = 'a'.repeat(80);
    const html = createDataItemHTML('key-2', {
      type: 'cookie',
      value: longValue,
      displayName: 'Session Cookie',
      capturedAt: Date.now(),
      rotationCount: 0,
      source: { domain: 'example.com' }
    }, '');

    expect(html).not.toContain('rotation-badge');
    expect(html).toContain('Session Cookie');
    expect(html).toContain('...');
  });

  it('should fall back to type and unknown domain when display name missing', () => {
    const html = createDataItemHTML('key-3', {
      type: 'query-param',
      value: 'value',
      capturedAt: Date.now(),
      rotationCount: 0,
      source: {}
    }, '');

    expect(html).toContain('query-param');
    expect(html).toContain('Unknown');
  });

  it('should create history item HTML', () => {
    const html = createHistoryItemHTML({
      value: 'token',
      type: 'auth-token',
      timestamp: Date.now(),
      source: { domain: 'api.example.com' }
    });

    expect(html).toContain('history-item');
    expect(html).toContain('api.example.com');
  });

  it('should render empty history state', () => {
    const historyList = document.createElement('div');
    renderHistoryList({ historyList }, [], () => {});
    expect(historyList.textContent).toContain('No history yet');
  });

  it('should render history items and handle click', () => {
    const historyList = document.createElement('div');
    const onClick = jest.fn();

    renderHistoryList({ historyList }, [{ value: 'tok', timestamp: Date.now() }], onClick);

    const item = historyList.querySelector('.history-item');
    item.dispatchEvent(new MouseEvent('click'));

    expect(onClick).toHaveBeenCalledWith('tok');
  });

  it('should update filter counts', () => {
    const elements = {
      capturedCount: document.createElement('span'),
      countAll: document.createElement('span'),
      countBearer: document.createElement('span'),
      countCookie: document.createElement('span'),
      countQuery: document.createElement('span'),
      totalCount: document.createElement('span'),
      showingCount: document.createElement('span')
    };

    updateFilterCounts(elements, { all: 3, bearer: 1, cookie: 1, query: 1 }, 2);
    expect(elements.capturedCount.textContent).toBe('3');
    expect(elements.countBearer.textContent).toBe('1');
    expect(elements.showingCount.textContent).toBe('2');
  });
});
