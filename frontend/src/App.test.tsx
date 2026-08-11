import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('@/components/Scene/Scene', () => ({
  Scene: ({ cameraMode, onFocusComplete, onExitFollow }: { cameraMode: string; onFocusComplete: () => void; onExitFollow: () => void }) => <div aria-label="3D Earth scene" data-camera-mode={cameraMode}>{cameraMode === 'focus' && <button onClick={onFocusComplete}>Complete focus</button>}{cameraMode === 'follow' && <button onClick={onExitFollow}>Exit follow from scene</button>}</div>,
}));
vi.mock('@/components/Impact/ImpactScene', () => ({
  ImpactScene: () => <div aria-label="Impact globe" />,
}));

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    localStorage.clear();
  });

  it('renders enriched satellite details, fallback media, favorites, and sharing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const satellite = {
      id: 'iss-25544', name: 'ISS (ZARYA)', noradId: 25544, objectId: '1998-067A', epoch: new Date().toISOString(),
      inclination: 51.6, raan: 0, eccentricity: 0.0007, argPericenter: 0, meanAnomaly: 0, meanMotion: 15.49,
      bstar: 0, meanMotionDot: 0, meanMotionDdot: 0, elementSetNo: 1, operator: 'NASA', orbit: 'LEO',
      purpose: 'Crewed station', countryCode: 'US', objectType: 'Payload', description: 'A crewed research laboratory.',
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(input).includes('satellites') ? { satellites: [satellite], total: 1, updatedAt: new Date().toISOString(), source: 'celestrak' } : { status: 'ok' }),
    })));
    render(<App />);
    await waitFor(() => expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('ISS (ZARYA)'));
    expect(screen.getByRole('heading', { name: 'ISS (ZARYA)' })).toBeInTheDocument();
    expect(screen.getByText('A crewed research laboratory.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /satellite illustration/i })).toBeInTheDocument();
    expect(screen.getByText('Set your location to calculate upcoming passes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '☆ Add to Watchlist' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('astrascope-favorites') ?? '[]')).toContain('iss-25544'));
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(screen.getByLabelText('3D Earth scene')).toHaveAttribute('data-camera-mode', 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'Complete focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(screen.getByLabelText('3D Earth scene')).toHaveAttribute('data-camera-mode', 'follow');
    fireEvent.click(screen.getByRole('button', { name: 'Exit follow from scene' }));
    expect(screen.getByLabelText('3D Earth scene')).toHaveAttribute('data-camera-mode', 'earth');
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('satellite=iss-25544')));
    fireEvent.click(screen.getByRole('button', { name: 'Remove ISS (ZARYA) from Watchlist' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('astrascope-favorites') ?? '[]')).not.toContain('iss-25544'));
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
