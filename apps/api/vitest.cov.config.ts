import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Mesure de couverture, critere d'acceptation de la Phase 1 : >= 70 % sur les
 * services.
 *
 * Unitaires et bout en bout dans la meme passe, donc une base est requise. Les
 * deux sont indissociables ici : un service NestJS n'est presque jamais
 * exerce par un test unitaire seul, et mesurer la couverture sans les e2e
 * donnerait un chiffre qui ne dit rien de ce qui est reellement teste.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.spec.ts'],
    root: './',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        // Cable NestJS et declarations : les couvrir ne mesurerait que le
        // fait d'avoir demarre l'application.
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.decorator.ts',
      ],
      thresholds: {
        'src/**/*.service.ts': {
          lines: 70,
          functions: 70,
          statements: 70,
          branches: 60,
        },
      },
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
