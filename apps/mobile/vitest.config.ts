import { defineConfig } from 'vitest/config';

// Seul `src/core` est teste ici : il ne depend pas de React Native (voir
// decisions.md, 25/10/2026). Les ecrans relevent des parcours Maestro.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
