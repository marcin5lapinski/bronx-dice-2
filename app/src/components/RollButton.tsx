interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
  interactive?: boolean;
  pending?: boolean;
}

function RollButton({
  rollsLeft,
  onRoll,
  interactive = true,
  pending = false,
}: RollButtonProps) {
  return (
    <div className="roll-button">
      <button
        type="button"
        className={pending ? 'pending-glow' : undefined}
        disabled={rollsLeft === 0 || !interactive}
        onClick={onRoll}
      >
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
