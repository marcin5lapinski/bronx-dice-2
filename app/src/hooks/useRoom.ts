import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { RoomDocument } from '../types/room';

interface UseRoomResult {
  room: RoomDocument | null;
  loading: boolean;
  notFound: boolean;
}

export function useRoom(roomId: string): UseRoomResult {
  const [room, setRoom] = useState<RoomDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (!snapshot.exists()) {
        setRoom(null);
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRoom(snapshot.data() as RoomDocument);
      setNotFound(false);
      setLoading(false);
    });
    return unsubscribe;
  }, [roomId]);

  return { room, loading, notFound };
}
