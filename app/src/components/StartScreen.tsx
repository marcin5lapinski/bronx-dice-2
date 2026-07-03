import { useEffect, useRef, useState } from 'react';
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
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';
import { useAuth } from '../contexts/AuthContext';
import { reorderNames, shufflePlayerOrder, type PlayerNameRow } from '../utils/playerOrder';

interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
  onOpenAuth: () => void;
}

function defaultName(index: number): string {
  return `Gracz ${index + 1}`;
}

interface PlayerRowFieldProps {
  row: PlayerNameRow;
  label: string;
  dragDisabled: boolean;
  onChange: (id: string, value: string) => void;
}

function PlayerRowField({
  row,
  label,
  dragDisabled,
  onChange,
}: PlayerRowFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="player-row" ref={setNodeRef} style={style}>
      <button
        type="button"
        className="player-row-handle"
        aria-label={`Zmień kolejność: ${label}`}
        disabled={dragDisabled}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="player-row-field">
        <label htmlFor={`player-name-${row.id}`}>{label}</label>
        <input
          id={`player-name-${row.id}`}
          type="text"
          value={row.value}
          onChange={(event) => onChange(row.id, event.target.value)}
        />
      </div>
    </div>
  );
}

function StartScreen({ onStart, onOpenAuth }: StartScreenProps) {
  const { user, profile } = useAuth();
  const nextRowId = useRef(0);
  const createRowId = () => `player-row-${nextRowId.current++}`;

  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [rows, setRows] = useState<PlayerNameRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, (_, index) => ({
      id: createRowId(),
      value: defaultName(index),
    }))
  );
  const syncedRowId = useRef<string | null>(rows[0].id);
  const [randomizeOrder, setRandomizeOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!syncedRowId.current || !user || !profile) {
      return;
    }
    const rowId = syncedRowId.current;
    const nickname = profile.displayName;
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, value: nickname } : row))
    );
  }, [user, profile]);

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setRows((current) =>
      Array.from({ length: count }, (_, index) => {
        const existing = current[index];
        return existing ?? { id: createRowId(), value: defaultName(index) };
      })
    );
  };

  const handleNameChange = (id: string, value: string) => {
    if (id === syncedRowId.current) {
      syncedRowId.current = null;
    }
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setRows((current) =>
      reorderNames(current, String(active.id), over ? String(over.id) : null)
    );
  };

  const visibleRows = rows.slice(0, playerCount);
  const trimmedNames = visibleRows.map((row) => row.value.trim());
  const canStart = trimmedNames.every((name) => name.length > 0);

  const handleStart = () => {
    const finalNames = randomizeOrder
      ? shufflePlayerOrder(trimmedNames)
      : trimmedNames;
    onStart(finalNames);
  };

  return (
    <div className="start-screen">
      <img
        className="app-logo"
        src="/dice/logos/logo-bd2-2-header.png"
        alt="Bronx Dice"
      />
      <button type="button" onClick={onOpenAuth}>
        {user ? 'Profil gracza' : 'Zaloguj się'}
      </button>
      <label htmlFor="player-count">Liczba graczy</label>
      <select
        id="player-count"
        value={playerCount}
        onChange={(event) =>
          handlePlayerCountChange(Number(event.target.value))
        }
      >
        {Array.from(
          { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
          (_, i) => MIN_PLAYERS + i
        ).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>

      <label className="randomize-order-label">
        <input
          type="checkbox"
          checked={randomizeOrder}
          onChange={(event) => setRandomizeOrder(event.target.checked)}
        />
        Losuj kolejność
      </label>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleRows.map((row) => row.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleRows.map((row, index) => (
            <PlayerRowField
              key={row.id}
              row={row}
              label={defaultName(index)}
              dragDisabled={randomizeOrder}
              onChange={handleNameChange}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        disabled={!canStart}
        onClick={handleStart}
      >
        Rozpocznij grę
      </button>
    </div>
  );
}

export default StartScreen;
