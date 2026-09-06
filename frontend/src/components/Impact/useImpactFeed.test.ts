import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImpactFeed } from './useImpactFeed';

const payload = { neos: [], source: 'live-or-cache', error: null };
const response = () => ({ ok: true, json: async () => payload }) as Response;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Impact feed request deadlines', () => {
  it('ends a stalled request, ignores its late result, and allows retry', async () => {
    let resolveOld!: (value: Response) => void;
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ retry }) => useImpactFeed('neos', 7, retry), { initialProps: { retry: 0 } });

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain('Please retry');
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);

    rerender({ retry: 1 });
    await act(async () => {});
    expect(result.current.payload).toEqual(payload);
    expect(result.current.error).toBeNull();
    await act(async () => { resolveOld({ ok: false } as Response); });
    expect(result.current.payload).toEqual(payload);
    expect(result.current.error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also times out when the response body stalls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const { result } = renderHook(() => useImpactFeed('neos', 7, 0));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.loading).toBe(false);
    expect(result.current.payload).toBeNull();
    expect(result.current.error).toContain('Please retry');
  });

  it('clears deadlines after success and when unmounted', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(response())
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender, unmount } = renderHook(({ days }) => useImpactFeed('neos', days, 0), { initialProps: { days: 7 } });
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.error).toBeNull();
    rerender({ days: 3 });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
