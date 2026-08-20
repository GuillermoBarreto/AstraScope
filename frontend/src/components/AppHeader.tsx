type AppHeaderProps = {
  active: 'satellite' | 'impact';
  onNavigate: () => void;
  status: 'loading' | 'live' | 'offline';
  statusLabel: string;
  utc: Date;
  watchlistCount?: number;
  onWatchlist?: () => void;
};

export function AppHeader({ active, onNavigate, status, statusLabel, utc, watchlistCount, onWatchlist }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-identity" aria-label="AstraScope">
        <span className="app-mark" aria-hidden="true">A</span>
        <span>ASTRASCOPE</span>
      </div>
      <nav aria-label="Primary workspace" className="workspace-nav">
        <button aria-current={active === 'satellite' ? 'page' : undefined} onClick={active === 'impact' ? onNavigate : undefined}>SATELLITES</button>
        <button aria-current={active === 'impact' ? 'page' : undefined} onClick={active === 'satellite' ? onNavigate : undefined}>IMPACT WATCH</button>
      </nav>
      <div className="app-header-status">
        {onWatchlist && <button className="watchlist-link" onClick={onWatchlist}>WATCHLIST <span>{watchlistCount}</span></button>}
        <time className="header-clock" dateTime={utc.toISOString()}>{formatUtcClock(utc)}</time>
        <span className={`ops-status ops-status--${status}`}><i />{statusLabel}</span>
      </div>
    </header>
  );
}

import { formatUtcClock } from '@/utils/time';
