import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ScenePreview } from '@/components/ScenePreview';

function HomePage() {
  const [status, setStatus] = useState('Checking backend…');

  useEffect(() => {
    const healthUrl = import.meta.env.VITE_API_BASE_URL
      ? `${import.meta.env.VITE_API_BASE_URL}/health`
      : '/api/health';

    fetch(healthUrl)
      .then((response) => response.json())
      .then((payload) => setStatus(payload.status === 'ok' ? 'Backend online' : 'Backend unavailable'))
      .catch(() => setStatus('Backend unavailable'));
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_40%),_#020617] px-6 py-16 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-center">
        <section className="max-w-2xl">
          <p className="mb-4 text-sm uppercase tracking-[0.35em] text-cyan-400">OrbitWatch</p>
          <h1 className="text-4xl font-semibold sm:text-6xl">A 3D orbital preview is now live</h1>
          <p className="mt-5 text-lg leading-8 text-slate-400">
            OrbitWatch is evolving from a technical foundation into a real product experience with a
            live 3D scene and a health-checked backend connection.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              {status}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
              React Three Fiber + FastAPI
            </div>
          </div>
        </section>
        <section className="flex-1">
          <ScenePreview />
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
