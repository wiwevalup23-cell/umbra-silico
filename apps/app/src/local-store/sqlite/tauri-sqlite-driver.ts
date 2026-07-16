import Database from '@tauri-apps/plugin-sql'
import type { SqlBindValue, SqlDatabase, SqlQueryResult } from '@/local-store/sqlite/sqlite-driver'

type TauriDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<SqlQueryResult>
  select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues?: unknown[],
  ): Promise<TRow[]>
}

export class TauriSqliteDatabase implements SqlDatabase {
  private readonly db: TauriDatabase

  constructor(db: TauriDatabase) {
    this.db = db
  }

  execute(query: string, bindValues?: SqlBindValue[]) {
    return this.db.execute(query, bindValues)
  }

  select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues?: SqlBindValue[],
  ) {
    return this.db.select<TRow>(query, bindValues)
  }
}

export async function loadTauriSqliteDatabase(
  connectionString = 'sqlite:silicon-nostalgia.db',
): Promise<TauriSqliteDatabase> {
  return new TauriSqliteDatabase(await Database.load(connectionString))
}
