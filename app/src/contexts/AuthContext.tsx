import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  const latestUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      latestUidRef.current = nextUser?.uid ?? null;
      if (nextUser) {
        setLoading(true);
        const uid = nextUser.uid;
        getProfile(uid)
          .then((loaded) => {
            if (latestUidRef.current === uid) {
              setProfile(loaded);
              setLoading(false);
            }
          })
          .catch(() => {
            if (latestUidRef.current === uid) {
              setProfile(null);
              setLoading(false);
            }
          });
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
