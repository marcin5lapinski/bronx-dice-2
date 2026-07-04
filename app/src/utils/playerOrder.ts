import { arrayMove } from '@dnd-kit/sortable';

export interface PlayerNameRow {
  id: string;
  value: string;
}

export function reorderNames(
  rows: PlayerNameRow[],
  activeId: string,
  overId: string | null
): PlayerNameRow[] {
  if (!overId || activeId === overId) {
    return rows;
  }
  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);
  if (oldIndex === -1 || newIndex === -1) {
    return rows;
  }
  return arrayMove(rows, oldIndex, newIndex);
}

export function reorderIds(
  ids: string[],
  activeId: string,
  overId: string | null
): string[] {
  if (!overId || activeId === overId) {
    return ids;
  }
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) {
    return ids;
  }
  return arrayMove(ids, oldIndex, newIndex);
}

export function shufflePlayerOrder(
  names: string[],
  random: () => number = Math.random
): string[] {
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
