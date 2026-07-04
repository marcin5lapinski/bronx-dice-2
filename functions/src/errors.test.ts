import { describe, it, expect } from 'vitest';
import {
  unauthenticated,
  notFound,
  permissionDenied,
  failedPrecondition,
  invalidArgument,
  internal,
} from './errors';

describe('errors', () => {
  it('unauthenticated returns an unauthenticated HttpsError with a default Polish message', () => {
    const error = unauthenticated();
    expect(error.code).toBe('unauthenticated');
    expect(error.message).toBe('Musisz być zalogowany.');
  });

  it('notFound returns a not-found HttpsError with a default Polish message', () => {
    const error = notFound();
    expect(error.code).toBe('not-found');
    expect(error.message).toBe('Pokój nie istnieje.');
  });

  it('permissionDenied returns a permission-denied HttpsError with the given message', () => {
    const error = permissionDenied('To nie twoja tura.');
    expect(error.code).toBe('permission-denied');
    expect(error.message).toBe('To nie twoja tura.');
  });

  it('failedPrecondition returns a failed-precondition HttpsError with the given message', () => {
    const error = failedPrecondition('Zła faza gry.');
    expect(error.code).toBe('failed-precondition');
    expect(error.message).toBe('Zła faza gry.');
  });

  it('invalidArgument returns an invalid-argument HttpsError with the given message', () => {
    const error = invalidArgument('Zły indeks kostki.');
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe('Zły indeks kostki.');
  });

  it('internal returns an internal HttpsError with a default Polish message', () => {
    const error = internal();
    expect(error.code).toBe('internal');
    expect(error.message).toBe('Coś poszło nie tak. Spróbuj ponownie.');
  });
});
