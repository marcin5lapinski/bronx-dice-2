// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playSound, isSoundMuted, setSoundMuted } from './sound';

describe('sound', () => {
  let playMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let AudioMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    playMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    // A regular `function` (not an arrow function) so `new Audio(...)` can
    // invoke it as a constructor — arrow functions are never constructible.
    AudioMock = vi.fn().mockImplementation(function (this: { play: () => Promise<void> }) {
      this.play = playMock;
    });
    vi.stubGlobal('Audio', AudioMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('isSoundMuted / setSoundMuted', () => {
    it('is not muted by default', () => {
      expect(isSoundMuted()).toBe(false);
    });

    it('persists the muted preference', () => {
      setSoundMuted(true);
      expect(isSoundMuted()).toBe(true);
    });

    it('can be unmuted again', () => {
      setSoundMuted(true);
      setSoundMuted(false);
      expect(isSoundMuted()).toBe(false);
    });
  });

  describe('playSound', () => {
    it('plays the start-game sound from the correct path', () => {
      playSound('start-game');

      expect(AudioMock).toHaveBeenCalledWith('/dice/sounds/start-game.wav');
      expect(playMock).toHaveBeenCalled();
    });

    it('plays the your-turn sound from the correct path', () => {
      playSound('your-turn');

      expect(AudioMock).toHaveBeenCalledWith('/dice/sounds/your-turn.wav');
      expect(playMock).toHaveBeenCalled();
    });

    it('swallows a rejected play() promise without throwing', async () => {
      playMock.mockRejectedValue(new Error('autoplay blocked'));

      expect(() => playSound('start-game')).not.toThrow();
      await Promise.resolve();
    });

    it('does not play anything when sounds are muted', () => {
      setSoundMuted(true);

      playSound('start-game');

      expect(AudioMock).not.toHaveBeenCalled();
    });

    it('plays again once unmuted', () => {
      setSoundMuted(true);
      setSoundMuted(false);

      playSound('your-turn');

      expect(AudioMock).toHaveBeenCalledWith('/dice/sounds/your-turn.wav');
    });
  });
});
