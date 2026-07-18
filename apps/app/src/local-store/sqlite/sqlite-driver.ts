export type SqlBindValue = string | number | null

export type SqlQueryResult = {
  rowsAffected: number
  lastInsertId?: number
}

export type SqlStatement = {
  query: string
  bindValues?: SqlBindValue[]
}

export interface SqlDatabase {
  execute(query: string, bindValues?: SqlBindValue[]): Promise<SqlQueryResult>
  executeTransaction?(statements: SqlStatement[]): Promise<void>
  select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues?: SqlBindValue[],
  ): Promise<TRow[]>
}

export async function runSqlStatements(
  db: SqlDatabase,
  sql: string,
): Promise<void> {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await db.execute(statement)
  }
}
