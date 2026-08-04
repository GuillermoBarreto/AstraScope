import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from '@/utils/api';

afterEach(() => vi.unstubAllEnvs());

describe('apiUrl', () => {
  it('uses the local Vite proxy when no API base URL is configured', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(apiUrl('/health')).toBe('/api/health');
  });

  it('joins a production base URL without a duplicate slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://orbiwatch-api.onrender.com/');
    expect(apiUrl('/satellites')).toBe('https://orbiwatch-api.onrender.com/satellites');
  });
});
