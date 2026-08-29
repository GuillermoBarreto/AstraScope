import { useEffect, useMemo, useRef, useState } from 'react';
import { Scene } from '@/components/Scene/Scene';
import type { CatalogObject, Observer, Satellite, SatelliteResponse } from '@/types/satellite';
import { apiUrl } from '@/utils/api';
import { altitudeKm, compassDirection, orbitalMetrics, orbitalPeriodMinutes, predictPasses, satelliteGeodetic, satelliteVelocityKmS } from '@/utils/orbit';
import { canonicalSatelliteUrl, formatPeriod, formatVelocity } from '@/utils/satelliteDetails';
import { skyTonightPasses } from '@/utils/skyTonight';
import { calendarFilename, satellitePassCalendar } from '@/utils/calendar';
import { createWatchlistBackup, parseWatchlistBackup } from '@/utils/watchlistBackup';
import { ImpactWatch } from '@/components/Impact/ImpactWatch';
import { AppHeader } from '@/components/AppHeader';
import { formatUtcClock, freshnessLabel } from '@/utils/time';
import { removeStoredValue, storeJson } from '@/utils/storage';
import { copyText } from '@/utils/clipboard';

const ORBITS = ['All', 'LEO', 'MEO', 'GEO', 'HEO'];
const SPEEDS = [0, 1, 10, 60, 600];
const PRESETS = [
  'All missions',
  'Watchlist',
  'Crewed',
  'Broadband',
  'Navigation',
  'Weather',
  'Science',
] as const;
const SORTS = ['Name', 'Altitude', 'Inclination'] as const;
const CATALOG_MODES = ['Active Satellites', 'On-Orbit Objects', 'All Public Catalog'] as const;
const FAVORITES_KEY = 'astrascope-favorites';
const OBSERVER_KEY = 'astrascope-observer';
const LAYERS_KEY = 'astrascope-object-layers';
const LEGACY_FAVORITES_KEY = 'orbitwatch-favorites';
const LEGACY_OBSERVER_KEY = 'orbitwatch-observer';
type Preset = (typeof PRESETS)[number];
type Sort = (typeof SORTS)[number];
type CatalogMode = (typeof CATALOG_MODES)[number];

