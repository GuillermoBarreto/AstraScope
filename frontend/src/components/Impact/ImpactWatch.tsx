import { useEffect, useMemo, useState } from 'react';
import { ImpactScene } from './ImpactScene';
import type { Fireball, ImpactResponse, NearEarthObject } from '@/types/impact';
import { apiUrl } from '@/utils/api';

const number = (value: number | null, digits = 1) => value === null ? 'Not reported' : value.toLocaleString(undefined, { maximumFractionDigits: digits });

export function ImpactWatch({ onMode }: { onMode: () => void }) {
  const [neos, setNeos] = useState<NearEarthObject[]>([]);
  const [fireballs, setFireballs] = useState<Fireball[]>([]);
  const [status, setStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [errors, setErrors] = useState<string[]>([]);
  const [hazardousOnly, setHazardousOnly] = useState(false);
  const [minDiameter, setMinDiameter] = useState(0);
  const [neoDays, setNeoDays] = useState(7);
  const [fireballDays, setFireballDays] = useState(30);
  const [minEnergy, setMinEnergy] = useState(0);
  const [coordinateFilter, setCoordinateFilter] = useState('all');
  const [selectedNeo, setSelectedNeo] = useState<string | null>(null);
  const [selectedFireball, setSelectedFireball] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    Promise.all([
      fetch(apiUrl(`/impact/neos?days=${neoDays}`), { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('NEO request failed'); return response.json() as Promise<ImpactResponse<'neos'>>; }),
      fetch(apiUrl(`/impact/fireballs?days=${fireballDays}`), { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('Fireball request failed'); return response.json() as Promise<ImpactResponse<'fireballs'>>; }),
    ]).then(([neoPayload, fireballPayload]) => {
      setNeos(neoPayload.neos); setFireballs(fireballPayload.fireballs);
      setUpdatedAt(fireballPayload.updatedAt || neoPayload.updatedAt);
      const nextErrors = [neoPayload.error?.message, fireballPayload.error?.message].filter((item): item is string => Boolean(item));
      setErrors(nextErrors); setStatus(nextErrors.length === 2 ? 'offline' : 'live');
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErrors(['Impact data is temporarily unavailable.']); setStatus('offline');
    });
    return () => controller.abort();
  }, [fireballDays, neoDays]);

  const filteredNeos = useMemo(() => neos.filter((item) => (!hazardousOnly || item.potentiallyHazardous) && (item.estimatedDiameterMaxKm ?? 0) >= minDiameter), [hazardousOnly, minDiameter, neos]);
  const filteredFireballs = useMemo(() => fireballs.filter((item) => item.energy >= minEnergy && (coordinateFilter === 'all' || (coordinateFilter === 'available') === (item.latitude !== null && item.longitude !== null))), [coordinateFilter, fireballs, minEnergy]);
  const selected = filteredNeos.find((item) => item.id === selectedNeo) ?? filteredFireballs.find((item) => item.id === selectedFireball) ?? null;
  const hazardousCount = neos.filter((item) => item.potentiallyHazardous).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,0.12),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(8,145,178,0.10),transparent_30%),#020617] px-4 py-6 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div className="mb-3 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">O</span><p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">OrbiWatch</p></div><h1 className="text-4xl font-semibold sm:text-6xl">Impact Watch</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Monitor upcoming near-Earth object close approaches and recently detected atmospheric fireballs using NASA/JPL data.</p></div>
          <div className="space-y-3"><ModeSelector impact onMode={onMode} /><p className={`text-right text-xs ${status === 'offline' ? 'text-rose-300' : 'text-emerald-300'}`}>{status === 'loading' ? 'Loading sources…' : status === 'offline' ? 'Sources unavailable' : 'NASA/JPL data connected'}</p></div>
        </header>
        <section aria-label="Impact summary" className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Upcoming approaches" value={neos.length} /><Metric label="Potentially hazardous classification" value={hazardousCount} /><Metric label="Recent fireballs" value={fireballs.length} /></section>
        {errors.length > 0 && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4 text-sm text-rose-200">Some NASA/JPL data could not be loaded. {errors.join(' ')}</div>}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-4">
            <ImpactScene events={filteredFireballs} selectedId={selectedFireball} onSelect={(id) => { setSelectedFireball(id); setSelectedNeo(null); }} />
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><h2 className="font-semibold">Filters</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-400">NEO date range<select aria-label="NEO date range" value={neoDays} onChange={(event) => setNeoDays(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200"><option value={3}>Next 3 days</option><option value={7}>Next 7 days</option></select></label><label className="text-xs text-slate-400">Minimum diameter (km)<input aria-label="Minimum estimated diameter" type="number" min="0" step="0.01" value={minDiameter} onChange={(event) => setMinDiameter(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200" /></label><label className="flex items-end gap-2 pb-2 text-xs text-slate-300"><input type="checkbox" checked={hazardousOnly} onChange={(event) => setHazardousOnly(event.target.checked)} /> Potentially hazardous only</label><label className="text-xs text-slate-400">Fireball date range<select aria-label="Fireball date range" value={fireballDays} onChange={(event) => setFireballDays(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200"><option value={30}>Past 30 days</option><option value={90}>Past 90 days</option><option value={365}>Past year</option></select></label><label className="text-xs text-slate-400">Minimum radiated energy (10¹⁰ J)<input aria-label="Minimum fireball energy" type="number" min="0" step="0.1" value={minEnergy} onChange={(event) => setMinEnergy(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200" /></label><label className="text-xs text-slate-400">Coordinates<select aria-label="Coordinate availability" value={coordinateFilter} onChange={(event) => setCoordinateFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200"><option value="all">All events</option><option value="available">Available</option><option value="missing">Unavailable</option></select></label></div></div>
            <p className="text-xs leading-5 text-slate-500">Globe markers show reported fireball peak-brightness locations. No asteroid trajectory is drawn because this view does not calculate orbital paths. Last response: {updatedAt ? new Date(updatedAt).toLocaleString() : 'waiting'}.</p>
          </div>
          <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
            {selected ? <Details item={selected} onClose={() => { setSelectedNeo(null); setSelectedFireball(null); }} /> : <><ObjectList title="Near-Earth approaches" empty="No approaches match these filters.">{filteredNeos.map((item) => <button key={item.id} onClick={() => { setSelectedNeo(item.id); setSelectedFireball(null); }} className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left hover:border-cyan-700"><span className="flex items-start justify-between gap-2 font-medium">{item.name}{item.potentiallyHazardous && <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] text-amber-300">Potentially hazardous classification</span>}</span><span className="mt-1 block text-xs text-slate-500">{item.closeApproachDate} · {number(item.missDistanceLunar, 2)} lunar distances</span></button>)}</ObjectList><ObjectList title="Recent fireballs" empty="No fireballs match these filters.">{filteredFireballs.map((item) => <button key={item.id} onClick={() => { setSelectedFireball(item.id); setSelectedNeo(null); }} className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left hover:border-orange-600"><span className="font-medium">{new Date(item.dateTime).toLocaleString()}</span><span className="mt-1 block text-xs text-slate-500">{item.locationDescription ?? 'Location not reported'} · {number(item.impactEnergyKt, 3)} kt</span></button>)}</ObjectList></>}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-5 text-slate-400"><h2 className="mb-2 text-sm font-semibold text-slate-200">Scientific context</h2><p>Potentially hazardous does not mean an impact is predicted. Close-approach distances are from NASA/JPL. Fireballs are detected or reconstructed atmospheric events.</p><p className="mt-2 text-slate-500">OrbiWatch is not an emergency warning system and is not intended for navigation or planetary-defense operations.</p></div>
          </aside>
        </section>
      </div>
    </main>
  );
}

export function ModeSelector({ impact, onMode }: { impact: boolean; onMode: () => void }) { return <div aria-label="Watch mode" className="flex rounded-xl border border-slate-700 bg-slate-950 p-1"><button onClick={impact ? onMode : undefined} className={`rounded-lg px-4 py-2 text-xs ${!impact ? 'bg-cyan-400 font-semibold text-slate-950' : 'text-slate-400'}`}>Satellite Watch</button><button onClick={!impact ? onMode : undefined} className={`rounded-lg px-4 py-2 text-xs ${impact ? 'bg-orange-400 font-semibold text-slate-950' : 'text-slate-400'}`}>Impact Watch</button></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p></div>; }
function ObjectList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const items = Array.isArray(children) ? children : [children]; return <section className="max-h-[360px] overflow-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><h2 className="mb-3 font-semibold">{title}</h2><div className="space-y-2">{items.length ? children : <p className="text-sm text-slate-500">{empty}</p>}</div></section>; }
function Details({ item, onClose }: { item: NearEarthObject | Fireball; onClose: () => void }) { const neo = 'closeApproachDate' in item; return <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><button onClick={onClose} className="text-xs text-cyan-300">← Back to events</button><h2 className="mt-4 text-2xl font-semibold">{neo ? item.name : 'Atmospheric fireball'}</h2>{neo ? <dl className="mt-4 space-y-2 text-sm"><Row label="Close approach" value={item.closeApproachDateTime ?? item.closeApproachDate} /><Row label="Estimated diameter" value={`${number(item.estimatedDiameterMinKm, 3)}–${number(item.estimatedDiameterMaxKm, 3)} km`} /><Row label="Relative velocity" value={`${number(item.relativeVelocityKmS, 2)} km/s`} /><Row label="Miss distance" value={`${number(item.missDistanceKm, 0)} km (${number(item.missDistanceLunar, 2)} LD)`} /><Row label="Classification" value={item.potentiallyHazardous ? 'Potentially hazardous classification' : 'Not classified as potentially hazardous'} /></dl> : <dl className="mt-4 space-y-2 text-sm"><Row label="Date/time" value={new Date(item.dateTime).toLocaleString()} /><Row label="Location" value={item.locationDescription ?? 'Not reported'} /><Row label="Altitude" value={`${number(item.altitudeKm)} km`} /><Row label="Entry velocity" value={`${number(item.velocityKmS, 2)} km/s`} /><Row label="Radiated energy" value={`${number(item.energy, 3)} × 10¹⁰ J`} /><Row label="Estimated impact energy" value={`${number(item.impactEnergyKt, 3)} kt`} /></dl>}{neo && item.nasaJplUrl && <a className="mt-4 inline-block text-xs text-cyan-300" href={item.nasaJplUrl} target="_blank" rel="noreferrer">Open NASA/JPL record ↗</a>}</section>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-slate-800 py-2"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-200">{value}</dd></div>; }
