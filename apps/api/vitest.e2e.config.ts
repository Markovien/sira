import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Tests de bout en bout (Supertest) contre une vraie base.
 *
 *   pnpm infra:up && pnpm --filter @sira/api prisma:deploy
 *   pnpm --filter @sira/api test:e2e
 *
 * En serie et sans parallelisme : plusieurs fichiers ecrivant dans la meme
 * base se marcheraient dessus, et un echec intermittent coute plus cher que
 * les quelques secondes gagnees.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.e2e.test.ts'],
    root: './',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
