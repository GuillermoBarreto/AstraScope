import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('@/components/Scene/Scene', () => ({
  Scene: () => <div aria-label="3D Earth scene" />,
}));

describe('App', () => {
  it('renders the OrbitWatch globe experience', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));

    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>,
    );

    expect(screen.getByText('OrbitWatch')).toBeInTheDocument();
    expect(screen.getByText(/Earth’s orbital neighborhood, live/i)).toBeInTheDocument();
  });
});
