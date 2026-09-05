import { useMemo, useState } from 'react';
import { ImpactScene } from './ImpactScene';
import { AppHeader } from '@/components/AppHeader';
import { freshnessLabel } from '@/utils/time';
import type { Fireball, NearEarthObject } from '@/types/impact';
import { useImpactFeed } from './useImpactFeed';

const number = (value: number | null, digits = 1) => value === null ? 'Not reported' : value.toLocaleString(undefined, { maximumFractionDigits: digits });

export function ImpactWatch({ onMode }: { onMode: () => void }) {
  const [retry, setRetry] = useState(0);
  const [hazardousOnly, setHazardousOnly] = useState(false);
  const [minDiameter, setMinDiameter] = useState(0);
  const [neoDays, setNeoDays] = useState(7);
  const [fireballDays, setFireballDays] = useState(30);
  const [minEnergy, setMinEnergy] = useState(0);
  const [coordinateFilter, setCoordinateFilter] = useState('all');
  const [selectedNeo, setSelectedNeo] = useState<string | null>(null);
  const [selectedFireball, setSelectedFireball] = useState<string | null>(null);
  const neoFeed = useImpactFeed('neos', neoDays, retry);
  const fireballFeed = useImpactFeed('fireballs', fireballDays, retry);
  const neos = useMemo(() => neoFeed.payload?.neos ?? [], [neoFeed.payload]);
  const fireballs = useMemo(() => fireballFeed.payload?.fireballs ?? [], [fireballFeed.payload]);
  const errors = [neoFeed.error && ('Near-Earth approaches: ' + neoFeed.error), fireballFeed.error && ('Fireballs: ' + fireballFeed.error)].filter(Boolean);
  const status = neoFeed.loading || fireballFeed.loading ? 'loading' : errors.length === 2 ? 'offline' : 'live';
  const updatedAt = [neoFeed.payload?.updatedAt, fireballFeed.payload?.updatedAt].filter((value): value is string => Boolean(value)).sort()[0] ?? '';

  const filteredNeos = useMemo(() => neos.filter((item) => (!hazardousOnly || item.potentiallyHazardous) && (item.estimatedDiameterMaxKm ?? 0) >= minDiameter), [hazardousOnly, minDiameter, neos]);
  const filteredFireballs = useMemo(() => fireballs.filter((item) => item.energy >= minEnergy && (coordinateFilter === 'all' || (coordinateFilter === 'available') === (item.latitude !== null && item.longitude !== null))), [coordinateFilter, fireballs, minEnergy]);
  const selected = filteredNeos.find((item) => item.id === selectedNeo) ?? filteredFireballs.find((item) => item.id === selectedFireball) ?? null;
  const hazardousCount = neos.filter((item) => item.potentiallyHazardous).length;

  return (
    <main className="orbital-app">
      <AppHeader active="impact" onNavigate={onMode} status={status} statusLabel={status === 'loading' ? 'DATA SYNCING' : status === 'offline' ? 'SOURCES OFFLINE' : errors.length ? 'PARTIAL DATA' : 'NASA / JPL LIVE'} utc={new Date()} />
      <div className="orbital-workspace">
        <section className="catalog-toolbar impact-toolbar" aria-label="Impact data controls">
          <div className="impact-title"><span>PLANETARY DEFENSE MONITOR</span><h1>Impact Watch</h1></div>
          <div className="impact-filters">
            <Select label="NEO window" value={neoDays} onChange={setNeoDays}><option value={3}>Next 3 days</option><option value={7}>Next 7 days</option></Select>
            <NumberField label="Min diameter km" value={minDiameter} step="0.01" onChange={setMinDiameter} />
            <label className="impact-check"><input type="checkbox" checked={hazardousOnly} onChange={(event) => setHazardousOnly(event.target.checked)} /> Hazardous only</label>
            <Select label="Fireballs" value={fireballDays} onChange={setFireballDays}><option value={30}>Past 30 days</option><option value={90}>Past 90 days</option><option value={365}>Past year</option></Select>
            <NumberField label="Min energy" value={minEnergy} step="0.1" onChange={setMinEnergy} />
            <Select label="Coordinates" value={coordinateFilter} onChange={setCoordinateFilter}><option value="all">All events</option><option value="available">Available</option><option value="missing">Unavailable</option></Select>
          </div>
          <div className="impact-telemetry" aria-live="polite">{status === 'loading' ? 'DATA SOURCES SYNCING…' : <><strong>{neos.length}</strong> APPROACHES · <strong>{hazardousCount}</strong> HAZARDOUS CLASSIFICATIONS · <strong>{fireballs.length}</strong> FIREBALLS {updatedAt && ` · UPDATED ${freshnessLabel(updatedAt)}`}</>}</div>
        </section>
        {errors.length > 0 && <div role="alert" className="impact-alert">Some NASA/JPL data could not be loaded. {errors.join(' ')} <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={status === 'loading'}>Retry data</button></div>}
        <section className="workspace-grid impact-grid">
          <div className="visualization-pane">
            <ImpactScene events={filteredFireballs} selectedId={selectedFireball} onSelect={(id) => { setSelectedFireball(id); setSelectedNeo(null); }} />
            <p className="impact-context">Markers show reported fireball peak-brightness locations. No asteroid trajectories are drawn. Potentially hazardous classification does not predict an impact.</p>
          </div>
          <aside className={`object-inspector ${selected ? 'object-inspector--open' : ''}`}>
            {selected ? <Details item={selected} onClose={() => { setSelectedNeo(null); setSelectedFireball(null); }} /> : <><ObjectList title="Near-Earth approaches" empty={neoFeed.loading ? 'Loading approaches…' : neoFeed.error ? 'Approach data unavailable. Retry to load events.' : 'No approaches match these filters.'}>{filteredNeos.map((item) => <button key={item.id} onClick={() => { setSelectedNeo(item.id); setSelectedFireball(null); }} className="impact-list-item"><span>{item.name}{item.potentiallyHazardous && <em>Potentially hazardous classification</em>}</span><small>{item.closeApproachDate} · {number(item.missDistanceLunar, 2)} lunar distances</small></button>)}</ObjectList><ObjectList title="Recent fireballs" empty={fireballFeed.loading ? 'Loading fireballs…' : fireballFeed.error ? 'Fireball data unavailable. Retry to load events.' : 'No fireballs match these filters.'}>{filteredFireballs.map((item) => <button key={item.id} onClick={() => { setSelectedFireball(item.id); setSelectedNeo(null); }} className="impact-list-item"><span>{new Date(item.dateTime).toLocaleString()}</span><small>{item.locationDescription ?? 'Location not reported'} · {number(item.impactEnergyKt, 3)} kt</small></button>)}</ObjectList></>}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Select<T extends string | number>({ label, value, onChange, children }: { label: string; value: T; onChange: (value: T) => void; children: React.ReactNode }) { return <label className="toolbar-filter"><span>{label}</span><select value={value} onChange={(event) => onChange((typeof value === 'number' ? Number(event.target.value) : event.target.value) as T)}>{children}</select></label>; }
function NumberField({ label, value, step, onChange }: { label: string; value: number; step: string; onChange: (value: number) => void }) { return <label className="toolbar-filter"><span>{label}</span><input aria-label={label === 'Min diameter km' ? 'Minimum estimated diameter' : label} type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function ObjectList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const items = Array.isArray(children) ? children : [children]; return <section className="impact-list"><h2>{title}</h2><div>{items.length ? children : <p>{empty}</p>}</div></section>; }
function Details({ item, onClose }: { item: NearEarthObject | Fireball; onClose: () => void }) { const neo = 'closeApproachDate' in item; return <article><button onClick={onClose} className="text-xs text-cyan-300">← Back to events</button><p className="inspector-eyebrow">SELECTED EVENT</p><h2 className="mt-2 text-2xl font-semibold">{neo ? item.name : 'Atmospheric fireball'}</h2>{neo ? <dl className="mt-4"><Row label="Close approach" value={item.closeApproachDateTime ?? item.closeApproachDate} /><Row label="Estimated diameter" value={`${number(item.estimatedDiameterMinKm, 3)}–${number(item.estimatedDiameterMaxKm, 3)} km`} /><Row label="Relative velocity" value={`${number(item.relativeVelocityKmS, 2)} km/s`} /><Row label="Miss distance" value={`${number(item.missDistanceKm, 0)} km (${number(item.missDistanceLunar, 2)} LD)`} /><Row label="Classification" value={item.potentiallyHazardous ? 'Potentially hazardous classification' : 'Not classified as potentially hazardous'} /></dl> : <dl className="mt-4"><Row label="Date/time" value={new Date(item.dateTime).toLocaleString()} /><Row label="Location" value={item.locationDescription ?? 'Not reported'} /><Row label="Altitude" value={`${number(item.altitudeKm)} km`} /><Row label="Entry velocity" value={`${number(item.velocityKmS, 2)} km/s`} /><Row label="Radiated energy" value={`${number(item.energy, 3)} × 10¹⁰ J`} /><Row label="Estimated impact energy" value={`${number(item.impactEnergyKt, 3)} kt`} /></dl>}{neo && item.nasaJplUrl && <a className="mt-4 inline-block text-xs text-cyan-300" href={item.nasaJplUrl} target="_blank" rel="noreferrer">Open NASA/JPL record ↗</a>}</article>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-slate-800 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-200">{value}</dd></div>; }
