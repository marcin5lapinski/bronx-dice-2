import { useEffect, useState } from 'react';
import type { DiceValue } from '../types/game';

export const ROLL_ANIMATION_MS = 1000;

// Shown in place of the real face while a die is mid-spin, so the outcome
// can't be read until the animation settles on the actual rolled value.
const ROLLING_PLACEHOLDER_FACE: DiceValue = 5;

interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
}

function diceFaceSrc(value: DiceValue, held: boolean): string {
  return `/dice/die-${held ? 'muted' : 'glow'}-${value}.png`;
}

function DiceTray({ dice, heldDice, onToggleHeld }: DiceTrayProps) {
  const hasBeenRolled = dice.length === 5;
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);

  useEffect(() => {
    if (dice.length !== 5) {
      return;
    }
    const indices = heldDice
      .map((held, index) => (held ? -1 : index))
      .filter((index) => index !== -1);
    setRollingIndices(indices);
    const timer = setTimeout(() => setRollingIndices([]), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
    // Intentionally depends only on `dice`: the animation should replay when
    // a new roll happens, not when the player toggles which dice are held.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice]);

  return (
    <div className="dice-tray">
      {Array.from({ length: 5 }, (_, index) => {
        const classes = ['die'];
        if (heldDice[index]) {
          classes.push('held');
        }
        const isRolling = rollingIndices.includes(index);
        if (isRolling) {
          classes.push('rolling');
        }
        const value = hasBeenRolled ? dice[index] : null;
        const displayValue = isRolling ? ROLLING_PLACEHOLDER_FACE : value;
        return (
          <button
            key={index}
            type="button"
            className={classes.join(' ')}
            aria-pressed={heldDice[index]}
            disabled={!hasBeenRolled}
            onClick={() => onToggleHeld(index)}
          >
            {displayValue !== null ? (
              <img
                className="die-face"
                src={diceFaceSrc(displayValue, heldDice[index])}
                alt={String(displayValue)}
              />
            ) : (
              '–'
            )}
          </button>
        );
      })}
    </div>
  );
}

export default DiceTray;
