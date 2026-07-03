import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { PlayerProfile } from '../types/auth';

function profileRef(uid: string) {
  return doc(db, 'users', uid);
}

export async function getProfile(uid: string): Promise<PlayerProfile | null> {
  const snapshot = await getDoc(profileRef(uid));
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return {
    displayName: data.displayName,
    avatarId: data.avatarId,
    email: data.email,
    createdAt: (data.createdAt as Timestamp).toMillis(),
  };
}

export async function createProfile(
  uid: string,
  data: { displayName: string; avatarId: string; email: string }
): Promise<PlayerProfile> {
  const createdAt = Timestamp.now();
  await setDoc(profileRef(uid), { ...data, createdAt });
  return { ...data, createdAt: createdAt.toMillis() };
}

export async function updateProfile(
  uid: string,
  data: { displayName: string; avatarId: string }
): Promise<void> {
  await updateDoc(profileRef(uid), data);
}
