import { useState, type FormEvent } from 'react';
import { registerWithEmail } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface RegisterScreenProps {
  onSuccess: () => void;
  onNavigateToLogin: () => void;
  onCancel: () => void;
}

function RegisterScreen({
  onSuccess,
  onNavigateToLogin,
  onCancel,
}: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Hasła nie są identyczne.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerWithEmail(email, password);
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Zarejestruj się</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="register-email">E-mail</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="register-password">Hasło</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label htmlFor="register-confirm-password">Powtórz hasło</label>
        <input
          id="register-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Zarejestruj się
        </button>
      </form>
      <button type="button" onClick={onNavigateToLogin}>
        Masz już konto? Zaloguj się
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default RegisterScreen;
