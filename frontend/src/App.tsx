import { useEffect, useMemo, useRef, useState } from 'react';
import { Scene } from '@/components/Scene/Scene';
import type { Observer, Satellite, SatelliteResponse } from '@/types/satellite';
import { altitudeKm, predictPasses, satelliteGeodetic } from '@/utils/orbit';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const ORBITS = ['All', 'LEO', 'MEO', 'GEO', 'HEO'];
const SPEEDS = [0, 1, 10, 60, 600];

function HomePage() {
  const [catalog, setCatalog] = useState<Satellite[]>([]);
  const [query, setQuery] = useState('');
  const [operator, setOperator] = useState('All');
  const [orbit, setOrbit] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [source, setSource] = useState<SatelliteResponse['source']>('unavailable');
  const [updatedAt, setUpdatedAt] = useState('');
  const [simulationTime, setSimulationTime] = useState(() => new Date());
  const [speed, setSpeed] = useState(1);
  const [observer, setObserver] = useState<Observer | null>(() => readObserver());
  const lastTick = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/satellites`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog request failed');
        return response.json() as Promise<SatelliteResponse>;
      })
      .then((payload) => {
        setCatalog(payload.satellites);
        setUpdatedAt(payload.updatedAt);
        setSource(payload.source);
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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((satellite) => {
      const matchesSearch = !normalized || satellite.name.toLowerCase().includes(normalized) || String(satellite.noradId).includes(normalized);
      return matchesSearch && (operator === 'All' || satellite.operator === operator) && (orbit === 'All' || satellite.orbit === orbit);
    });
  }, [catalog, operator, orbit, query]);

  const selected = catalog.find((satellite) => satellite.id === selectedId) ?? null;
  const companyCount = new Set(catalog.map((satellite) => satellite.operator).filter((name) => name !== 'Other')).size;
  const operatorOptions = useMemo(() => ['All', ...Array.from(new Set(catalog.map((satellite) => satellite.operator))).sort()], [catalog]);

  const saveObserver = (next: Observer | null) => {
    setObserver(next);
    if (next) localStorage.setItem('orbitwatch-observer', JSON.stringify(next));
    else localStorage.removeItem('orbitwatch-observer');
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(8,145,178,0.16),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.10),transparent_30%),#020617] px-4 py-6 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">O</span><p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">OrbitWatch</p></div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Earth’s orbital neighborhood, live.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Explore real spacecraft with SGP4 propagation, orbit tracks, coverage footprints, time travel, and passes over your location.</p>
          </div>
          <StatusBadge status={status} source={source} />
        </header>

        <section aria-label="Catalog summary" className="mb-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Catalog objects" value={catalog.length ? catalog.length.toLocaleString() : '—'} />
          <Metric label="Filtered objects" value={filtered.length.toLocaleString()} />
          <Metric label="Named operators" value={companyCount.toString()} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 backdrop-blur md:grid-cols-[1fr_auto_auto]">
              <label><span className="sr-only">Search satellite name or NORAD ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or NORAD ID…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-500" /></label>
              <Filter label="Operator" value={operator} values={operatorOptions} onChange={setOperator} />
              <Filter label="Orbit" value={orbit} values={ORBITS} onChange={setOrbit} />
            </div>
            <Scene satellites={filtered} selectedId={selectedId} onSelect={setSelectedId} time={simulationTime} observer={observer} simulationMode={speed !== 1} />
            <TimeControls time={simulationTime} speed={speed} onSpeed={setSpeed} onTime={setSimulationTime} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>Rendering up to 3,000 filtered objects with SGP4/SDP4 propagation.</span><span>{updatedAt ? `Catalog synced ${new Date(updatedAt).toLocaleString()}` : 'Waiting for catalog sync'}</span></div>
          </div>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 backdrop-blur xl:sticky xl:top-5 xl:self-start">
            {selected ? <SatelliteDetails satellite={selected} time={simulationTime} observer={observer} onClose={() => setSelectedId(null)} /> : <CatalogList satellites={filtered} onSelect={setSelectedId} />}
            <ObserverPanel observer={observer} onChange={saveObserver} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status, source }: { status: 'loading' | 'live' | 'offline'; source: SatelliteResponse['source'] }) {
  const label = status === 'loading' ? 'Loading orbital catalog' : status === 'offline' ? 'Catalog service offline' : source === 'satnogs' ? 'SatNOGS catalog online' : source.includes('cache') ? 'Cached catalog online' : 'CelesTrak catalog online';
  return <div className="flex items-center gap-2 self-start rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300"><span className={`h-2 w-2 rounded-full ${status === 'live' ? 'animate-pulse bg-emerald-400' : status === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />{label}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4"><p className="text-xs uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3"><span className="text-xs text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent py-3 text-sm text-slate-200 outline-none">{values.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function TimeControls({ time, speed, onSpeed, onTime }: { time: Date; speed: number; onSpeed: (speed: number) => void; onTime: (time: Date) => void }) {
  return <section aria-label="Simulation time controls" className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] uppercase tracking-widest text-slate-500">Simulation time</p><time className="mt-1 block font-mono text-sm text-cyan-200">{time.toLocaleString()}</time></div><div className="flex flex-wrap items-center gap-2">{SPEEDS.map((value) => <button key={value} onClick={() => onSpeed(value)} className={`rounded-lg px-3 py-2 text-xs transition ${speed === value ? 'bg-cyan-400 font-semibold text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{value === 0 ? 'Pause' : `${value}×`}</button>)}<button onClick={() => { onTime(new Date()); onSpeed(1); }} className="rounded-lg border border-cyan-700 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-950">Now</button></div></section>;
}

