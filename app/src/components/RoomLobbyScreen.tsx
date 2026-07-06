import { useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MIN_PLAYERS } from '@bronx-dice/game-engine';
import { avatarSrc } from './avatarOptions';
import InlineSpinner from './InlineSpinner';
import { setReady, startGame, leaveRoom } from '../services/roomService';
import { reorderIds, shufflePlayerOrder } from '../utils/playerOrder';
import type { RoomDocument, RoomPlayer } from '../types/room';

interface RoomLobbyScreenProps {
  room: Extract<RoomDocument, { phase: 'lobby' }>;
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

interface PlayerRowContentProps {
  player: RoomPlayer;
  isHost: boolean;
}

function PlayerRowContent({ player, isHost }: PlayerRowContentProps) {
  return (
    <>
      <img className="room-player-avatar" src={avatarSrc(player.avatarId)} alt="" />
      <span>{player.name}</span>
      {isHost && <span className="room-host-badge">Host</span>}
      <span>{player.ready ? 'Gotowy' : 'Niegotowy'}</span>
    </>
  );
}

interface SortablePlayerRowProps {
  player: RoomPlayer;
  isHost: boolean;
  dragDisabled: boolean;
}

function SortablePlayerRow({ player, isHost, dragDisabled }: SortablePlayerRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: player.id,
    disabled: dragDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <button
        type="button"
        className="player-row-handle"
        aria-label={`Zmień kolejność: ${player.name}`}
        disabled={dragDisabled}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <PlayerRowContent player={player} isHost={isHost} />
    </li>
  );
}

function RoomLobbyScreen({ room, roomId, ownUid, onLeft }: RoomLobbyScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => room.players.map((p) => p.id));
  const [randomizeOrder, setRandomizeOrder] = useState(false);
  const [starting, setStarting] = useState(false);

  const ownPlayer = room.players.find((player) => player.id === ownUid);
  const isHost = room.hostId === ownUid;
  const allReady = room.players.every((player) => player.ready);
  const canStart = isHost && allReady && room.players.length >= MIN_PLAYERS;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Keep the host's local draft order in sync with who's actually in the
  // room (joins/leaves), without discarding the arrangement they've already
  // dragged for players still present.
  useEffect(() => {
    setOrderedIds((current) => {
      const roomIds = room.players.map((player) => player.id);
      const roomIdSet = new Set(roomIds);
      const kept = current.filter((id) => roomIdSet.has(id));
      const added = roomIds.filter((id) => !current.includes(id));
      return [...kept, ...added];
    });
  }, [room.players]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setOrderedIds((current) =>
      reorderIds(current, String(active.id), over ? String(over.id) : null)
    );
  };

  const handleToggleReady = async () => {
    if (!ownPlayer) {
      return;
    }
    setError(null);
    try {
      await setReady(roomId, !ownPlayer.ready);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleStart = () => {
    if (starting) {
      return;
    }
    setError(null);
    setStarting(true);
    const finalOrder = randomizeOrder ? shufflePlayerOrder(orderedIds) : orderedIds;
    startGame(roomId, finalOrder)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setStarting(false));
  };

  const handleLeave = async () => {
    setError(null);
    try {
      await leaveRoom(roomId);
      onLeft();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const orderedPlayers = orderedIds
    .map((id) => room.players.find((player) => player.id === id))
    .filter((player): player is RoomPlayer => player !== undefined);

  return (
    <div className="room-lobby-screen">
      <h1>Pokój {roomId}</h1>
      {error && <p className="auth-error">{error}</p>}
      {isHost && (
        <label className="randomize-order-label">
          <input
            type="checkbox"
            checked={randomizeOrder}
            onChange={(event) => setRandomizeOrder(event.target.checked)}
          />
          Losuj kolejność
        </label>
      )}
      {isHost ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderedPlayers.map((player) => player.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="room-player-list">
              {orderedPlayers.map((player) => (
                <SortablePlayerRow
                  key={player.id}
                  player={player}
                  isHost={player.id === room.hostId}
                  dragDisabled={randomizeOrder}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="room-player-list">
          {room.players.map((player) => (
            <li key={player.id}>
              <PlayerRowContent player={player} isHost={player.id === room.hostId} />
            </li>
          ))}
        </ul>
      )}
      {ownPlayer && (
        <button type="button" onClick={handleToggleReady}>
          {ownPlayer.ready ? 'Niegotowy' : 'Gotowy'}
        </button>
      )}
      {isHost && (
        <button type="button" disabled={!canStart || starting} onClick={handleStart}>
          {starting ? (
            <>
              Startuję…
              <InlineSpinner />
            </>
          ) : (
            'Rozpocznij grę'
          )}
        </button>
      )}
      <button type="button" onClick={handleLeave}>
        Opuść pokój
      </button>
    </div>
  );
}

export default RoomLobbyScreen;
