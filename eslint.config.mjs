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
      // `x == null` teste null ou undefined d'un coup : c'est l'outil exact,
      // pas une negligence. Toute autre comparaison laxiste reste interdite.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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
    // Supertest type `res.body` et `getHttpServer()` en `any`, par conception :
    // une reponse HTTP n'a pas de type statique. Ecrire une interface par
    // reponse dans les tests ajouterait du bruit sans rien verifier de plus —
    // ce sont les assertions qui font foi. Les regles « unsafe » sont donc
    // levees ici, et uniquement dans les tests.
    files: ['apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
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
    languageOptions: {
      sourceType: 'module',
      // no-undef reste actif — il attrape les fautes de frappe dans ces
      // scripts, que rien d'autre ne typecheck — d'ou cette liste explicite
      // plutot qu'une dependance au paquet `globals` pour cinq entrees.
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  prettier,
);
