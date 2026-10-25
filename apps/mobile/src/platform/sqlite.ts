import * as SQLite from 'expo-sqlite';
import type { SqlDriver } from '../core/local-db';

/** Traduction d'appels, sans logique : le SQL et ses tests vivent dans `core`. */
export async function openSqliteDriver(name = 'sira.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, [...params]);
    },
    all: (sql, params = []) => db.getAllAsync(sql, [...params]),
  };
}
