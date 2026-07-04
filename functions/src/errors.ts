import { HttpsError } from 'firebase-functions/v2/https';

export function unauthenticated(message = 'Musisz być zalogowany.'): HttpsError {
  return new HttpsError('unauthenticated', message);
}

export function notFound(message = 'Pokój nie istnieje.'): HttpsError {
  return new HttpsError('not-found', message);
}

export function permissionDenied(message: string): HttpsError {
  return new HttpsError('permission-denied', message);
}

export function failedPrecondition(message: string): HttpsError {
  return new HttpsError('failed-precondition', message);
}

export function invalidArgument(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

export function internal(message = 'Coś poszło nie tak. Spróbuj ponownie.'): HttpsError {
  return new HttpsError('internal', message);
}
