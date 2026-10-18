import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.spec.ts'],
    root: './',
  },
  // Vitest passe par esbuild, qui ne sait pas emettre les metadonnees de
  // decorateurs dont NestJS a besoin pour l'injection. SWC le fait.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
