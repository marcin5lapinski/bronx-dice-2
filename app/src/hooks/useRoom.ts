import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { RoomDocument } from '../types/room';

interface UseRoomResult {
  room: RoomDocument | null;
  loading: boolean;
  notFound: boolean;
  disconnected: boolean;
}

export function useRoom(roomId: string): UseRoomResult {
  const [room, setRoom] = useState<RoomDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setConnectionError(false);
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId),
      (snapshot) => {
        setConnectionError(false);
        if (!snapshot.exists()) {
          setRoom(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        setRoom(snapshot.data() as RoomDocument);
        setNotFound(false);
        setLoading(false);
      },
      () => {
        setConnectionError(true);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [roomId]);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { room, loading, notFound, disconnected: connectionError || offline };
}
