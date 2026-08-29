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
    expect(screen.getByRole('img', { name: /no public image available/i })).toBeInTheDocument();
    expect(screen.getByText(/not a depiction of this object/i)).toBeInTheDocument();
    expect(screen.getByText('Set your location to calculate upcoming passes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '☆ Add to Watchlist' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('astrascope-favorites') ?? '[]')).toContain('iss-25544'));
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(screen.getByLabelText('3D Earth scene')).toHaveAttribute('data-camera-mode', 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'Complete focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'View orbit' }));
    expect(screen.getByLabelText('3D Earth scene')).toHaveAttribute('data-camera-mode', 'orbit');
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

    expect(screen.getByLabelText('AstraScope')).toBeInTheDocument();
    expect(screen.getByLabelText('Satellite discovery controls')).toBeInTheDocument();
    expect(screen.getByText('CATALOG SYNCING…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active Satellites' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches catalog modes while keeping debris disabled by default', async () => {
    const publicObject = {
      id: 'norad-33757', noradId: 33757, name: 'COSMOS 2251 DEB', internationalDesignator: '1993-036AAB',
      objectType: 'DEBRIS', operationalStatus: 'UNKNOWN', isActive: false, countryCode: 'CIS', owner: 'CIS',
      launchDate: '1993-06-16', launchSite: 'PKMTR', decayDate: null, orbitalPeriodMinutes: null,
      inclination: null, apogeeKm: null, perigeeKm: null, orbitClass: 'OTHER', hasOrbitalData: false,
      dataStatus: 'NCE', dataSources: { catalog: 'celestrak-satcat' }, dataQuality: 'provider-supplied',
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/catalog/objects')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ objects: [publicObject], total: 1 }) });
      if (url.includes('/catalog/orbits')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ objects: [], updatedAt: new Date().toISOString(), source: 'cache' }) });
      if (url.includes('satellites')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ satellites: [], total: 0, updatedAt: new Date().toISOString(), source: 'celestrak' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
    }));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'On-Orbit Objects' }));
    expect(screen.getByRole('button', { name: 'Debris layer' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Rocket Bodies' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'All Public Catalog' }));
    expect(await screen.findByText('COSMOS 2251 DEB')).toBeInTheDocument();
    expect(screen.getByText('Orbital elements unavailable')).toBeInTheDocument();
  });

  it('ignores malformed persisted preferences instead of crashing the workspace', () => {
    localStorage.setItem('astrascope-observer', JSON.stringify({ latitude: 250, longitude: 20 }));
    localStorage.setItem('astrascope-favorites', JSON.stringify([null, 42, 'iss-25544']));
    localStorage.setItem('astrascope-object-layers', JSON.stringify({ debris: 'yes', rocketBodies: 1 }));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByLabelText('AstraScope')).toBeInTheDocument();
    expect(screen.queryByText(/250\.000°/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WATCHLIST 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'On-Orbit Objects' }));
    expect(screen.getByRole('button', { name: 'Debris layer' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Rocket Bodies' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('recovers from a failed catalog sync without requiring a page reload', async () => {
    const satellite = {
      id: 'hubble-20580', name: 'HUBBLE SPACE TELESCOPE', noradId: 20580, objectId: '1990-037B', epoch: new Date().toISOString(),
      inclination: 28.5, raan: 0, eccentricity: 0.0003, argPericenter: 0, meanAnomaly: 0, meanMotion: 15.1,
      bstar: 0, meanMotionDot: 0, meanMotionDdot: 0, elementSetNo: 1, operator: 'NASA', orbit: 'LEO',
      purpose: 'Science', countryCode: 'US', objectType: 'Payload', description: 'Space telescope.',
    };
    let catalogAttempts = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (!String(input).includes('satellites')) {
        return Promise.resolve({ ok: false });
      }
      catalogAttempts += 1;
      if (catalogAttempts === 1) return Promise.reject(new Error('offline'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ satellites: [satellite], total: 1, updatedAt: new Date().toISOString(), source: 'celestrak' }),
      });
    }));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));

    expect(await screen.findByText('HUBBLE SPACE TELESCOPE')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(catalogAttempts).toBe(2);
  });

  it('clears search and closes satellite details with accessible keyboard controls', async () => {
    const satellite = {
      id: 'hubble-20580', name: 'HUBBLE SPACE TELESCOPE', noradId: 20580, objectId: '1990-037B', epoch: new Date().toISOString(),
      inclination: 28.5, raan: 0, eccentricity: 0.0003, argPericenter: 0, meanAnomaly: 0, meanMotion: 15.1,
      bstar: 0, meanMotionDot: 0, meanMotionDdot: 0, elementSetNo: 1, operator: 'NASA', orbit: 'LEO',
      purpose: 'Science', countryCode: 'US', objectType: 'Payload', description: 'Space telescope.',
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(input).includes('satellites')
        ? { satellites: [satellite], total: 1, updatedAt: new Date().toISOString(), source: 'celestrak' }
        : { status: 'ok' }),
    })));

    render(<App />);
    await screen.findByText('HUBBLE SPACE TELESCOPE');

    const search = screen.getByRole('textbox', { name: 'Search object name, NORAD ID, or international designator' });
    fireEvent.change(search, { target: { value: 'hubble' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear satellite search' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();

    search.blur();
    fireEvent.click(screen.getByText('HUBBLE SPACE TELESCOPE'));
    expect(window.location.search).toContain('satellite=hubble-20580');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('complementary', { name: 'Satellite catalog' })).toBeInTheDocument();
    expect(window.location.search).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Science' }));
    expect(screen.getByRole('button', { name: 'Science' })).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: 'IMPACT WATCH' }));
    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum estimated diameter')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Test NEO')).toBeInTheDocument());
    expect(screen.getAllByText('Potentially hazardous classification').length).toBeGreaterThan(0);
  });

  it('shows an Impact Watch fallback when providers fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'IMPACT WATCH' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable'));
  });

  it('deep-links to Impact Watch and keeps mode navigation in browser history', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    window.history.replaceState({}, '', '/?view=impact');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SATELLITES' }));
    expect(window.location.search).toBe('');
    expect(screen.getByLabelText('Satellite discovery controls')).toBeInTheDocument();

    window.history.replaceState({}, '', '/?view=impact');
    fireEvent.popState(window);
    expect(screen.getByRole('heading', { name: 'Impact Watch' })).toBeInTheDocument();
  });
});
