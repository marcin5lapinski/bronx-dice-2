import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { subscribeToAuthState } from '../services/authService';
import { getProfile } from '../services/profileService';
import type { PlayerProfile } from '../types/auth';

interface AuthContextValue {
  user: User | null;
  profile: PlayerProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setLoading(true);
        getProfile(nextUser.uid)
          .then(setProfile)
          .finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const loaded = await getProfile(user.uid);
      setProfile(loaded);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
