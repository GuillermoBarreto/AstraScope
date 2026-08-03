import { useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Scene } from '@/components/Scene/Scene';
import type { Satellite, SatelliteResponse } from '@/types/satellite';
import { altitudeKm } from '@/utils/orbit';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const OPERATORS = ['All', 'SpaceX', 'Eutelsat OneWeb', 'Amazon', 'Planet', 'Spire', 'Iridium', 'NASA'];
const ORBITS = ['All', 'LEO', 'MEO', 'GEO', 'HEO'];

function HomePage() {
  const [catalog, setCatalog] = useState<Satellite[]>([]);
  const [query, setQuery] = useState('');
  const [operator, setOperator] = useState('All');
  const [orbit, setOrbit] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [updatedAt, setUpdatedAt] = useState('');

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
        setStatus(payload.source === 'celestrak' ? 'live' : 'offline');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('offline');
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((satellite) => {
      const matchesSearch = !normalized || satellite.name.toLowerCase().includes(normalized) || String(satellite.noradId).includes(normalized);
      return matchesSearch && (operator === 'All' || satellite.operator === operator) && (orbit === 'All' || satellite.orbit === orbit);
    });
  }, [catalog, operator, orbit, query]);

  const selected = catalog.find((satellite) => satellite.id === selectedId) ?? null;
  const companyCount = new Set(catalog.map((satellite) => satellite.operator).filter((name) => name !== 'Other')).size;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(8,145,178,0.16),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.10),transparent_30%),#020617] px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">O</span>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">OrbitWatch</p>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Earth’s orbital neighborhood, live.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Explore the public active-satellite catalog—from SpaceX Starlink and OneWeb to weather, navigation, science, and communications spacecraft.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
            <span className={`h-2 w-2 rounded-full ${status === 'live' ? 'animate-pulse bg-emerald-400' : status === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />
            {status === 'loading' ? 'Loading orbital catalog' : status === 'live' ? 'CelesTrak data online' : 'Catalog service offline'}
          </div>
        </header>

        <section aria-label="Catalog summary" className="mb-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Active objects" value={catalog.length ? catalog.length.toLocaleString() : '—'} />
          <Metric label="Visible now" value={filtered.length.toLocaleString()} />
          <Metric label="Named operators" value={companyCount.toString()} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 backdrop-blur md:grid-cols-[1fr_auto_auto]">
              <label className="relative">
                <span className="sr-only">Search satellite name or NORAD ID</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or NORAD ID…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-500" />
              </label>
              <Filter label="Operator" value={operator} values={OPERATORS} onChange={setOperator} />
              <Filter label="Orbit" value={orbit} values={ORBITS} onChange={setOrbit} />
            </div>
            <Scene satellites={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>Rendering up to 3,000 filtered objects for smooth interaction.</span>
              <span>{updatedAt ? `Catalog synced ${new Date(updatedAt).toLocaleString()}` : 'Waiting for catalog sync'}</span>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
            {selected ? <SatelliteDetails satellite={selected} onClose={() => setSelectedId(null)} /> : <CatalogList satellites={filtered} onSelect={setSelectedId} />}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4"><p className="text-xs uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3"><span className="text-xs text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent py-3 text-sm text-slate-200 outline-none">{values.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function CatalogList({ satellites, onSelect }: { satellites: Satellite[]; onSelect: (id: string) => void }) {
  return <><p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Quick inspect</p><h2 className="mt-2 text-2xl font-semibold">Satellite catalog</h2><p className="mt-2 text-sm leading-6 text-slate-400">Select a marker or choose an object below to inspect its orbit.</p><div className="mt-5 max-h-[510px] space-y-2 overflow-auto pr-1">{satellites.slice(0, 80).map((satellite) => <button key={satellite.id} onClick={() => onSelect(satellite.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-cyan-700 hover:bg-cyan-950/20"><span><span className="block text-sm font-medium text-slate-200">{satellite.name}</span><span className="mt-1 block text-xs text-slate-500">{satellite.operator} · NORAD {satellite.noradId}</span></span><span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-cyan-300">{satellite.orbit}</span></button>)}</div></>;
}

function SatelliteDetails({ satellite, onClose }: { satellite: Satellite; onClose: () => void }) {
  return <><button onClick={onClose} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to catalog</button><p className="mt-7 text-xs uppercase tracking-[0.25em] text-cyan-400">Selected object</p><h2 className="mt-2 text-3xl font-semibold">{satellite.name}</h2><p className="mt-2 text-sm text-slate-400">{satellite.operator}</p><dl className="mt-7 grid grid-cols-2 gap-3"><Detail label="NORAD ID" value={String(satellite.noradId)} /><Detail label="Orbit" value={satellite.orbit} /><Detail label="Altitude" value={`~${altitudeKm(satellite).toLocaleString()} km`} /><Detail label="Inclination" value={`${satellite.inclination.toFixed(1)}°`} /><Detail label="Revolutions/day" value={satellite.meanMotion.toFixed(2)} /><Detail label="Object ID" value={satellite.objectId} /></dl><p className="mt-6 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">Position is propagated to the current time from public GP orbital elements. It is intended for visualization, not navigation or collision avoidance.</p></>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/70 p-3"><dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-200">{value}</dd></div>;
}

export default function App() {
  return <Routes><Route path="/" element={<HomePage />} /></Routes>;
}
