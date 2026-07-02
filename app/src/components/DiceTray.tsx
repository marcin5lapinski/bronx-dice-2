import type { DiceValue } from '../types/game';

interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
}

function DiceTray({ dice, heldDice, onToggleHeld }: DiceTrayProps) {
  const hasBeenRolled = dice.length === 5;

  return (
    <div className="dice-tray">
      {Array.from({ length: 5 }, (_, index) => (
        <button
          key={index}
          type="button"
          className={`die${heldDice[index] ? ' held' : ''}`}
          aria-pressed={heldDice[index]}
          disabled={!hasBeenRolled}
          onClick={() => onToggleHeld(index)}
        >
          {hasBeenRolled ? dice[index] : '–'}
        </button>
      ))}
    </div>
  );
}

export default DiceTray;
