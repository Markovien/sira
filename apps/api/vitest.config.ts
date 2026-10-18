import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Tests unitaires : aucune dependance externe, donc rejouables partout.
 * Les tests de bout en bout vivent dans vitest.e2e.config.ts — ils exigent
 * une base demarree, et melanger les deux rendrait `pnpm test` impossible a
 * lancer sans infrastructure.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'test/**/*.e2e.test.ts'],
    root: './',
  },
  // Vitest passe par esbuild, qui ne sait pas emettre les metadonnees de
  // decorateurs dont NestJS a besoin pour l'injection. SWC le fait.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
