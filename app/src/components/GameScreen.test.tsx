// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScreen from './GameScreen';

describe('GameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rolls dice and displays the results when the roll button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    render(<GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    expect(screen.getByText('Pozostałe rzuty: 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(5);
  });

  it('scoring a category records it on the board and advances to the next player', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(<GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} />);

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    const row = screen.getByText('Asy').closest('tr')!;
    await user.click(row.querySelector('button')!);

    expect(row).toHaveTextContent('5');
    expect(screen.getByText('Tura: Kuba')).toBeInTheDocument();
  });
});
