// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('shows the start screen first', () => {
    render(<App />);
    expect(screen.getByText('Bronx Dice')).toBeInTheDocument();
    expect(screen.getByLabelText('Liczba graczy')).toBeInTheDocument();
  });

  it('starts the game after entering names and clicking start', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });
});
