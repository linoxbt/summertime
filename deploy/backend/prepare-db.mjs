// Prepare Postgres for the hosted ledger and print shell exports for start.sh:
//   eval "$(node deploy/backend/prepare-db.mjs)"
// Creates canton_sequencer, canton_sequencer_driver, canton_mediator and canton_participant
// on the same server as
// DATABASE_URL if they are missing (the user needs CREATEDB, which Railway's postgres has).

import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
const conn = {
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
};

const client = new pg.Client({ ...conn, database: url.pathname.slice(1) || "postgres" });
await client.connect();
for (const db of ["canton_sequencer", "canton_sequencer_driver", "canton_mediator", "canton_participant"]) {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (!exists.rowCount) {
    await client.query(`CREATE DATABASE ${db}`);
    console.error(`[prepare-db] created ${db}`);
  }
}
await client.end();

const q = (v) => `'${String(v).replaceAll("'", `'\\''`)}'`;
console.log(`export CANTON_DB_HOST=${q(conn.host)} CANTON_DB_PORT=${q(conn.port)} CANTON_DB_USER=${q(conn.user)} CANTON_DB_PASSWORD=${q(conn.password)}`);
