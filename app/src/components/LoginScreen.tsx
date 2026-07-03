import { useState, type FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface LoginScreenProps {
  onSuccess: () => void;
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onCancel: () => void;
}

function LoginScreen({
  onSuccess,
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onCancel,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Zaloguj się</h1>
      <form onSubmit={handleEmailLogin}>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="login-password">Hasło</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Zaloguj się
        </button>
      </form>
      <button type="button" disabled={submitting} onClick={handleGoogleLogin}>
        Zaloguj się przez Google
      </button>
      <button type="button" onClick={onNavigateToForgotPassword}>
        Zapomniałem hasła
      </button>
      <button type="button" onClick={onNavigateToRegister}>
        Nie masz konta? Zarejestruj się
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default LoginScreen;
