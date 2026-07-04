import type { GameState, Player } from '@bronx-dice/game-engine';
import type { Timestamp } from 'firebase-admin/firestore';

export interface RoomPlayer extends Player {
  avatarId: string;
  ready: boolean;
}

export const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;
export type TurnTimeLimitSeconds = (typeof TURN_TIME_LIMIT_OPTIONS)[number];

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  turnTimeLimitSeconds: TurnTimeLimitSeconds;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState & {
        turnStartedAt: Timestamp;
      });
