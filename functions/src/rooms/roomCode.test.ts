import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_LENGTH } from './roomCode';

describe('generateRoomCode', () => {
  it('generates a code of the expected length', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('only uses characters from the unambiguous alphabet (no 0/O/1/I/L)', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('is deterministic for an injected random function', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
  });

  it('produces different codes for different random sequences', () => {
    let call = 0;
    const sequence = [0, 0.2, 0.4, 0.6, 0.8];
    const random = () => sequence[call++];
    expect(generateRoomCode(random)).not.toBe('AAAAA');
  });
});
