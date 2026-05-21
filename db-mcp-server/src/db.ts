import pg from "pg";

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "postgres",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "123456",
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const WRITE_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|CALL)\b/i;

/**
 * Execute a read-only query inside a READ ONLY transaction with a 30s timeout.
 * Rejects any SQL that looks like a write operation (dual-layer: regex + PG enforcement).
 */
export async function safeQuery(sql: string, params?: unknown[]): Promise<pg.QueryResult> {
  if (WRITE_PATTERN.test(sql)) {
    throw new Error("Write operations are not allowed. Only SELECT queries are permitted.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Internal query — no write guard (used for information_schema lookups that are inherently safe).
 */
export async function internalQuery(sql: string, params?: unknown[]): Promise<pg.QueryResult> {
  const client = await pool.connect();
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}
