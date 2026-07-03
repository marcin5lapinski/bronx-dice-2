export interface AvatarOption {
  id: string;
  src: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'avatar01', src: '/dice/avatars/avatar01.png' },
  { id: 'avatar02', src: '/dice/avatars/avatar02.png' },
  { id: 'avatar03', src: '/dice/avatars/avatar03.png' },
  { id: 'avatar04', src: '/dice/avatars/avatar04.png' },
  { id: 'avatar05', src: '/dice/avatars/avatar05.png' },
  { id: 'avatar06', src: '/dice/avatars/avatar06.png' },
  { id: 'avatar07', src: '/dice/avatars/avatar07.png' },
  { id: 'avatar08', src: '/dice/avatars/avatar08.png' },
  { id: 'avatar09', src: '/dice/avatars/avatar09.png' },
  { id: 'avatar10', src: '/dice/avatars/avatar10.png' },
  { id: 'avatar11', src: '/dice/avatars/avatar11.png' },
  { id: 'avatar12', src: '/dice/avatars/avatar12.png' },
  { id: 'avatar13', src: '/dice/avatars/avatar13.png' },
  { id: 'avatar14', src: '/dice/avatars/avatar14.png' },
  { id: 'avatar15', src: '/dice/avatars/avatar15.png' },
  { id: 'avatar16', src: '/dice/avatars/avatar16.png' },
];

export function avatarSrc(avatarId: string): string {
  return (
    AVATAR_OPTIONS.find((option) => option.id === avatarId)?.src ??
    AVATAR_OPTIONS[0].src
  );
}
