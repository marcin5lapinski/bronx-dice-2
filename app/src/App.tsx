import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';

function App() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);

  if (!playerNames) {
    return <StartScreen onStart={setPlayerNames} />;
  }

  return (
    <GameScreen
      playerNames={playerNames}
      onPlayAgain={() => setPlayerNames(null)}
    />
  );
}

export default App;
