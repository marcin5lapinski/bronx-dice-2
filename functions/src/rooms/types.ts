import type { GameState, Player } from '@bronx-dice/game-engine';
import type { Timestamp } from 'firebase-admin/firestore';

export interface RoomPlayer extends Player {
  avatarId: string;
}

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState);
