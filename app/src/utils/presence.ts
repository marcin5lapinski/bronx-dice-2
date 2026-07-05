import type { Timestamp } from 'firebase/firestore';

export const INACTIVITY_THRESHOLD_MS = 45_000;

export function isPlayerInactive(lastActiveAt: Timestamp, nowMs: number): boolean {
  return nowMs - lastActiveAt.toMillis() > INACTIVITY_THRESHOLD_MS;
}
