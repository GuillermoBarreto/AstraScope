import { Routes, Route } from 'react-router-dom';
import { Scene } from '@/components/Scene/Scene';

function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_40%),_#020617] px-6 py-16 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-8">
        <div className="max-w-2xl text-center">
          <p className="mb-4 text-sm uppercase tracking-[0.35em] text-cyan-400">OrbitWatch</p>
          <h1 className="text-4xl font-semibold sm:text-5xl">A living view of Earth</h1>
          <p className="mt-4 text-lg leading-8 text-slate-400">
            This milestone focuses on the core scene: a beautiful, interactive 3D Earth suspended in
            a star-filled space.
          </p>
        </div>

        <Scene />
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
