import { useEffect, useState } from 'react';
import type { DiceValue } from '../types/game';

const ROLL_ANIMATION_MS = 1000;

interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
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
        if (rollingIndices.includes(index)) {
          classes.push('rolling');
        }
        return (
          <button
            key={index}
            type="button"
            className={classes.join(' ')}
            aria-pressed={heldDice[index]}
            disabled={!hasBeenRolled}
            onClick={() => onToggleHeld(index)}
          >
            {hasBeenRolled ? dice[index] : '–'}
          </button>
        );
      })}
    </div>
  );
}

export default DiceTray;
