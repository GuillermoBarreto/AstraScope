import { useEffect, useMemo, useRef, useState } from 'react';
import { Scene } from '@/components/Scene/Scene';
import type { Observer, Satellite, SatelliteResponse } from '@/types/satellite';
import { apiUrl } from '@/utils/api';
import { altitudeKm, orbitalMetrics, predictPasses, satelliteGeodetic } from '@/utils/orbit';
import { ImpactWatch, ModeSelector } from '@/components/Impact/ImpactWatch';

const ORBITS = ['All', 'LEO', 'MEO', 'GEO', 'HEO'];
const SPEEDS = [0, 1, 10, 60, 600];
const PRESETS = [
  'All missions',
  'Favorites',
  'Crewed',
  'Broadband',
  'Navigation',
  'Weather',
  'Science',
] as const;
const SORTS = ['Name', 'Altitude', 'Inclination'] as const;
const FAVORITES_KEY = 'astrascope-favorites';
const OBSERVER_KEY = 'astrascope-observer';
const LEGACY_FAVORITES_KEY = 'orbitwatch-favorites';
const LEGACY_OBSERVER_KEY = 'orbitwatch-observer';
type Preset = (typeof PRESETS)[number];
type Sort = (typeof SORTS)[number];

function SatelliteWatch({ onMode }: { onMode: () => void }) {
  const [catalog, setCatalog] = useState<Satellite[]>([]);
  const [query, setQuery] = useState('');
  const [operator, setOperator] = useState('All');
  const [orbit, setOrbit] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('satellite'),
  );
  const [preset, setPreset] = useState<Preset>('All missions');
  const [sort, setSort] = useState<Sort>('Name');
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [followSelected, setFollowSelected] = useState(false);
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [source, setSource] = useState<SatelliteResponse['source']>('unavailable');
  const [upstream, setUpstream] = useState<SatelliteResponse['upstream']>(null);
  const [catalogScope, setCatalogScope] = useState<SatelliteResponse['scope']>('active');
  const [updatedAt, setUpdatedAt] = useState('');
  const [simulationTime, setSimulationTime] = useState(() => new Date());
  const [speed, setSpeed] = useState(1);
  const [observer, setObserver] = useState<Observer | null>(() => readObserver());
  const lastTick = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(apiUrl('/health'), { signal: controller.signal }),
      fetch(apiUrl('/satellites'), { signal: controller.signal }),
    ])
      .then(([healthResponse, satellitesResponse]) => {
        if (!healthResponse.ok) throw new Error('Health request failed');
        if (!satellitesResponse.ok) throw new Error('Catalog request failed');
        return satellitesResponse.json() as Promise<SatelliteResponse>;
      })
      .then((payload) => {
        setCatalog(payload.satellites);
        setUpdatedAt(payload.updatedAt);
        setSource(payload.source);
        setUpstream(payload.upstream ?? null);
        setCatalogScope(payload.scope ?? 'active');
        setStatus(payload.source === 'unavailable' ? 'offline' : 'live');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('offline');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    lastTick.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      if (speed > 0) setSimulationTime((current) => new Date(current.getTime() + elapsed * speed));
    }, 500);
    return () => window.clearInterval(timer);
  }, [speed]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = catalog.filter((satellite) => {
      const matchesSearch =
        !normalized ||
        satellite.name.toLowerCase().includes(normalized) ||
        String(satellite.noradId).includes(normalized);
      return (
        matchesSearch &&
        (operator === 'All' || satellite.operator === operator) &&
        (orbit === 'All' || satellite.orbit === orbit) &&
        matchesPreset(satellite, preset, favorites)
      );
    });
    return [...matches].sort((a, b) =>
      sort === 'Inclination'
        ? b.inclination - a.inclination
        : sort === 'Altitude'
          ? a.meanMotion - b.meanMotion
          : a.name.localeCompare(b.name),
    );
  }, [catalog, favorites, operator, orbit, preset, query, sort]);

  const selected = catalog.find((satellite) => satellite.id === selectedId) ?? null;
  const companyCount = new Set(
    catalog.map((satellite) => satellite.operator).filter((name) => name !== 'Other'),
  ).size;
  const operatorOptions = useMemo(
    () => ['All', ...Array.from(new Set(catalog.map((satellite) => satellite.operator))).sort()],
    [catalog],
  );
  const hasActiveFilters = Boolean(
    query || operator !== 'All' || orbit !== 'All' || preset !== 'All missions' || sort !== 'Name',
  );

  const resetFilters = () => {
    setQuery('');
    setOperator('All');
    setOrbit('All');
    setPreset('All missions');
    setSort('Name');
  };

  const saveObserver = (next: Observer | null) => {
    setObserver(next);
    if (next) localStorage.setItem(OBSERVER_KEY, JSON.stringify(next));
    else localStorage.removeItem(OBSERVER_KEY);
  };

  const selectSatellite = (id: string | null) => {
    setSelectedId(id);
    setFollowSelected(false);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('satellite', id);
    else url.searchParams.delete('satellite');
    window.history.replaceState({}, '', url);
  };

  const toggleFavorite = (id: string) =>
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(8,145,178,0.16),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.10),transparent_30%),#020617] px-4 py-6 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">
                A
              </span>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">
                AstraScope
              </p>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Explore Earth's orbital neighborhood and near-space activity in real time.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Explore real spacecraft with SGP4 propagation, orbit tracks, coverage footprints, time
              travel, and passes over your location.
            </p>
          </div>
          <div className="space-y-3"><ModeSelector impact={false} onMode={onMode} /><StatusBadge status={status} source={source} upstream={upstream} /></div>
        </header>

        <section aria-label="Catalog summary" className="mb-5 grid gap-3 sm:grid-cols-3">
          <Metric
            label={catalogScope === 'tracked' ? 'Tracked catalog' : 'Active catalog'}
            value={catalog.length ? catalog.length.toLocaleString() : '—'}
          />
          <Metric label="Filtered objects" value={filtered.length.toLocaleString()} />
          <Metric label="Named operators" value={companyCount.toString()} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 backdrop-blur md:grid-cols-[1fr_auto_auto_auto]">
              <label className="relative">
                <span className="sr-only">Search satellite name or NORAD ID</span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or NORAD ID…"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-4 pr-12 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-500"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-500">
                  /
                </kbd>
              </label>
              <Filter
                label="Operator"
                value={operator}
                values={operatorOptions}
                onChange={setOperator}
              />
              <Filter label="Orbit" value={orbit} values={ORBITS} onChange={setOrbit} />
              <Filter
                label="Sort"
                value={sort}
                values={SORTS}
                onChange={(value) => setSort(value as Sort)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((item) => (
                  <button
                    key={item}
                    onClick={() => setPreset(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${preset === item ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-700 hover:text-cyan-300'}`}
                  >
                    {item}
                    {item === 'Favorites' ? ` (${favorites.size})` : ''}
                  </button>
                ))}
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="rounded-full border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/10"
                >
                  Reset filters
                </button>
              )}
            </div>
            <Scene
              satellites={filtered}
              selectedId={selectedId}
              onSelect={selectSatellite}
              time={simulationTime}
              observer={observer}
              simulationMode={speed !== 1}
              followSelected={followSelected}
            />
            <TimeControls
              time={simulationTime}
              speed={speed}
              onSpeed={setSpeed}
              onTime={setSimulationTime}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span aria-live="polite">
                Rendering {filtered.length.toLocaleString()} of {catalog.length.toLocaleString()}{' '}
                objects with SGP4/SDP4 propagation.
              </span>
              <span>
                {updatedAt
                  ? `Catalog synced ${new Date(updatedAt).toLocaleString()}`
                  : 'Waiting for catalog sync'}
              </span>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 backdrop-blur xl:sticky xl:top-5 xl:self-start">
            {selected ? (
              <SatelliteDetails
                satellite={selected}
                time={simulationTime}
                observer={observer}
                favorite={favorites.has(selected.id)}
                following={followSelected}
                onFavorite={() => toggleFavorite(selected.id)}
                onFollow={() => setFollowSelected((value) => !value)}
                onClose={() => selectSatellite(null)}
              />
            ) : (
              <CatalogList
                satellites={filtered}
                favorites={favorites}
                onFavorite={toggleFavorite}
                onSelect={selectSatellite}
              />
            )}
            <ObserverPanel observer={observer} onChange={saveObserver} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({
  status,
  source,
  upstream,
}: {
  status: 'loading' | 'live' | 'offline';
  source: SatelliteResponse['source'];
  upstream: SatelliteResponse['upstream'];
}) {
  const label =
    status === 'loading'
      ? 'Loading orbital catalog'
      : status === 'offline'
        ? 'Catalog service offline'
        : source === 'spacetrack'
          ? 'Space-Track catalog online'
          : source === 'satnogs'
            ? 'SatNOGS catalog online'
            : source.includes('cache')
              ? `${upstream === 'spacetrack' ? 'Space-Track' : upstream === 'satnogs' ? 'SatNOGS' : 'CelesTrak'} cache online`
              : 'CelesTrak catalog online';
  return (
    <div className="flex items-center gap-2 self-start rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
      <span
        className={`h-2 w-2 rounded-full ${status === 'live' ? 'animate-pulse bg-emerald-400' : status === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`}
      />
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Filter({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
      <span className="text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-slate-950 py-3 text-sm text-slate-200 outline-none"
      >
        {values.map((item) => (
          <option key={item} className="bg-slate-950 text-slate-200">
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimeControls({
  time,
  speed,
  onSpeed,
  onTime,
}: {
  time: Date;
  speed: number;
  onSpeed: (speed: number) => void;
  onTime: (time: Date) => void;
}) {
  return (
    <section
      aria-label="Simulation time controls"
      className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">Simulation time</p>
        <time className="mt-1 block font-mono text-sm text-cyan-200">{time.toLocaleString()}</time>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SPEEDS.map((value) => (
          <button
            key={value}
            onClick={() => onSpeed(value)}
            className={`rounded-lg px-3 py-2 text-xs transition ${speed === value ? 'bg-cyan-400 font-semibold text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {value === 0 ? 'Pause' : `${value}×`}
          </button>
        ))}
        <button
          onClick={() => {
            onTime(new Date());
            onSpeed(1);
          }}
          className="rounded-lg border border-cyan-700 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-950"
        >
          Now
        </button>
      </div>
    </section>
  );
}

function CatalogList({
  satellites,
  favorites,
  onFavorite,
  onSelect,
}: {
  satellites: Satellite[];
  favorites: Set<string>;
  onFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [visible, setVisible] = useState(80);
  useEffect(() => setVisible(80), [satellites]);
  return (
    <>
      <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Quick inspect</p>
      <h2 className="mt-2 text-2xl font-semibold">Satellite catalog</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Select a marker or choose an object below to inspect its orbit.
      </p>
      <div className="mt-5 max-h-[410px] space-y-2 overflow-auto pr-1">
        {satellites.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-5 py-8 text-center">
            <p className="text-sm font-medium text-slate-300">No satellites match</p>
            <p className="mt-1 text-xs text-slate-500">
              Try a broader search or reset the active filters.
            </p>
          </div>
        )}
        {satellites.slice(0, visible).map((satellite) => (
          <div
            key={satellite.id}
            className="flex rounded-xl border border-slate-800 bg-slate-950/60 transition hover:border-cyan-700 hover:bg-cyan-950/20"
          >
            <button
              onClick={() => onSelect(satellite.id)}
              className="flex min-w-0 flex-1 items-center justify-between p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-200">
                  {satellite.name}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {satellite.operator} · NORAD {satellite.noradId}
                </span>
              </span>
              <span className="ml-2 rounded-full bg-slate-800 px-2 py-1 text-[10px] text-cyan-300">
                {satellite.orbit}
              </span>
            </button>
            <button
              aria-label={`${favorites.has(satellite.id) ? 'Remove' : 'Add'} ${satellite.name} ${favorites.has(satellite.id) ? 'from' : 'to'} favorites`}
              onClick={() => onFavorite(satellite.id)}
              className={`px-3 text-lg ${favorites.has(satellite.id) ? 'text-amber-300' : 'text-slate-600 hover:text-amber-300'}`}
            >
              ★
            </button>
          </div>
        ))}
        {visible < satellites.length && (
          <button
            onClick={() => setVisible((count) => count + 80)}
            className="w-full rounded-xl border border-slate-700 py-3 text-xs text-cyan-300 hover:bg-cyan-950/30"
          >
            Show 80 more
          </button>
        )}
      </div>
    </>
  );
}

function SatelliteDetails({
  satellite,
  time,
  observer,
  favorite,
  following,
  onFavorite,
  onFollow,
  onClose,
}: {
  satellite: Satellite;
  time: Date;
  observer: Observer | null;
  favorite: boolean;
  following: boolean;
  onFavorite: () => void;
  onFollow: () => void;
  onClose: () => void;
}) {
  const [shared, setShared] = useState(false);
  const location = satelliteGeodetic(satellite, time);
  const metrics = orbitalMetrics(satellite, time);
  const passStart = Math.floor(time.getTime() / 60_000) * 60_000;
  const passes = useMemo(
    () => (observer ? predictPasses(satellite, observer, new Date(passStart)) : []),
    [observer, satellite, passStart],
  );
  const share = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setShared(true);
    window.setTimeout(() => setShared(false), 1800);
  };
  return (
    <>
      <button onClick={onClose} className="text-xs text-cyan-400 hover:text-cyan-300">
        ← Back to catalog
      </button>
      <p className="mt-6 text-xs uppercase tracking-[0.25em] text-cyan-400">Selected object</p>
      <h2 className="mt-2 break-words text-3xl font-semibold">{satellite.name}</h2>
      <p className="mt-2 text-sm text-slate-400">
        {satellite.operator} · {satellite.purpose}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={onFavorite}
          className={`rounded-lg border px-2 py-2 text-xs ${favorite ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}
        >
          {favorite ? '★ Saved' : '☆ Favorite'}
        </button>
        <button
          onClick={onFollow}
          className={`rounded-lg border px-2 py-2 text-xs ${following ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 text-slate-300'}`}
        >
          {following ? 'Following' : 'Follow'}
        </button>
        <button
          onClick={share}
          aria-live="polite"
          className={`rounded-lg border px-2 py-2 text-xs ${shared ? 'border-emerald-400/50 text-emerald-300' : 'border-slate-700 text-slate-300'}`}
        >
          {shared ? 'Copied!' : 'Share'}
        </button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <Detail label="NORAD ID" value={String(satellite.noradId)} />
        <Detail label="Orbit" value={satellite.orbit} />
        <Detail label="Altitude" value={`${altitudeKm(satellite, time).toLocaleString()} km`} />
        <Detail label="Speed" value={`${metrics.speedKmS.toFixed(2)} km/s`} />
        <Detail label="Period" value={`${metrics.periodMinutes.toFixed(1)} min`} />
        <Detail label="Perigee" value={`${Math.round(metrics.perigeeKm).toLocaleString()} km`} />
        <Detail label="Apogee" value={`${Math.round(metrics.apogeeKm).toLocaleString()} km`} />
        <Detail label="Inclination" value={`${satellite.inclination.toFixed(1)}°`} />
        <Detail label="Latitude" value={location ? `${location.latitude.toFixed(2)}°` : '—'} />
        <Detail label="Longitude" value={location ? `${location.longitude.toFixed(2)}°` : '—'} />
        <Detail label="Object" value={satellite.objectType} />
        <Detail label="Country" value={satellite.countryCode} />
      </dl>
      {observer && (
        <div className="mt-6 border-t border-slate-800 pt-5">
          <h3 className="text-sm font-semibold">Passes over {observer.label}</h3>
          {passes.length ? (
            <div className="mt-3 space-y-2">
              {passes.map((pass) => (
                <div
                  key={pass.rise.toISOString()}
                  className="rounded-xl bg-slate-950/70 p-3 text-xs"
                >
                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      {pass.rise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                      {pass.set.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-amber-300">{pass.maxElevation.toFixed(0)}° peak</span>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {pass.rise.toLocaleDateString()} · {Math.round(pass.rangeKm).toLocaleString()}{' '}
                    km ·{' '}
                    <span className={pass.visible ? 'text-emerald-400' : ''}>
                      {pass.visible ? 'potentially visible' : 'daylight/shadow'}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No passes above 10° in the next 24 hours.</p>
          )}
        </div>
      )}
      <p className="mt-6 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
        Positions use SGP4/SDP4 public orbital elements. Not for navigation or collision avoidance.
      </p>
    </>
  );
}

function ObserverPanel({
  observer,
  onChange,
}: {
  observer: Observer | null;
  onChange: (observer: Observer | null) => void;
}) {
  const [latitude, setLatitude] = useState(observer?.latitude.toString() ?? '');
  const [longitude, setLongitude] = useState(observer?.longitude.toString() ?? '');
  const useBrowserLocation = () =>
    navigator.geolocation.getCurrentPosition((position) =>
      onChange({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitudeKm: Math.max(0, (position.coords.altitude ?? 0) / 1000),
        label: 'My location',
      }),
    );
  const save = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      onChange({ latitude: lat, longitude: lon, altitudeKm: 0, label: 'Saved location' });
  };
  return (
    <section className="mt-6 border-t border-slate-800 pt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Observer mode</h3>
        {observer && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-slate-500 hover:text-rose-300"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Set your location to predict passes above 10° elevation.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          aria-label="Observer latitude"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          placeholder="Latitude"
          inputMode="decimal"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-600"
        />
        <input
          aria-label="Observer longitude"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          placeholder="Longitude"
          inputMode="decimal"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-600"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          className="flex-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950"
        >
          Save
        </button>
        <button
          onClick={useBrowserLocation}
          className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
        >
          Use device
        </button>
      </div>
      {observer && (
        <p className="mt-3 text-xs text-emerald-400">
          ● {observer.latitude.toFixed(3)}°, {observer.longitude.toFixed(3)}°
        </p>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-950/70 p-3">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-slate-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

function readObserver(): Observer | null {
  try {
    const value = localStorage.getItem(OBSERVER_KEY) ?? localStorage.getItem(LEGACY_OBSERVER_KEY);
    return value ? (JSON.parse(value) as Observer) : null;
  } catch {
    return null;
  }
}

function readFavorites(): Set<string> {
  try {
    const value = localStorage.getItem(FAVORITES_KEY) ?? localStorage.getItem(LEGACY_FAVORITES_KEY);
    return new Set(value ? (JSON.parse(value) as string[]) : []);
  } catch {
    return new Set();
  }
}

function matchesPreset(satellite: Satellite, preset: Preset, favorites: Set<string>): boolean {
  if (preset === 'All missions') return true;
  if (preset === 'Favorites') return favorites.has(satellite.id);
  if (preset === 'Crewed') return satellite.purpose === 'Crewed station';
  return satellite.purpose === preset;
}

export default function App() {
  const [mode, setMode] = useState<'satellite' | 'impact'>(() => readMode());

  useEffect(() => {
    const syncModeFromUrl = () => setMode(readMode());
    window.addEventListener('popstate', syncModeFromUrl);
    return () => window.removeEventListener('popstate', syncModeFromUrl);
  }, []);

  const changeMode = (nextMode: 'satellite' | 'impact') => {
    const url = new URL(window.location.href);
    if (nextMode === 'impact') url.searchParams.set('view', 'impact');
    else url.searchParams.delete('view');
    window.history.pushState({}, '', url);
    setMode(nextMode);
  };

  return mode === 'satellite' ? (
    <SatelliteWatch onMode={() => changeMode('impact')} />
  ) : (
    <ImpactWatch onMode={() => changeMode('satellite')} />
  );
}

function readMode(): 'satellite' | 'impact' {
  return new URLSearchParams(window.location.search).get('view') === 'impact'
    ? 'impact'
    : 'satellite';
}
