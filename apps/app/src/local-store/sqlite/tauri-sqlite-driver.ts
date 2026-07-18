import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'
import type {
  SqlBindValue,
  SqlDatabase,
  SqlQueryResult,
  SqlStatement,
} from '@/local-store/sqlite/sqlite-driver'

type TauriDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<SqlQueryResult>
  select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues?: unknown[],
  ): Promise<TRow[]>
}

export class TauriSqliteDatabase implements SqlDatabase {
  private readonly db: TauriDatabase
  private readonly connectionString: string

  constructor(db: TauriDatabase, connectionString: string) {
    this.db = db
    this.connectionString = connectionString
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

  async executeTransaction(statements: SqlStatement[]): Promise<void> {
    await invoke('execute_sqlite_transaction', {
      db: this.connectionString,
      statements: statements.map(({ query, bindValues = [] }) => ({
        query,
        bindValues,
      })),
    })
  }
}

export async function loadTauriSqliteDatabase(
  connectionString = 'sqlite:silicon-nostalgia.db',
): Promise<TauriSqliteDatabase> {
  return new TauriSqliteDatabase(
    await Database.load(connectionString),
    connectionString,
  )
}
