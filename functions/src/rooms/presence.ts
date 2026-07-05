import type { RoomPlayer } from './types';

export const INACTIVITY_THRESHOLD_MS = 45_000;

export function isInactive(player: RoomPlayer, nowMs: number): boolean {
  return nowMs - player.lastActiveAt.toMillis() > INACTIVITY_THRESHOLD_MS;
}
