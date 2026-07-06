// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScoreBoard from './ScoreBoard';
import { createGameState, type DiceValue } from '@bronx-dice/game-engine';

describe('ScoreBoard', () => {
  it('renders category labels and one column per player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(screen.getByText('Jedynki')).toBeInTheDocument();
    expect(screen.getByText('5X')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Ola' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Kuba' })
    ).toBeInTheDocument();
  });

  it('truncates player names longer than 10 characters, keeping the full name in the title', () => {
    const state = createGameState(['Bardzo Dlugie Imie', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const header = screen.getByRole('columnheader', { name: 'Bardzo Dlu…' });
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('title', 'Bardzo Dlugie Imie');
  });

  it('does not truncate a player name of exactly 10 characters', () => {
    const state = createGameState(['Dziesiecin', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(
      screen.getByRole('columnheader', { name: 'Dziesiecin' })
    ).toBeInTheDocument();
  });

  it('shows a filled score as plain text, not a button', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper.aces = 3;
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Jedynki').closest('tr')!;
    expect(row).toHaveTextContent('3');
    expect(row.querySelector('button')).toBeNull();
  });

  it('shows nothing clickable before the first roll of the turn', () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows a clickable score preview for the current player after rolling', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    const button = row.querySelector('button')!;
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('6');
  });

  it('does not show a clickable cell for a player whose turn it is not', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[2].querySelector('button')).toBeNull();
  });

  it('calls onScore with the category when the preview button is clicked', async () => {
    const user = userEvent.setup();
    const onScore = vi.fn();
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={onScore}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    await user.click(row.querySelector('button')!);
    expect(onScore).toHaveBeenCalledWith('threes');
  });

  it('keeps lower-section categories blank until the upper section is filled', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Szansa').closest('tr')!;
    expect(row.querySelector('button')).toBeNull();
  });

  it('hides the clickable preview when interactive is false, even for the current player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        interactive={false}
        onScore={() => {}}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows each player total in the Suma row', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper.aces = 3;
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Suma').closest('tr')!;
    expect(row).toHaveTextContent('3');
  });
});

describe('bonus row', () => {
  it('shows nothing when the bonus has not been earned', () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Bonus').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2]).toHaveTextContent('');
  });

  it('shows 50 with the bonus-earned class when the upper section bonus is achieved', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper = {
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18,
    }; // sum = 63 -> bonus earned
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Bonus').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('50');
    expect(cells[1]).toHaveClass('bonus-earned');
    expect(cells[2]).toHaveTextContent('');
  });
});

describe('current player column', () => {
  it("marks the current player's header cell with current-player-col", () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(screen.getByRole('columnheader', { name: 'Ola' })).toHaveClass(
      'current-player-col'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Kuba' })
    ).not.toHaveClass('current-player-col');
  });
});
