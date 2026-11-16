// Environment configuration shared by the API, worker and dev registry.

export interface Config {
  ledgerUrl: string;
  registryUrl: string;
  databaseUrl: string;
  apiPort: number;
  registryPort: number;
  sessionSecret: string;
  /** Enables the demo sign-in, faucet and privacy explorer. Never set in production. */
  demoMode: boolean;
  /** Seconds between scheduled progress publications (spec F-6; Proposed: hourly). */
  progressIntervalSeconds: number;
  /** Seconds between worker reconciliation passes. */
  workerTickSeconds: number;
  ledgerUserId: string;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function loadConfig(): Config {
  return {
    ledgerUrl: env("LEDGER_URL", "http://localhost:7575"),
    registryUrl: env("REGISTRY_URL", "http://localhost:7590"),
    databaseUrl: env("DATABASE_URL", "postgres://summertime:summertime@127.0.0.1:5432/summertime"),
    apiPort: Number(env("API_PORT", "7580")),
    registryPort: Number(env("REGISTRY_PORT", "7590")),
    sessionSecret: env("SESSION_SECRET", "dev-only-session-secret-change-me"),
    demoMode: env("DEMO_MODE", "true") === "true",
    progressIntervalSeconds: Number(env("PROGRESS_INTERVAL_SECONDS", "3600")),
    workerTickSeconds: Number(env("WORKER_TICK_SECONDS", "2")),
    ledgerUserId: env("LEDGER_USER_ID", "summertime"),
  };
}
