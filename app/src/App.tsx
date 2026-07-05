import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import ProfileSetupScreen from './components/ProfileSetupScreen';
import ProfileScreen from './components/ProfileScreen';
import OnlineMenuScreen from './components/OnlineMenuScreen';
import OnlineRoomScreen from './components/OnlineRoomScreen';
import { useAuth } from './contexts/AuthContext';

const ONLINE_ROOM_STORAGE_KEY = 'bronxDice.onlineRoomId';

type AuthScreenName = 'login' | 'register' | 'forgot-password';

type Screen =
  | { kind: 'local-start' }
  | { kind: 'local-game'; playerNames: string[]; accountPlayerIndex: number | null }
  | { kind: 'auth-gate'; authScreen: AuthScreenName }
  | { kind: 'profile' }
  | { kind: 'online-room'; roomId: string };

function initialScreen(): Screen {
  const storedRoomId = localStorage.getItem(ONLINE_ROOM_STORAGE_KEY);
  return storedRoomId
    ? { kind: 'online-room', roomId: storedRoomId }
    : { kind: 'local-start' };
}

function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const { user, profile, loading } = useAuth();

  const enterRoom = (roomId: string) => {
    localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, roomId);
    setScreen({ kind: 'online-room', roomId });
  };

  const exitRoom = () => {
    localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
    setScreen({ kind: 'auth-gate', authScreen: 'login' });
  };

  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        accountPlayerIndex={screen.accountPlayerIndex}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
        onExit={() => setScreen({ kind: 'local-start' })}
      />
    );
  }

  if (screen.kind === 'online-room') {
    if (loading) {
      return <p>Ładowanie…</p>;
    }
    if (!user) {
      exitRoom();
      return <p>Ładowanie…</p>;
    }
    return <OnlineRoomScreen roomId={screen.roomId} ownUid={user.uid} onLeft={exitRoom} />;
  }

  if (screen.kind === 'profile') {
    if (loading) {
      return <p>Ładowanie…</p>;
    }
    if (!user || !profile) {
      // Authenticated but missing a profile doc (e.g. it was deleted, or a
      // cached session outlived the backend's data) — send them through the
      // auth-gate flow, which already knows how to recover a missing
      // profile via ProfileSetupScreen, instead of a dead-end blank screen.
      setScreen({ kind: 'auth-gate', authScreen: 'login' });
      return <p>Ładowanie…</p>;
    }
    return (
      <ProfileScreen
        onSignedOut={() => setScreen({ kind: 'local-start' })}
        onBackToLocal={() => setScreen({ kind: 'local-start' })}
      />
    );
  }

  if (screen.kind === 'auth-gate') {
    if (loading) {
      return <p>Ładowanie…</p>;
    }

    if (!user) {
      if (screen.authScreen === 'register') {
        return (
          <RegisterScreen
            onSuccess={() => {}}
            onNavigateToLogin={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
            onCancel={() => setScreen({ kind: 'local-start' })}
          />
        );
      }
      if (screen.authScreen === 'forgot-password') {
        return (
          <ForgotPasswordScreen
            onNavigateToLogin={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
            onCancel={() => setScreen({ kind: 'local-start' })}
          />
        );
      }
      return (
        <LoginScreen
          onSuccess={() => setScreen({ kind: 'local-start' })}
          onNavigateToRegister={() => setScreen({ kind: 'auth-gate', authScreen: 'register' })}
          onNavigateToForgotPassword={() =>
            setScreen({ kind: 'auth-gate', authScreen: 'forgot-password' })
          }
          onCancel={() => setScreen({ kind: 'local-start' })}
        />
      );
    }

    if (!profile) {
      return (
        <ProfileSetupScreen
          user={user}
          onComplete={() => setScreen({ kind: 'local-start' })}
          onCancel={() => setScreen({ kind: 'local-start' })}
        />
      );
    }

    return (
      <OnlineMenuScreen
        onRoomJoined={enterRoom}
        onOpenProfile={() => setScreen({ kind: 'profile' })}
        onBack={() => setScreen({ kind: 'local-start' })}
      />
    );
  }

  return (
    <StartScreen
      onStart={(playerNames, accountPlayerIndex) =>
        setScreen({ kind: 'local-game', playerNames, accountPlayerIndex })
      }
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
      onOpenProfile={() => setScreen({ kind: 'profile' })}
    />
  );
}

export default App;
