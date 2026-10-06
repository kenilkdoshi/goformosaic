import pg from "pg";

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    // Prisma stores UTC in "timestamp without time zone" columns; make now() agree with it.
    options: "-c TimeZone=UTC",
  });
  // Idle connections can be dropped by the server (restarts, maintenance). Without a listener
  // the 'error' event would crash the host; the pool discards the client and reconnects on demand.
  pool.on("error", (err) => console.warn(`Postgres idle client error: ${err.message}`));
  return pool;
}
