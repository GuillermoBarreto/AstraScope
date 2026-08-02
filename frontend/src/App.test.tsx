import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the OrbitWatch globe experience', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    expect(screen.getByText('OrbitWatch')).toBeInTheDocument();
    expect(screen.getByText(/A living view of Earth/i)).toBeInTheDocument();
  });
});
