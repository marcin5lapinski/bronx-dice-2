export interface AvatarOption {
  id: string;
  emoji: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'fox', emoji: '🦊' },
  { id: 'wolf', emoji: '🐺' },
  { id: 'owl', emoji: '🦉' },
  { id: 'cat', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
  { id: 'lion', emoji: '🦁' },
  { id: 'tiger', emoji: '🐯' },
  { id: 'panda', emoji: '🐼' },
  { id: 'koala', emoji: '🐨' },
  { id: 'frog', emoji: '🐸' },
  { id: 'octopus', emoji: '🐙' },
  { id: 'dragon', emoji: '🐉' },
];

export function avatarEmoji(avatarId: string): string {
  return AVATAR_OPTIONS.find((option) => option.id === avatarId)?.emoji ?? '❓';
}
