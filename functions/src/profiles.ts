import type { Firestore } from 'firebase-admin/firestore';
import { failedPrecondition } from './errors';

export interface StoredProfile {
  displayName: string;
  avatarId: string;
}

export async function getProfileOrThrow(
  db: Firestore,
  uid: string
): Promise<StoredProfile> {
  const snapshot = await db.collection('users').doc(uid).get();
  if (!snapshot.exists) {
    throw failedPrecondition('Uzupełnij najpierw profil gracza.');
  }
  const data = snapshot.data() as StoredProfile;
  return { displayName: data.displayName, avatarId: data.avatarId };
}
