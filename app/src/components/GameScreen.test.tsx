// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScreen from './GameScreen';

describe('GameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rolls dice and displays the results when the roll button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    render(
      <GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} onExit={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    expect(screen.getByText('Pozostałe rzuty: 2')).toBeInTheDocument();
    // The real result is masked behind a placeholder face while the dice
    // are mid-animation...
    expect(screen.getAllByRole('button', { name: '5' })).toHaveLength(5);

    // ...and revealed once the roll animation settles.
    await waitFor(
      () =>
        expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(5),
      { timeout: 2000 }
    );
  });

  it('hides the score board preview while the roll animation is in progress', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} onExit={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    const row = screen.getByText('Jedynki').closest('tr')!;
    expect(row.querySelector('button')).not.toBeInTheDocument();
  });

  it('scoring a category records it on the board and advances to the next player', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} onExit={() => {}} />
    );

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    const row = screen.getByText('Jedynki').closest('tr')!;
    await waitFor(
      () => expect(row.querySelector('button')).toBeInTheDocument(),
      { timeout: 2000 }
    );
    await user.click(row.querySelector('button')!);

    expect(row).toHaveTextContent('5');
    expect(screen.getByText('Tura: Kuba')).toBeInTheDocument();
  });

  it('calls onExit after confirming when the exit button is clicked', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} onExit={onExit} />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('does not call onExit when the exit confirmation is declined', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} onExit={onExit} />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(onExit).not.toHaveBeenCalled();
  });
});
