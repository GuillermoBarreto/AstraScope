import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the OrbitWatch hero content', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    expect(screen.getByText('OrbitWatch')).toBeInTheDocument();
    expect(screen.getByText(/A 3D orbital preview is now live/i)).toBeInTheDocument();
  });
});
