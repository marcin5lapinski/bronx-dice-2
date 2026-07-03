import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProfile, createProfile, updateProfile } from './profileService';

const mockDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockTimestampNow = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  Timestamp: { now: () => mockTimestampNow() },
}));

vi.mock('../firebase/client', () => ({
  auth: {},
  db: 'the-db-instance',
}));

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('doc-ref');
  });

  it('getProfile returns null when the document does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const result = await getProfile('uid-1');
    expect(result).toBeNull();
    expect(mockDoc).toHaveBeenCalledWith('the-db-instance', 'users', 'uid-1');
  });

  it('getProfile maps the stored document to a PlayerProfile', async () => {
    const toMillis = vi.fn().mockReturnValue(1700000000000);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'Ola',
        avatarId: 'fox',
        email: 'ola@example.com',
        createdAt: { toMillis },
      }),
    });
    const result = await getProfile('uid-1');
    expect(result).toEqual({
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });
  });

  it('createProfile writes the profile with a client-generated timestamp', async () => {
    const toMillis = vi.fn().mockReturnValue(1700000000000);
    mockTimestampNow.mockReturnValue({ toMillis });
    mockSetDoc.mockResolvedValue(undefined);

    const result = await createProfile('uid-1', {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: { toMillis },
    });
    expect(result).toEqual({
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });
  });

  it('updateProfile updates only displayName and avatarId', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);
    await updateProfile('uid-1', { displayName: 'Nowa', avatarId: 'owl' });
    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Nowa',
      avatarId: 'owl',
    });
  });
});
