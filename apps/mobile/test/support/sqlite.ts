/// <reference types="node" />
import { createRequire } from 'node:module';
import type * as NodeSqlite from 'node:sqlite';
import type { SqlDriver, SqlValue } from '../../src/core/local-db';

// Vite ne sait pas resoudre `node:sqlite` (module recent, absent de sa liste
// des modules natifs) : on passe par le require de Node.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof NodeSqlite;

/** Meme moteur que sur le telephone, en memoire : le SQL de `core` est teste pour de vrai. */
export function memorySqlite(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  return {
    exec(sql) {
      db.exec(sql);
      return Promise.resolve();
    },
    run(sql, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...params);
      return Promise.resolve();
    },
    all<T>(sql: string, params: readonly SqlValue[] = []) {
      return Promise.resolve(db.prepare(sql).all(...params) as T[]);
    },
  };
}
