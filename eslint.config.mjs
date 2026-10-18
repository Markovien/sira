// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.expo/**',
      'data/osm/**',
      'infra/osrm/data/**',
      'apps/api/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // NestJS lit les types des parametres de constructeur a l'execution, via
    // les metadonnees de decorateurs. Un `import type` est efface a la
    // compilation : la metadonnee devient `Object` et l'injection echoue au
    // demarrage, pas au typecheck. La regle est donc inversee ici (voir
    // decisions.md), et seulement pour le code applicatif de l'API.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Prisma genere des types dont les appels renvoient des unions larges ;
    // les regles « unsafe » de typescript-eslint produisent du bruit sans
    // valeur sur le code d'acces aux donnees.
    files: ['apps/api/src/prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    // Scripts d'outillage : Node pur, hors projet TS.
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
