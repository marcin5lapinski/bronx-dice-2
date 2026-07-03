import { useState, type FormEvent } from 'react';
import { AVATAR_OPTIONS } from './avatarOptions';

interface ProfileFormProps {
  initialDisplayName: string;
  initialAvatarId: string;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (data: { displayName: string; avatarId: string }) => void;
}

function ProfileForm({
  initialDisplayName,
  initialAvatarId,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarId, setAvatarId] = useState(initialAvatarId);

  const trimmedName = displayName.trim();
  const canSubmit = trimmedName.length > 0 && avatarId.length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ displayName: trimmedName, avatarId });
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <label htmlFor="profile-display-name">Nazwa wyświetlana</label>
      <input
        id="profile-display-name"
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required
      />
      <fieldset>
        <legend>Avatar</legend>
        <div className="avatar-grid">
          {AVATAR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                'avatar-option' + (option.id === avatarId ? ' selected' : '')
              }
              aria-pressed={option.id === avatarId}
              onClick={() => setAvatarId(option.id)}
            >
              {option.emoji}
            </button>
          ))}
        </div>
      </fieldset>
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={submitting || !canSubmit}>
        {submitLabel}
      </button>
    </form>
  );
}

export default ProfileForm;
