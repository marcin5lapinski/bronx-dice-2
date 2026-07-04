// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiceTray, { ROLL_ANIMATION_MS } from './DiceTray';
import type { DiceValue } from '@bronx-dice/game-engine';

describe('DiceTray', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('shows the rolled values and enables the dice once the roll animation settles', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    act(() => {
      vi.advanceTimersByTime(ROLL_ANIMATION_MS);
    });
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.map((button) => button.querySelector('img')?.alt)
    ).toEqual(['1', '2', '3', '4', '5']);
    for (const button of buttons) {
      expect(button).not.toBeDisabled();
    }
  });

  it('masks unheld dice behind a placeholder face while rolling', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button');
    // Held dice never animate, so they show the real value immediately...
    expect(buttons[1].querySelector('img')?.src).toContain('die-muted-2');
    // ...but a die that will be rerolled shows the placeholder face until
    // the animation settles.
    expect(buttons[0].querySelector('img')?.alt).toBe('5');
    expect(buttons[0].querySelector('img')?.src).toContain('die-glow-5');
  });

  it('uses the glow face for dice that will be rerolled once the roll animation settles', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    act(() => {
      vi.advanceTimersByTime(ROLL_ANIMATION_MS);
    });
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].querySelector('img')?.src).toContain('die-glow-1');
    expect(buttons[1].querySelector('img')?.src).toContain('die-muted-2');
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

  it('disables the dice when interactive is false even after rolling', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
        interactive={false}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

describe('roll animation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the rolling class only to dice that are not held when dice change', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    const { rerender } = render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    rerender(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveClass('rolling');
    expect(buttons[1]).not.toHaveClass('rolling');
    expect(buttons[2]).toHaveClass('rolling');
  });

  it('removes the rolling class after the animation duration elapses', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    const { rerender } = render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    rerender(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    expect(screen.getAllByRole('button')[0]).toHaveClass('rolling');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByRole('button')[0]).not.toHaveClass('rolling');
  });
});
