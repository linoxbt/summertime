import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export type Db = pg.Pool;

// BIGINT columns come back as strings; keep them as strings (amounts are bigint in the app).
export function createDb(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

/** Apply pending SQL migrations in order, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = await readFile(join(migrationsDir, f), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Serialize concurrent migrators (API and worker start together).
      await client.query("SELECT pg_advisory_xact_lock(7311)");
      const again = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [f]);
      if (again.rowCount === 0) {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
        done.push(f);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return done;
}

export async function getSystemConfig<T>(db: Db, key: string): Promise<T | undefined> {
  const r = await db.query<{ value: T }>("SELECT value FROM system_config WHERE key = $1", [key]);
  return r.rows[0]?.value;
}

export async function setSystemConfig(db: Db, key: string, value: unknown): Promise<void> {
  await db.query(
    "INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)],
  );
}

/** Deployment settings written by bootstrap. */
export interface Deployment {
  operatorParty: string;
  registryAdmin: string;
  instrument: { admin: string; id: string; decimals: number; symbol: string };
  network: "sandbox" | "localnet" | "devnet" | "testnet" | "mainnet";
}

export async function getDeployment(db: Db): Promise<Deployment> {
  const d = await getSystemConfig<Deployment>(db, "deployment");
  if (!d) throw new Error("Deployment not bootstrapped: run `npm run bootstrap`");
  return d;
}

/** Pilot-hosted parties the platform signs for (forwarders and pilot importers). */
export async function pilotParties(db: Db): Promise<{ party: string; role: string; handle: string }[]> {
  const r = await db.query<{ party: string; role: string; handle: string }>(
    `SELECT p.party_id AS party, u.role, u.handle FROM party_links p JOIN users u ON u.id = p.user_id WHERE p.mode = 'pilot'`,
  );
  return r.rows;
}
