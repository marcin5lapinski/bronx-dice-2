interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
  interactive?: boolean;
}

function RollButton({ rollsLeft, onRoll, interactive = true }: RollButtonProps) {
  return (
    <div className="roll-button">
      <button type="button" disabled={rollsLeft === 0 || !interactive} onClick={onRoll}>
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
