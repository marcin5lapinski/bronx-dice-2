interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
}

function RollButton({ rollsLeft, onRoll }: RollButtonProps) {
  return (
    <div className="roll-button">
      <button type="button" disabled={rollsLeft === 0} onClick={onRoll}>
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
