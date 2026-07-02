// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WinnerScreen from './WinnerScreen';
import { createEmptyScoreCard } from '../engine/scoreCard';
import type { Player, PlayerScoreCard } from '../types/game';

function scoreCardWithTotal(total: number): PlayerScoreCard {
  const card = createEmptyScoreCard();
  card.lower.chance = total;
  return card;
}

describe('WinnerScreen', () => {
  it('announces the single winner and their total', () => {
    const winners: Player[] = [{ id: 'player-1', name: 'Ola' }];
    const scoreCards = { 'player-1': scoreCardWithTotal(120) };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={() => {}}
      />
    );
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
    expect(screen.getByText('Wynik: 120')).toBeInTheDocument();
  });

  it('announces a tie between multiple winners', () => {
    const winners: Player[] = [
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
    ];
    const scoreCards = {
      'player-1': scoreCardWithTotal(100),
      'player-2': scoreCardWithTotal(100),
    };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={() => {}}
      />
    );
    expect(screen.getByText('Remis: Ola i Kuba!')).toBeInTheDocument();
  });

  it('calls onPlayAgain when the button is clicked', async () => {
    const user = userEvent.setup();
    const onPlayAgain = vi.fn();
    const winners: Player[] = [{ id: 'player-1', name: 'Ola' }];
    const scoreCards = { 'player-1': scoreCardWithTotal(50) };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Zagraj ponownie' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });
});
