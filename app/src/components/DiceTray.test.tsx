// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiceTray from './DiceTray';
import type { DiceValue } from '../types/game';

describe('DiceTray', () => {
  it('renders 5 disabled placeholders before the first roll', () => {
    render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const dice = screen.getAllByRole('button');
    expect(dice).toHaveLength(5);
    for (const die of dice) {
      expect(die).toBeDisabled();
      expect(die).toHaveTextContent('–');
    }
  });

  it('shows the rolled values and enables the dice', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    for (const button of buttons) {
      expect(button).not.toBeDisabled();
    }
  });

  it('calls onToggleHeld with the clicked die index', async () => {
    const user = userEvent.setup();
    const onToggleHeld = vi.fn();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={onToggleHeld}
      />
    );
    await user.click(screen.getAllByRole('button')[2]);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
  });

  it('marks held dice with aria-pressed', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
