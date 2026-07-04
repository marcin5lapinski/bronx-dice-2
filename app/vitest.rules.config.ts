import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/firebase/firestoreRules.test.ts'],
    testTimeout: 20000,
  },
});