function CatalogList({ satellites, onSelect }: { satellites: Satellite[]; onSelect: (id: string) => void }) {
  return <><p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Quick inspect</p><h2 className="mt-2 text-2xl font-semibold">Satellite catalog</h2><p className="mt-2 text-sm leading-6 text-slate-400">Select a marker or choose an object below to inspect its orbit.</p><div className="mt-5 max-h-[410px] space-y-2 overflow-auto pr-1">{satellites.slice(0, 80).map((satellite) => <button key={satellite.id} onClick={() => onSelect(satellite.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-cyan-700 hover:bg-cyan-950/20"><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-200">{satellite.name}</span><span className="mt-1 block text-xs text-slate-500">{satellite.operator} · NORAD {satellite.noradId}</span></span><span className="ml-2 rounded-full bg-slate-800 px-2 py-1 text-[10px] text-cyan-300">{satellite.orbit}</span></button>)}</div></>;
}

function SatelliteDetails({ satellite, time, observer, onClose }: { satellite: Satellite; time: Date; observer: Observer | null; onClose: () => void }) {
  const location = satelliteGeodetic(satellite, time);
  const passStart = Math.floor(time.getTime() / 60_000) * 60_000;
  const passes = useMemo(() => observer ? predictPasses(satellite, observer, new Date(passStart)) : [], [observer, satellite, passStart]);
  return <><button onClick={onClose} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to catalog</button><p className="mt-6 text-xs uppercase tracking-[0.25em] text-cyan-400">Selected object</p><h2 className="mt-2 break-words text-3xl font-semibold">{satellite.name}</h2><p className="mt-2 text-sm text-slate-400">{satellite.operator} · {satellite.purpose}</p><dl className="mt-6 grid grid-cols-2 gap-3"><Detail label="NORAD ID" value={String(satellite.noradId)} /><Detail label="Orbit" value={satellite.orbit} /><Detail label="Altitude" value={`${altitudeKm(satellite, time).toLocaleString()} km`} /><Detail label="Inclination" value={`${satellite.inclination.toFixed(1)}°`} /><Detail label="Latitude" value={location ? `${location.latitude.toFixed(2)}°` : '—'} /><Detail label="Longitude" value={location ? `${location.longitude.toFixed(2)}°` : '—'} /><Detail label="Object" value={satellite.objectType} /><Detail label="Country" value={satellite.countryCode} /></dl>{observer && <div className="mt-6 border-t border-slate-800 pt-5"><h3 className="text-sm font-semibold">Passes over {observer.label}</h3>{passes.length ? <div className="mt-3 space-y-2">{passes.map((pass) => <div key={pass.rise.toISOString()} className="rounded-xl bg-slate-950/70 p-3 text-xs"><div className="flex justify-between"><span className="text-slate-300">{pass.rise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{pass.set.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="text-amber-300">{pass.maxElevation.toFixed(0)}° peak</span></div><p className="mt-1 text-slate-500">{pass.rise.toLocaleDateString()} · {Math.round(pass.rangeKm).toLocaleString()} km · <span className={pass.visible ? 'text-emerald-400' : ''}>{pass.visible ? 'potentially visible' : 'daylight/shadow'}</span></p></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No passes above 10° in the next 24 hours.</p>}</div>}<p className="mt-6 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">Positions use SGP4/SDP4 public orbital elements. Not for navigation or collision avoidance.</p></>;
}

function ObserverPanel({ observer, onChange }: { observer: Observer | null; onChange: (observer: Observer | null) => void }) {
  const [latitude, setLatitude] = useState(observer?.latitude.toString() ?? '');
  const [longitude, setLongitude] = useState(observer?.longitude.toString() ?? '');
  const useBrowserLocation = () => navigator.geolocation.getCurrentPosition((position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude, altitudeKm: Math.max(0, (position.coords.altitude ?? 0) / 1000), label: 'My location' }));
  const save = () => { const lat = Number(latitude); const lon = Number(longitude); if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) onChange({ latitude: lat, longitude: lon, altitudeKm: 0, label: 'Saved location' }); };
  return <section className="mt-6 border-t border-slate-800 pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Observer mode</h3>{observer && <button onClick={() => onChange(null)} className="text-xs text-slate-500 hover:text-rose-300">Clear</button>}</div><p className="mt-2 text-xs leading-5 text-slate-500">Set your location to predict passes above 10° elevation.</p><div className="mt-3 grid grid-cols-2 gap-2"><input aria-label="Observer latitude" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="Latitude" inputMode="decimal" className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-600" /><input aria-label="Observer longitude" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="Longitude" inputMode="decimal" className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-600" /></div><div className="mt-2 flex gap-2"><button onClick={save} className="flex-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950">Save</button><button onClick={useBrowserLocation} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Use device</button></div>{observer && <p className="mt-3 text-xs text-emerald-400">● {observer.latitude.toFixed(3)}°, {observer.longitude.toFixed(3)}°</p>}</section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-slate-950/70 p-3"><dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 truncate text-sm font-medium text-slate-200" title={value}>{value}</dd></div>;
}

function readObserver(): Observer | null {
  try { const value = localStorage.getItem('orbitwatch-observer'); return value ? JSON.parse(value) as Observer : null; } catch { return null; }
}

export default function App() {
  return <HomePage />;
}
