import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImpactWatch } from './ImpactWatch';

vi.mock('./ImpactScene', () => ({ ImpactScene: () => <div /> }));

function response(feed: string, name = 'Test asteroid') {
  return { ok: true, json: async () => ({
    [feed]: feed === 'neos' ? [{ id: name, name, estimatedDiameterMaxKm: 1, missDistanceLunar: 2 }] : [],
    updatedAt: new Date().toISOString(), source: 'live-or-cache', error: null,
  }) } as Response;
}

describe('Impact Watch feed loading', () => {
  it('keeps available approaches visible when fireballs fail and recovers on retry', async () => {
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/neos')) return response('neos');
      if (fail) throw new Error('Offline');
      return response('fireballs');
    }));
    render(<ImpactWatch onMode={() => {}} />);
    expect(await screen.findByText('Test asteroid')).toBeInTheDocument();
    expect(await screen.findByText('PARTIAL DATA')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Fireballs:');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry data' }));
    expect(await screen.findByText('NASA / JPL LIVE')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('only reloads the changed window and ignores late responses from an old window', async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/neos?days=7')) return new Promise<Response>((resolve) => { resolveOld = resolve; });
      return Promise.resolve(response(url.includes('/neos') ? 'neos' : 'fireballs', 'Current asteroid'));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ImpactWatch onMode={() => {}} />);
    expect(screen.getByText('Loading approaches…')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('NEO window'), { target: { value: '3' } });
    expect(await screen.findByText('Current asteroid')).toBeInTheDocument();
    await act(async () => { resolveOld(response('neos', 'Obsolete asteroid')); });
    expect(screen.queryByText('Obsolete asteroid')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/fireballs'))).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('NASA / JPL LIVE')).toBeInTheDocument());
  });

  it('reports both HTTP failures as offline instead of empty successful results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    render(<ImpactWatch onMode={() => {}} />);
    expect(await screen.findByText('SOURCES OFFLINE')).toBeInTheDocument();
    expect(screen.getByText('Approach data unavailable. Retry to load events.')).toBeInTheDocument();
    expect(screen.queryByText('No approaches match these filters.')).not.toBeInTheDocument();
  });
});
