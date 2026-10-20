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

describe('apiUrl whitespace trimming', () => {
  it('trims stray whitespace pasted into VITE_API_BASE_URL', () => {
    // A stray space or newline in the env var must not silently produce
    // URLs like "https://api.example.com /satellites" that fail cryptically.
    vi.stubEnv('VITE_API_BASE_URL', '  https://orbiwatch-api.onrender.com/ \n');
    expect(apiUrl('/satellites')).toBe('https://orbiwatch-api.onrender.com/satellites');
  });

  it('trims whitespace-only values down to the local proxy fallback', () => {
    vi.stubEnv('VITE_API_BASE_URL', '   ');
    expect(apiUrl('/health')).toBe('/api/health');
  });
});
