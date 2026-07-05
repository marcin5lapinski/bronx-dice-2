import { useEffect } from 'react';
import { heartbeat } from '../services/roomService';

const HEARTBEAT_INTERVAL_MS = 15_000;

export function usePresenceHeartbeat(roomId: string): void {
  useEffect(() => {
    const ping = () => {
      heartbeat(roomId).catch(() => {
        // Best-effort — a stale ping (e.g. room already left) isn't actionable.
      });
    };
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [roomId]);
}
