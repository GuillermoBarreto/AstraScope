import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeStoredValue, storeJson } from './storage';

describe('storage helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('serializes values and removes stored entries', () => {
    expect(storeJson('settings', { enabled: true })).toBe(true);
    expect(localStorage.getItem('settings')).toBe('{"enabled":true}');

    expect(removeStoredValue('settings')).toBe(true);
    expect(localStorage.getItem('settings')).toBeNull();
  });

  it('does not throw when browser storage rejects writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError');
    });

    expect(storeJson('settings', { enabled: true })).toBe(false);
    expect(removeStoredValue('settings')).toBe(false);
  });
});
