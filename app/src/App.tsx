import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import ProfileSetupScreen from './components/ProfileSetupScreen';
import ProfileScreen from './components/ProfileScreen';
import { useAuth } from './contexts/AuthContext';

type AuthScreen = 'login' | 'register' | 'forgot-password';

function App() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const { user, profile, loading } = useAuth();

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthScreen('login');
  };

  if (playerNames) {
    return (
      <GameScreen
        playerNames={playerNames}
        onPlayAgain={() => setPlayerNames(null)}
      />
    );
  }

  if (authOpen) {
    if (loading) {
      return <p>Ładowanie…</p>;
    }

    if (!user) {
      if (authScreen === 'register') {
        return (
          <RegisterScreen
            onSuccess={() => {}}
            onNavigateToLogin={() => setAuthScreen('login')}
            onCancel={closeAuth}
          />
        );
      }
      if (authScreen === 'forgot-password') {
        return (
          <ForgotPasswordScreen
            onNavigateToLogin={() => setAuthScreen('login')}
            onCancel={closeAuth}
          />
        );
      }
      return (
        <LoginScreen
          onSuccess={() => {}}
          onNavigateToRegister={() => setAuthScreen('register')}
          onNavigateToForgotPassword={() => setAuthScreen('forgot-password')}
          onCancel={closeAuth}
        />
      );
    }

    if (!profile) {
      return (
        <ProfileSetupScreen
          user={user}
          onComplete={() => {}}
          onCancel={closeAuth}
        />
      );
    }

    return (
      <ProfileScreen onSignedOut={closeAuth} onBackToLocal={closeAuth} />
    );
  }

  return (
    <StartScreen onStart={setPlayerNames} onOpenAuth={() => setAuthOpen(true)} />
  );
}

export default App;
