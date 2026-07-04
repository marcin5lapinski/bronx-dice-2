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
  { id: 'avatar17', src: '/dice/avatars/avatar17.png' },
  { id: 'avatar18', src: '/dice/avatars/avatar18.png' },
  { id: 'avatar19', src: '/dice/avatars/avatar19.png' },
  { id: 'avatar20', src: '/dice/avatars/avatar20.png' },
  { id: 'avatar21', src: '/dice/avatars/avatar21.png' },
  { id: 'avatar22', src: '/dice/avatars/avatar22.png' },
  { id: 'avatar23', src: '/dice/avatars/avatar23.png' },
  { id: 'avatar24', src: '/dice/avatars/avatar24.png' },
  { id: 'avatar25', src: '/dice/avatars/avatar25.png' },
  { id: 'avatar26', src: '/dice/avatars/avatar26.png' },
  { id: 'avatar27', src: '/dice/avatars/avatar27.png' },
  { id: 'avatar28', src: '/dice/avatars/avatar28.png' },
  { id: 'avatar29', src: '/dice/avatars/avatar29.png' },
  { id: 'avatar30', src: '/dice/avatars/avatar30.png' },
  { id: 'avatar31', src: '/dice/avatars/avatar31.png' },
  { id: 'avatar32', src: '/dice/avatars/avatar32.png' },
];

export function avatarSrc(avatarId: string): string {
  return (
    AVATAR_OPTIONS.find((option) => option.id === avatarId)?.src ??
    AVATAR_OPTIONS[0].src
  );
}
