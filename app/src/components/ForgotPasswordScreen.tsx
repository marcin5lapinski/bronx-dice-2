import { useState, type FormEvent } from 'react';
import { sendPasswordReset } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface ForgotPasswordScreenProps {
  onNavigateToLogin: () => void;
  onCancel: () => void;
}

function ForgotPasswordScreen({
  onNavigateToLogin,
  onCancel,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-screen">
        <h1>Sprawdź skrzynkę e-mail</h1>
        <p>
          Jeśli konto o podanym adresie istnieje, wysłaliśmy na nie link do
          zresetowania hasła.
        </p>
        <button type="button" onClick={onNavigateToLogin}>
          Wróć do logowania
        </button>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1>Zresetuj hasło</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="forgot-password-email">E-mail</label>
        <input
          id="forgot-password-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Wyślij link resetujący
        </button>
      </form>
      <button type="button" onClick={onNavigateToLogin}>
        Wróć do logowania
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default ForgotPasswordScreen;
