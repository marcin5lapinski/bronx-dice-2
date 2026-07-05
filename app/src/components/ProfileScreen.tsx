import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';
import { avatarSrc } from './avatarOptions';
import ProfileForm from './ProfileForm';
import StatsScreen from './StatsScreen';

interface ProfileScreenProps {
  onSignedOut: () => void;
  onBackToLocal: () => void;
}

type ProfileView = 'summary' | 'editing' | 'stats';

function ProfileScreen({ onSignedOut, onBackToLocal }: ProfileScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [view, setView] = useState<ProfileView>('summary');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !profile) {
    return null;
  }

  const handleUpdate = async (data: {
    displayName: string;
    avatarId: string;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      await updateProfile(user.uid, data);
      await refreshProfile();
      setView('summary');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    onSignedOut();
  };

  if (view === 'stats') {
    return <StatsScreen onBack={() => setView('summary')} />;
  }

  if (view === 'editing') {
    return (
      <div className="auth-screen">
        <h1>Edytuj profil</h1>
        <ProfileForm
          initialDisplayName={profile.displayName}
          initialAvatarId={profile.avatarId}
          submitLabel="Zapisz zmiany"
          submitting={submitting}
          error={error}
          onSubmit={handleUpdate}
        />
        <button type="button" onClick={() => setView('summary')}>
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1>Profil gracza</h1>
      <img
        className="profile-avatar"
        src={avatarSrc(profile.avatarId)}
        alt="Avatar gracza"
      />
      <p>{profile.displayName}</p>
      <p>{profile.email}</p>
      <button type="button" onClick={() => setView('editing')}>
        Edytuj profil
      </button>
      <button type="button" onClick={() => setView('stats')}>
        Statystyki
      </button>
      <button type="button" onClick={handleSignOut}>
        Wyloguj
      </button>
      <button type="button" onClick={onBackToLocal}>
        Wstecz
      </button>
    </div>
  );
}

export default ProfileScreen;