function SatelliteWatch({ onMode }: { onMode: () => void }) {
  const [catalog, setCatalog] = useState<Satellite[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<Satellite[]>([]);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('Active Satellites');
  const [publicObjects, setPublicObjects] = useState<CatalogObject[]>([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicLoading, setPublicLoading] = useState(false);
  const initialLayers = useMemo(readObjectLayers, []);
  const [showDebris, setShowDebris] = useState(initialLayers.debris);
  const [showRocketBodies, setShowRocketBodies] = useState(initialLayers.rocketBodies);
  const [query, setQuery] = useState('');
  const [operator, setOperator] = useState('All');
  const [orbit, setOrbit] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('satellite'),
  );
  const [preset, setPreset] = useState<Preset>('All missions');
  const [sort, setSort] = useState<Sort>('Name');
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [cameraMode, setCameraMode] = useState<'earth' | 'focus' | 'follow' | 'orbit'>('earth');
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRequest, setCatalogRequest] = useState(0);
  const [source, setSource] = useState<SatelliteResponse['source']>('unavailable');
  const [upstream, setUpstream] = useState<SatelliteResponse['upstream']>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [simulationTime, setSimulationTime] = useState(() => new Date());
  const [speed, setSpeed] = useState(1);
  const [observer, setObserver] = useState<Observer | null>(() => readObserver());
  const lastTick = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedId || catalog.some((item) => item.id === selectedId)) return;
    const noradId = Number(selectedId.match(/-(\d+)$/)?.[1]);
    if (!Number.isFinite(noradId)) return;
    const controller = new AbortController();
    fetch(apiUrl(`/catalog/objects/${noradId}`), { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Deep link lookup failed')))
      .then((payload: { object?: CatalogObject & Partial<Satellite> }) => {
        if (payload.object?.hasOrbitalData && payload.object.meanMotion) {
          setCatalog((current) => [...current.filter((item) => item.id !== payload.object!.id), payload.object as Satellite]);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [catalog, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setCatalogError(false);

    // Health telemetry is useful to the server, but it should never prevent a
    // valid catalog response from reaching the workspace.
    void fetch(apiUrl('/health'), { signal: controller.signal }).catch(() => undefined);
    fetch(apiUrl('/satellites'), { signal: controller.signal })
      .then((satellitesResponse) => {
        if (!satellitesResponse.ok) throw new Error('Catalog request failed');
        return satellitesResponse.json() as Promise<SatelliteResponse>;
      })
      .then((payload) => {
        setCatalog(payload.satellites);
        setActiveCatalog(payload.satellites);
        setUpdatedAt(payload.updatedAt);
        setSource(payload.source);
        setUpstream(payload.upstream ?? null);
        setStatus(payload.source === 'unavailable' ? 'offline' : 'live');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('offline');
        setCatalogError(true);
      });
    return () => controller.abort();
  }, [catalogRequest]);

  useEffect(() => {
    if (catalogMode === 'Active Satellites') {
      setCatalog(activeCatalog);
      return;
    }
    const controller = new AbortController();
    if (catalogMode === 'All Public Catalog') {
      setPublicLoading(true);
      const params = new URLSearchParams({ mode: 'all', page_size: '200' });
      if (query.trim()) params.set('search', query.trim());
      fetch(apiUrl(`/catalog/objects?${params}`), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Public catalog request failed');
          return response.json() as Promise<{ objects: CatalogObject[]; total: number }>;
        })
        .then((payload) => {
          setPublicObjects(payload.objects);
          setPublicTotal(payload.total);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setCatalogError(true);
        })
        .finally(() => setPublicLoading(false));
    } else {
      const params = new URLSearchParams({ mode: 'on-orbit' });
      params.set('debris', 'true');
      params.set('rocket_bodies', 'true');
      setStatus('loading');
      fetch(apiUrl(`/catalog/orbits?${params}`), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Orbital catalog request failed');
          return response.json() as Promise<{ objects: Satellite[]; updatedAt: string; source: SatelliteResponse['source']; upstream?: SatelliteResponse['upstream'] }>;
        })
        .then((payload) => {
          setCatalog(payload.objects);
          setUpdatedAt(payload.updatedAt);
          setSource(payload.source);
          setUpstream(payload.upstream ?? null);
          setStatus('live');
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('offline');
        });
    }
    return () => controller.abort();
  }, [activeCatalog, catalogMode, query]);

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
    storeJson(FAVORITES_KEY, [...favorites]);
  }, [favorites]);

  useEffect(() => {
    storeJson(LAYERS_KEY, { debris: showDebris, rocketBodies: showRocketBodies });
  }, [showDebris, showRocketBodies]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
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
      } else if (event.key === 'Escape' && (selectedId || compareIds.length > 0)) {
        setCompareIds([]);
        setSelectedId(null);
        setCameraMode('earth');
        const url = new URL(window.location.href);
        url.searchParams.delete('satellite');
        window.history.replaceState({}, '', url);
      }
    };
    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [compareIds.length, selectedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = catalog.filter((satellite) => {
      const matchesSearch =
        !normalized ||
        satellite.name.toLowerCase().includes(normalized) ||
        String(satellite.noradId).includes(normalized);
      const type = satellite.objectType.toUpperCase().replace(' ', '_');
      const layerVisible = catalogMode !== 'On-Orbit Objects' ||
        (type === 'DEBRIS' ? showDebris : type === 'ROCKET_BODY' ? showRocketBodies : true);
      return (
        layerVisible &&
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
  }, [catalog, catalogMode, favorites, operator, orbit, preset, query, showDebris, showRocketBodies, sort]);

  const selected = catalog.find((satellite) => satellite.id === selectedId) ?? null;
  const rendered = selected && !filtered.some((item) => item.id === selected.id) ? [...filtered, selected] : filtered;
  const comparison = compareIds
    .map((id) => catalog.find((satellite) => satellite.id === id))
    .filter((satellite): satellite is Satellite => Boolean(satellite));
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
    if (next) storeJson(OBSERVER_KEY, next);
    else removeStoredValue(OBSERVER_KEY);
  };

  const selectSatellite = (id: string | null) => {
    setSelectedId(id);
    setCameraMode('earth');
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

  const toggleCompare = (id: string) =>
    setCompareIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 2
          ? [...current, id]
          : [current[1], id],
    );

  return (
    <main className="orbital-app">
      <AppHeader active="satellite" onNavigate={onMode} status={status} statusLabel={catalogStatusLabel(status, source, upstream)} utc={simulationTime} watchlistCount={favorites.size} onWatchlist={() => setPreset('Watchlist')} />
      <div className="orbital-workspace">
        <section className="catalog-toolbar" aria-label="Satellite discovery controls">
          <div className="catalog-modes" aria-label="Catalog mode">
            {CATALOG_MODES.map((mode) => (
              <button key={mode} aria-pressed={catalogMode === mode} onClick={() => setCatalogMode(mode)}>
                {mode}
              </button>
            ))}
          </div>
          <div className="catalog-controls">
              <label className="relative">
                <span className="sr-only">Search object name, NORAD ID, or international designator</span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search satellite / NORAD"
                  className="catalog-search"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear satellite search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  >
                    Clear
                  </button>
                ) : (
                  <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-500">
                    /
                  </kbd>
                )}
              </label>
              <Filter
                label="Mission"
                value={preset}
                values={PRESETS}
                onChange={(value) => setPreset(value as Preset)}
              />
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
          <div className="catalog-subbar">
              {catalogMode === 'On-Orbit Objects' && (
                <div className="mission-chips" aria-label="Orbital object layers">
                  <button aria-pressed={showRocketBodies} className={showRocketBodies ? 'active' : ''} onClick={() => setShowRocketBodies((value) => !value)}>Rocket Bodies</button>
                  <button aria-pressed={showDebris} className={showDebris ? 'active' : ''} onClick={() => setShowDebris((value) => !value)}>Debris layer</button>
                </div>
              )}
              <div className="mission-chips">
                {PRESETS.filter((item) => !['All missions', 'Watchlist'].includes(item)).map((item) => (
                  <button
                    key={item}
                    onClick={() => setPreset(item)}
                    aria-pressed={preset === item}
                    className={preset === item ? 'active' : ''}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="reset-filters"
                >
                  Reset filters
                </button>
              )}
              <div className="catalog-telemetry" aria-live="polite">
                {catalogMode === 'All Public Catalog' ? <><strong>{publicTotal.toLocaleString()}</strong> SEARCHABLE PUBLIC OBJECTS</> : status === 'loading' ? <><span className="telemetry-skeleton" /> CATALOG SYNCING…</> : <><strong>{catalog.length.toLocaleString()}</strong> OBJECTS <b>•</b> <strong>{filtered.length.toLocaleString()}</strong> DISPLAYED <b>•</b> {companyCount} OPERATORS {updatedAt && <><b>•</b> UPDATED {freshnessLabel(updatedAt)}</>}</>}
              </div>
          </div>
        </section>
        {catalogError && (
          <div className="catalog-alert" role="alert">
            <span>
              <strong>Catalog unavailable.</strong> Check your connection or try syncing again.
            </span>
            <button onClick={() => setCatalogRequest((request) => request + 1)}>Retry sync</button>
          </div>
        )}
        <section className={`workspace-grid ${selected ? 'has-selection' : ''}`}>
          <div className="visualization-pane">
            <div id="satellite-scene">
            <Scene
              satellites={catalogMode === 'All Public Catalog' ? (selected ? [selected] : []) : rendered}
              selectedId={selectedId}
              onSelect={selectSatellite}
              time={simulationTime}
              observer={observer}
              simulationMode={speed !== 1}
              cameraMode={cameraMode}
              onFocusComplete={() => setCameraMode('earth')}
              onExitFollow={() => setCameraMode('earth')}
            />
            </div>
            <TimeControls
              time={simulationTime}
              speed={speed}
              onSpeed={setSpeed}
              onTime={setSimulationTime}
            />
            <div className="visualization-footer">
              <span aria-live="polite">
                {catalogMode === 'All Public Catalog'
                  ? 'Browsing metadata · objects without GP elements are not rendered'
                  : `${status === 'loading' ? 'Preparing orbital catalog…' : `Rendering ${rendered.length.toLocaleString()} of ${catalog.length.toLocaleString()} objects`} · SGP4/SDP4`}
              </span>
              <span>
                {updatedAt
                  ? `CATALOG SYNCED ${formatUtcClock(new Date(updatedAt))}`
                  : status === 'loading' ? 'CATALOG · SYNCING…' : 'CATALOG · OFFLINE'}
              </span>
            </div>
          </div>

          <aside aria-label={selected ? 'Satellite details' : 'Satellite catalog'} className={`object-inspector ${selected ? 'object-inspector--open' : ''}`}>
            {comparison.length === 2 ? (
              <SatelliteComparison
                satellites={[comparison[0], comparison[1]]}
                time={simulationTime}
                onClose={() => setCompareIds([])}
                onInspect={(id) => {
                  setCompareIds([]);
                  selectSatellite(id);
                }}
              />
            ) : selected ? (
              <SatelliteDetails
                satellite={selected}
                time={simulationTime}
                observer={observer}
                favorite={favorites.has(selected.id)}
                cameraMode={cameraMode}
                onFavorite={() => toggleFavorite(selected.id)}
                onFocus={() => setCameraMode('focus')}
                onFollow={() => setCameraMode((mode) => mode === 'follow' ? 'earth' : 'follow')}
                onViewOrbit={() => setCameraMode('orbit')}
                onClose={() => selectSatellite(null)}
              />
            ) : catalogMode === 'All Public Catalog' ? (
              <PublicCatalogList objects={publicObjects} total={publicTotal} loading={publicLoading} onInspectOrbital={(object) => { setCatalog((current) => [...current.filter((item) => item.id !== object.id), object]); selectSatellite(object.id); }} />
            ) : (
              <CatalogList
                satellites={filtered}
                favorites={favorites}
                compareIds={compareIds}
                onFavorite={toggleFavorite}
                onCompare={toggleCompare}
                onSelect={selectSatellite}
              />
            )}
            <Watchlist
              satellites={catalog.filter((satellite) => favorites.has(satellite.id))}
              availableIds={new Set(catalog.map((satellite) => satellite.id))}
              onSelect={selectSatellite}
              onRemove={toggleFavorite}
              onImport={(ids) => setFavorites((current) => new Set([...current, ...ids]))}
            />
            <SkyTonight
              satellites={catalog.filter((satellite) => favorites.has(satellite.id))}
              observer={observer}
              time={simulationTime}
              onSelect={selectSatellite}
            />
            <ObserverPanel observer={observer} onChange={saveObserver} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function catalogStatusLabel(
  status: 'loading' | 'live' | 'offline',
  source: SatelliteResponse['source'],
  upstream: SatelliteResponse['upstream'],
): string {
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
  return label.replace(' orbital catalog', '').replace(' catalog online', ' LIVE').replace(' online', ' LIVE').toUpperCase();
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
    <label className="toolbar-filter">
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
      className="time-controls"
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">Simulation time</p>
        <time className="mt-1 block font-mono text-sm text-cyan-200">{formatUtcClock(time)}</time>
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

function PublicCatalogList({
  objects,
  total,
  loading,
  onInspectOrbital,
}: {
  objects: CatalogObject[];
  total: number;
  loading: boolean;
  onInspectOrbital: (object: Satellite) => void;
}) {
  const [detail, setDetail] = useState<CatalogObject | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = (noradId: number) => {
    setDetailLoading(true);
    fetch(apiUrl(`/catalog/objects/${noradId}`))
      .then((response) => {
        if (!response.ok) throw new Error('Object detail request failed');
        return response.json() as Promise<{ object: CatalogObject | null }>;
      })
      .then((payload) => {
        setDetail(payload.object);
        const object = payload.object as CatalogObject & Partial<Satellite> | null;
        if (object?.hasOrbitalData && object.meanMotion) onInspectOrbital(object as Satellite);
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  return (
    <section aria-labelledby="public-catalog-title">
      <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Global catalog</p>
      <h2 id="public-catalog-title" className="mt-2 text-2xl font-semibold">Publicly cataloged objects</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Search metadata by object name, NORAD number, international designator, or owner. Objects without current GP data are never placed on the globe.
      </p>
      <p className="mt-3 text-xs text-slate-500">{total.toLocaleString()} matching records · showing up to 200</p>
      {detail && (
        <article className="mt-4 rounded-xl border border-cyan-700/60 bg-cyan-950/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-widest text-cyan-400">Object details</p><h3 className="mt-1 font-semibold">{detail.name}</h3></div>
            <button aria-label="Close object details" onClick={() => setDetail(null)} className="text-slate-500 hover:text-slate-200">×</button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-slate-600">Owner</dt><dd className="mt-1 text-slate-300">{detail.owner ?? 'Unknown'}</dd></div>
            <div><dt className="text-slate-600">Launch</dt><dd className="mt-1 text-slate-300">{detail.launchDate ?? 'Unknown'}</dd></div>
            <div><dt className="text-slate-600">Apogee</dt><dd className="mt-1 text-slate-300">{detail.apogeeKm == null ? 'Unknown' : `${detail.apogeeKm.toLocaleString()} km`}</dd></div>
            <div><dt className="text-slate-600">Perigee</dt><dd className="mt-1 text-slate-300">{detail.perigeeKm == null ? 'Unknown' : `${detail.perigeeKm.toLocaleString()} km`}</dd></div>
          </dl>
          <p className="mt-3 text-[10px] text-slate-500">Catalog · CelesTrak SATCAT{detail.dataSources.orbit ? ` · Orbit · ${detail.dataSources.orbit}` : ''}</p>
        </article>
      )}
      <div className="mt-5 max-h-[600px] space-y-2 overflow-auto pr-1" aria-busy={loading}>
        {(loading || detailLoading) && <p role="status" className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">Loading public catalog…</p>}
        {!loading && objects.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No public catalog objects match this search.</p>}
        {!loading && objects.map((object) => (
          <article key={object.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium text-slate-200">{object.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  NORAD {object.noradId}{object.internationalDesignator ? ` · ${object.internationalDesignator}` : ''}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[10px] text-cyan-300">
                {object.objectType.replace('_', ' ')}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-slate-600">Status</dt><dd className="mt-1 text-slate-300">{object.operationalStatus.toLowerCase()}</dd></div>
              <div><dt className="text-slate-600">Orbit data</dt><dd className={`mt-1 ${object.hasOrbitalData ? 'text-emerald-300' : 'text-amber-300'}`}>{object.hasOrbitalData ? 'Provider indicates available' : 'Orbital elements unavailable'}</dd></div>
            </dl>
            <p className="mt-3 text-[10px] text-slate-600">Catalog source · CelesTrak SATCAT</p>
            <button onClick={() => loadDetail(object.noradId)} className="mt-3 w-full rounded-lg bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/20">Load details</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function CatalogList({
  satellites,
  favorites,
  compareIds,
  onFavorite,
  onCompare,
  onSelect,
}: {
  satellites: Satellite[];
  favorites: Set<string>;
  compareIds: string[];
  onFavorite: (id: string) => void;
  onCompare: (id: string) => void;
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
      {compareIds.length === 1 && (
        <p role="status" className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
          One satellite selected. Choose another ⇄ button to compare.
        </p>
      )}
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
              aria-label={`${compareIds.includes(satellite.id) ? 'Remove' : 'Add'} ${satellite.name} ${compareIds.includes(satellite.id) ? 'from' : 'to'} comparison`}
              aria-pressed={compareIds.includes(satellite.id)}
              onClick={() => onCompare(satellite.id)}
              className={`px-3 text-base ${compareIds.includes(satellite.id) ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-600 hover:text-cyan-300'}`}
            >
              ⇄
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

function SatelliteComparison({
  satellites,
  time,
  onClose,
  onInspect,
}: {
  satellites: [Satellite, Satellite];
  time: Date;
  onClose: () => void;
  onInspect: (id: string) => void;
}) {
  const values = satellites.map((satellite) => {
    const metrics = orbitalMetrics(satellite, time);
    const altitude = altitudeKm(satellite, time);
    return {
      altitude: altitude == null ? 'Not available' : `${altitude.toLocaleString()} km`,
      velocity: formatVelocity(satelliteVelocityKmS(satellite, time)),
      period: formatPeriod(orbitalPeriodMinutes(satellite.meanMotion)),
      inclination: `${satellite.inclination.toFixed(1)}°`,
      perigee: Number.isFinite(metrics.perigeeKm) ? `${Math.round(metrics.perigeeKm).toLocaleString()} km` : 'Not available',
      apogee: Number.isFinite(metrics.apogeeKm) ? `${Math.round(metrics.apogeeKm).toLocaleString()} km` : 'Not available',
    };
  });
  const rows = [
    ['Operator', satellites[0].operator, satellites[1].operator],
    ['Mission', satellites[0].purpose, satellites[1].purpose],
    ['Orbit class', satellites[0].orbit, satellites[1].orbit],
    ['Altitude now', values[0].altitude, values[1].altitude],
    ['Velocity now', values[0].velocity, values[1].velocity],
    ['Orbital period', values[0].period, values[1].period],
    ['Inclination', values[0].inclination, values[1].inclination],
    ['Perigee', values[0].perigee, values[1].perigee],
    ['Apogee', values[0].apogee, values[1].apogee],
  ];

  return (
    <article aria-labelledby="comparison-title">
      <button onClick={onClose} className="text-xs text-cyan-400 hover:text-cyan-300">
        ← Back to catalog
      </button>
      <p className="mt-6 text-xs uppercase tracking-[0.25em] text-cyan-400">Side by side</p>
      <h2 id="comparison-title" className="mt-2 text-2xl font-semibold">Satellite comparison</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">Compare live propagated values at the current simulation time.</p>
      <div className="mt-5 grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 text-xs">
        <div className="bg-slate-950/90 p-2" />
        {satellites.map((satellite) => (
          <button key={satellite.id} onClick={() => onInspect(satellite.id)} className="min-w-0 bg-cyan-950/40 p-3 text-left font-semibold text-cyan-200 hover:bg-cyan-950/70">
            <span className="block truncate">{satellite.name}</span>
            <span className="mt-1 block text-[10px] font-normal text-slate-500">NORAD {satellite.noradId}</span>
          </button>
        ))}
        {rows.map(([label, left, right]) => (
          <ComparisonRow key={label} label={label} left={left} right={right} />
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-4 text-slate-500">Select either satellite name to open its complete details and orbit controls.</p>
    </article>
  );
}

function ComparisonRow({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <>
      <div className="bg-slate-950/90 p-2 text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="min-w-0 bg-slate-950/70 p-2 text-slate-200" title={left}>{left}</div>
      <div className="min-w-0 bg-slate-950/70 p-2 text-slate-200" title={right}>{right}</div>
    </>
  );
}

function SatelliteDetails({
  satellite,
  time,
  observer,
  favorite,
  cameraMode,
  onFavorite,
  onFocus,
  onFollow,
  onViewOrbit,
  onClose,
}: {
  satellite: Satellite;
  time: Date;
  observer: Observer | null;
  favorite: boolean;
  cameraMode: 'earth' | 'focus' | 'follow' | 'orbit';
  onFavorite: () => void;
  onFocus: () => void;
  onFollow: () => void;
  onViewOrbit: () => void;
  onClose: () => void;
}) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
    setShareStatus('idle');
  }, [satellite.id]);
  const location = satelliteGeodetic(satellite, time);
  const metrics = orbitalMetrics(satellite, time);
  const altitude = altitudeKm(satellite, time);
  const velocity = satelliteVelocityKmS(satellite, time);
  const period = orbitalPeriodMinutes(satellite.meanMotion);
  const epoch = satellite.epoch ? new Date(satellite.epoch) : null;
  const epochAgeDays = epoch && !Number.isNaN(epoch.getTime()) ? (Date.now() - epoch.getTime()) / 86_400_000 : null;
  const passStart = Math.floor(time.getTime() / 60_000) * 60_000;
  const passes = useMemo(
    () => (observer ? predictPasses(satellite, observer, new Date(passStart)) : []),
    [observer, satellite, passStart],
  );
  const share = async () => {
    const copied = await copyText(canonicalSatelliteUrl(satellite));
    setShareStatus(copied ? 'copied' : 'failed');
    window.setTimeout(() => setShareStatus('idle'), 1800);
  };
  return (
    <article aria-labelledby="satellite-details-title">
      <button onClick={onClose} className="text-xs text-cyan-400 hover:text-cyan-300">
        ← Back to catalog
      </button>
      <p className="mt-6 text-xs uppercase tracking-[0.25em] text-cyan-400">Selected object</p>
      <h2 id="satellite-details-title" className="mt-2 break-words text-3xl font-semibold">{satellite.name}</h2>
      {meaningfulSummary(satellite) && <p className="mt-2 text-sm text-slate-400">{meaningfulSummary(satellite)}</p>}
      <section className="inspector-live" aria-label="Live satellite state">
        <div><span>ALTITUDE</span><strong>{altitude == null ? '—' : `${altitude.toLocaleString()} km`}</strong></div>
        <div><span>VELOCITY</span><strong>{formatVelocity(velocity)}</strong></div>
        <div><span>ORBIT</span><strong>{satellite.orbit} · {formatPeriod(period)}</strong></div>
      </section>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-cyan-950/60 via-slate-950 to-violet-950/50">
        {satellite.imageUrl && !imageFailed ? (
          <img src={satellite.imageUrl} alt={satellite.imageAlt ?? satellite.name} onError={() => setImageFailed(true)} className="h-40 w-full object-cover sm:h-48" />
        ) : (
          <div role="img" aria-label={`No public image available for ${satellite.name}`} className="technical-fallback">
            <svg aria-hidden="true" viewBox="0 0 160 90"><path d="M64 34h32v22H64zM40 28h19v34H40zM101 28h19v34h-19zM80 15v19m0 22v19M56 45h8m32 0h8"/><circle cx="80" cy="45" r="8"/><path d="M25 72c28-17 82-17 110 0"/></svg>
            <span>NO PUBLIC IMAGE AVAILABLE</span>
            <small>{objectLabel(satellite)} · {satellite.orbit} · NORAD {satellite.noradId}</small>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-[10px] text-slate-500">
          <span>{satellite.imageCredit ?? 'AstraScope technical placeholder — not a depiction of this object'}</span>
          {satellite.imageSourceUrl && !imageFailed && <a href={satellite.imageSourceUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Image source</a>}
        </div>
      </div>
      {satellite.description && <p className="mt-4 text-sm leading-6 text-slate-300">{satellite.description}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onFavorite}
          className={`rounded-lg border px-2 py-2 text-xs ${favorite ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}
        >
          {favorite ? '★ In Watchlist' : '☆ Add to Watchlist'}
        </button>
        <button
          onClick={onFocus}
          disabled={cameraMode === 'focus'}
          className={`rounded-lg border px-2 py-2 text-xs ${cameraMode === 'focus' ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 text-slate-300'}`}
        >
          {cameraMode === 'focus' ? 'Focusing…' : 'Focus'}
        </button>
        <button onClick={onFollow} aria-pressed={cameraMode === 'follow'} className={`rounded-lg border px-2 py-2 text-xs ${cameraMode === 'follow' ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{cameraMode === 'follow' ? 'Exit follow' : 'Follow'}</button>
        <button onClick={() => { onViewOrbit(); const scene = document.getElementById('satellite-scene'); if (typeof scene?.scrollIntoView === 'function') scene.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }} aria-pressed={cameraMode === 'orbit'} className="rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:border-cyan-500">
          {cameraMode === 'orbit' ? 'Framing orbit…' : 'View orbit'}
        </button>
        <button
          onClick={share}
          aria-live="polite"
          className={`rounded-lg border px-2 py-2 text-xs ${shareStatus === 'copied' ? 'border-emerald-400/50 text-emerald-300' : shareStatus === 'failed' ? 'border-rose-400/50 text-rose-300' : 'border-slate-700 text-slate-300'}`}
        >
          {shareStatus === 'copied' ? 'Copied!' : shareStatus === 'failed' ? 'Copy failed — retry' : 'Copy share link'}
        </button>
        <a href={satellite.sourceUrl ?? `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satellite.noradId}&FORMAT=json`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-2 py-2 text-center text-xs text-slate-300 hover:border-cyan-500">
          Open source data ↗
        </a>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <Detail label="NORAD ID" value={String(satellite.noradId)} />
        <Detail label="International designator" value={satellite.objectId || 'Not available'} />
        <Detail label="Orbit" value={satellite.orbit} />
        <Detail label="Altitude" value={altitude == null ? 'Not available' : `${altitude.toLocaleString()} km`} />
        <Detail label="Velocity" value={formatVelocity(velocity)} />
        <Detail label="Orbital period" value={formatPeriod(period)} />
        <Detail label="Perigee" value={Number.isFinite(metrics.perigeeKm) ? `${Math.round(metrics.perigeeKm).toLocaleString()} km` : 'Not available'} />
        <Detail label="Apogee" value={Number.isFinite(metrics.apogeeKm) ? `${Math.round(metrics.apogeeKm).toLocaleString()} km` : 'Not available'} />
        <Detail label="Inclination" value={`${satellite.inclination.toFixed(1)}°`} />
        <Detail label="Latitude" value={location ? `${location.latitude.toFixed(2)}°` : '—'} />
        <Detail label="Longitude" value={location ? `${location.longitude.toFixed(2)}°` : '—'} />
        <Detail label="Object" value={satellite.objectType} />
        <Detail label="Country" value={satellite.countryCode} />
        {satellite.launchDate && <Detail label="Launch date" value={new Date(`${satellite.launchDate}T00:00:00Z`).toLocaleDateString()} />}
        {satellite.launchVehicle && <Detail label="Launch vehicle" value={satellite.launchVehicle} />}
        {satellite.launchSite && <Detail label="Launch site" value={satellite.launchSite} />}
        <Detail label="TLE epoch" value={epoch && !Number.isNaN(epoch.getTime()) ? formatUtcClock(epoch) : 'Not available'} />
      </dl>
      {epochAgeDays != null && epochAgeDays > 7 && <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">Orbital elements are {Math.floor(epochAgeDays)} days old; current propagation may be stale.</p>}
      {observer ? (
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
                      {formatPassTime(pass.rise, pass.set)}
                    </span>
                    <span className="text-amber-300">{pass.maxElevation.toFixed(0)}° peak</span>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {pass.rise.toLocaleDateString()} · {formatDuration(pass.set.getTime() - pass.rise.getTime())} · {compassDirection(pass.riseAzimuth)} → {compassDirection(pass.setAzimuth)} · {Math.round(pass.rangeKm).toLocaleString()} km · pass above horizon
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No passes above 10° in the next 24 hours.</p>
          )}
        </div>
      ) : <div className="mt-6 border-t border-slate-800 pt-5"><h3 className="text-sm font-semibold">Next pass over you</h3><p className="mt-2 text-xs text-slate-500">Set your location to calculate upcoming passes.</p></div>}
      <p className="mt-6 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
        Positions use SGP4/SDP4 public orbital elements. Not for navigation or collision avoidance.
      </p>
    </article>
  );
}

function Watchlist({
  satellites,
  availableIds,
  onSelect,
  onRemove,
  onImport,
}: {
  satellites: Satellite[];
  availableIds: Set<string>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onImport: (ids: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState('');
  const exportWatchlist = () => {
    const contents = createWatchlistBackup(satellites.map((satellite) => satellite.id));
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `astrascope-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setBackupStatus(`Exported ${satellites.length} satellite${satellites.length === 1 ? '' : 's'}.`);
  };
  const importWatchlist = async (file: File | undefined) => {
    if (!file) return;
    try {
      const ids = parseWatchlistBackup(await file.text(), availableIds);
      onImport(ids);
      setBackupStatus(`Imported ${ids.length} available satellite${ids.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Could not import this backup.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <section aria-labelledby="watchlist-title" className="mt-6 border-t border-slate-800 pt-5">
      <div className="flex items-center justify-between">
        <h3 id="watchlist-title" className="text-sm font-semibold">Watchlist</h3>
        <span className="text-xs text-slate-500">{satellites.length} saved</span>
      </div>
      {satellites.length ? (
        <ul className="mt-3 space-y-2">
          {satellites.map((satellite) => (
            <li key={satellite.id} className="flex overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
              <button onClick={() => onSelect(satellite.id)} className="min-w-0 flex-1 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-400">
                <span className="block truncate text-xs font-medium text-slate-200">{satellite.name}</span>
                <span className="block truncate text-[10px] text-slate-500">NORAD {satellite.noradId} · {satellite.purpose}</span>
              </button>
              <button aria-label={`Remove ${satellite.name} from Watchlist`} onClick={() => onRemove(satellite.id)} className="px-3 text-amber-300 hover:bg-amber-400/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300">★</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-500">Save satellites to return to them quickly. Your Watchlist stays on this device.</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={exportWatchlist}
          disabled={satellites.length === 0}
          className="rounded-lg border border-slate-700 px-2 py-2 text-[10px] text-slate-300 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-700 px-2 py-2 text-[10px] text-slate-300 hover:border-cyan-500"
        >
          Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose Watchlist backup"
          onChange={(event) => void importWatchlist(event.target.files?.[0])}
          className="sr-only"
        />
      </div>
      {backupStatus && <p role="status" className="mt-2 text-[10px] leading-4 text-cyan-300">{backupStatus}</p>}
    </section>
  );
}

function SkyTonight({
  satellites,
  observer,
  time,
  onSelect,
}: {
  satellites: Satellite[];
  observer: Observer | null;
  time: Date;
  onSelect: (id: string) => void;
}) {
  const passStart = Math.floor(time.getTime() / 60_000) * 60_000;
  const passes = useMemo(
    () => (observer ? skyTonightPasses(satellites, observer, new Date(passStart)) : []),
    [observer, passStart, satellites],
  );
  const addToCalendar = (pass: (typeof passes)[number]) => {
    if (!observer) return;
    const calendar = satellitePassCalendar(
      pass.satellite,
      pass,
      observer,
      canonicalSatelliteUrl(pass.satellite),
    );
    const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = calendarFilename(pass.satellite, pass);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section aria-labelledby="sky-tonight-title" className="mt-6 border-t border-slate-800 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">Orbital passes</p>
          <h3 id="sky-tonight-title" className="mt-1 text-sm font-semibold">Sky Tonight</h3>
        </div>
        {observer && satellites.length > 0 && (
          <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] text-violet-200">
            Next 24 hours
          </span>
        )}
      </div>
      {!observer ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Set your observer location below to find Watchlist passes above the horizon.
        </p>
      ) : satellites.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Add satellites to your Watchlist to build a personal viewing forecast.
        </p>
      ) : passes.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-500">
          No qualifying Watchlist passes are predicted in the next 24 hours.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {passes.map((pass) => (
            <li key={`${pass.satellite.id}-${pass.rise.toISOString()}`}>
              <article className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition hover:border-violet-500/60 hover:bg-violet-950/20">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-200">
                      {pass.satellite.name}
                    </span>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      {pass.rise.toLocaleDateString([], { weekday: 'short' })}{' '}
                      {pass.rise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{Math.max(1, Math.round((pass.set.getTime() - pass.rise.getTime()) / 60_000))} min
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                    {Math.round(pass.maxElevation)}° peak
                  </span>
                </span>
                <span className="mt-2 block text-[10px] text-slate-500">
                  {compassDirection(pass.riseAzimuth)} → {compassDirection(pass.setAzimuth)} · pass above horizon
                </span>
                <span className="mt-3 flex gap-2 border-t border-slate-800 pt-2">
                  <button
                    onClick={() => onSelect(pass.satellite.id)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-violet-200 hover:bg-violet-400/10 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    Inspect satellite
                  </button>
                  <button
                    onClick={() => addToCalendar(pass)}
                    aria-label={`Add ${pass.satellite.name} pass to calendar`}
                    className="flex-1 rounded-lg bg-cyan-400/10 px-2 py-1.5 text-[10px] font-medium text-cyan-200 hover:bg-cyan-400/20 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    Add to calendar
                  </button>
                </span>
              </article>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[10px] leading-4 text-slate-600">
        Pass geometry uses public orbital elements. Illumination and twilight may be used for ranking; naked-eye visibility is not guaranteed.
      </p>
    </section>
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
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setLatitude(observer?.latitude.toString() ?? '');
    setLongitude(observer?.longitude.toString() ?? '');
  }, [observer]);

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Device location is not available in this browser.');
      return;
    }
    setMessage('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitudeKm: Math.max(0, (position.coords.altitude ?? 0) / 1000),
          label: 'My location',
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Enter coordinates manually or allow access and try again.'
            : 'Your location could not be determined. Enter coordinates manually or try again.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const save = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (
      latitude.trim() &&
      longitude.trim() &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      setMessage('');
      onChange({ latitude: lat, longitude: lon, altitudeKm: 0, label: 'Saved location' });
    } else {
      setMessage('Enter a latitude from −90 to 90 and a longitude from −180 to 180.');
    }
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
          disabled={locating}
          className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:cursor-wait disabled:opacity-60"
        >
          {locating ? 'Locating…' : 'Use device'}
        </button>
      </div>
      {message && (
        <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">
          {message}
        </p>
      )}
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
      <dd className="mt-1 break-words font-mono text-sm font-medium tabular-nums text-slate-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

function objectLabel(satellite: Satellite) {
  const type = satellite.objectType.toUpperCase().replace(' ', '_');
  if (type === 'ROCKET_BODY') return 'Rocket body';
  if (type === 'DEBRIS') return 'Debris';
  if (type === 'PAYLOAD') return 'Payload';
  return 'Orbital object';
}

function meaningfulSummary(satellite: Satellite) {
  const values = [satellite.purpose, satellite.operator]
    .filter((value) => value && !['other', 'unknown'].includes(value.toLowerCase()));
  return values.length ? [...new Set(values)].join(' · ') : `${objectLabel(satellite)} · ${satellite.orbit}`;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}

function formatPassTime(start: Date, end: Date) {
  const sameMinute = start.getHours() === end.getHours() && start.getMinutes() === end.getMinutes();
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', ...(sameMinute ? { second: '2-digit' } : {}) };
  return `${start.toLocaleTimeString([], options)} – ${end.toLocaleTimeString([], options)}`;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

function readObjectLayers() {
  try {
    const value = localStorage.getItem(LAYERS_KEY);
    return value ? { debris: false, rocketBodies: false, ...JSON.parse(value) } : { debris: false, rocketBodies: false };
  } catch {
    return { debris: false, rocketBodies: false };
  }
}

function matchesPreset(satellite: Satellite, preset: Preset, favorites: Set<string>): boolean {
  if (preset === 'All missions') return true;
  if (preset === 'Watchlist') return favorites.has(satellite.id);
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
