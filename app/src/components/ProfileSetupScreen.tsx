import { useState } from 'react';
import type { User } from 'firebase/auth';
import ProfileForm from './ProfileForm';
import { createProfile } from '../services/profileService';
import { authErrorMessage } from '../services/authErrors';
import { AVATAR_OPTIONS } from './avatarOptions';
import { useAuth } from '../contexts/AuthContext';

interface ProfileSetupScreenProps {
  user: User;
  onComplete: () => void;
  onCancel: () => void;
}

function ProfileSetupScreen({
  user,
  onComplete,
  onCancel,
}: ProfileSetupScreenProps) {
  const { refreshProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: {
    displayName: string;
    avatarId: string;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      await createProfile(user.uid, {
        displayName: data.displayName,
        avatarId: data.avatarId,
        email: user.email ?? '',
      });
      await refreshProfile();
      onComplete();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Uzupełnij profil</h1>
      <ProfileForm
        initialDisplayName={user.displayName ?? ''}
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz profil"
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
      />
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default ProfileSetupScreen;
