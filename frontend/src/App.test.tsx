import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('@/components/Scene/Scene', () => ({
  Scene: () => <div aria-label="3D Earth scene" />,
}));
vi.mock('@/components/Impact/ImpactScene', () => ({
  ImpactScene: () => <div aria-label="Impact globe" />,
}));

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renders the AstraScope globe experience', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByText('AstraScope')).toBeInTheDocument();
    expect(screen.getByText(/Explore Earth's orbital neighborhood and near-space activity in real time/i)).toBeInTheDocument();
  });

  it('renders Impact Watch, filters, and the hazardous classification', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('fireballs')
        ? { fireballs: [], total: 0, updatedAt: '2026-08-07T00:00:00Z', source: 'live-or-cache', provider: 'JPL', error: null }
        : { neos: [{ id: '1', name: 'Test NEO', nasaJplUrl: null, estimatedDiameterMinKm: 0.1, estimatedDiameterMaxKm: 0.2, potentiallyHazardous: true, closeApproachDate: '2026-08-08', closeApproachDateTime: null, relativeVelocityKmS: 12, missDistanceKm: 1000000, missDistanceLunar: 2.6, orbitingBody: 'Earth' }], total: 1, updatedAt: '2026-08-07T00:00:00Z', source: 'live-or-cache', provider: 'NeoWs', error: null };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Impact Watch' }));
    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum estimated diameter')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Test NEO')).toBeInTheDocument());
    expect(screen.getAllByText('Potentially hazardous classification').length).toBeGreaterThan(0);
  });

  it('shows an Impact Watch fallback when providers fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Impact Watch' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable'));
  });

  it('deep-links to Impact Watch and keeps mode navigation in browser history', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    window.history.replaceState({}, '', '/?view=impact');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Satellite Watch' }));
    expect(window.location.search).toBe('');
    expect(screen.getByText(/Explore Earth's orbital neighborhood/i)).toBeInTheDocument();

    window.history.replaceState({}, '', '/?view=impact');
    fireEvent.popState(window);
    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
  });
});
