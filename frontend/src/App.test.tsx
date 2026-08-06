import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('@/components/Scene/Scene', () => ({
  Scene: () => <div aria-label="3D Earth scene" />,
}));

describe('App', () => {
  it('renders the OrbiWatch globe experience', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByText('OrbiWatch')).toBeInTheDocument();
    expect(screen.getByText(/Earth’s orbital neighborhood, live/i)).toBeInTheDocument();
  });
});
