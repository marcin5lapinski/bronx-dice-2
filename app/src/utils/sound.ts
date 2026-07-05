const SOUND_FILES = {
  'start-game': '/dice/sounds/start-game.wav',
  'your-turn': '/dice/sounds/your-turn.wav',
} as const;

export type SoundName = keyof typeof SOUND_FILES;

const SOUND_MUTED_KEY = 'bronxDice.soundsMuted';

export function isSoundMuted(): boolean {
  return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
}

export function setSoundMuted(muted: boolean): void {
  localStorage.setItem(SOUND_MUTED_KEY, String(muted));
}

export function playSound(name: SoundName): void {
  if (isSoundMuted()) {
    return;
  }
  const audio = new Audio(SOUND_FILES[name]);
  audio.play().catch(() => {
    // Autoplay can be blocked by the browser before any user gesture on the
    // page — missing a notification sound isn't worth surfacing as an error.
  });
}
