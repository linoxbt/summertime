import { RegistryClient, type LedgerClient, type PartyRef } from "@summertime/ledger";
import { CommandRunner, createDb, createLedger, createLogger, getDeployment, loadConfig, type Config, type Db, type Deployment, type Logger } from "@summertime/platform";

export interface AppContext {
  config: Config;
  db: Db;
  ledger: LedgerClient;
  registry: RegistryClient;
  commands: CommandRunner;
  log: Logger;
  deployment: () => Promise<Deployment>;
  directory: Directory;
}

/** Party ↔ display name lookups from the application database (non-authoritative labels). */
export class Directory {
  private cache = new Map<string, PartyRef>();
  private loadedAt = 0;

  constructor(private readonly db: Db) {}

  private async refresh(): Promise<void> {
    if (Date.now() - this.loadedAt < 5000) return;
    const r = await this.db.query<{ party_id: string; display_name: string; handle: string }>(
      "SELECT p.party_id, u.display_name, u.handle FROM party_links p JOIN users u ON u.id = p.user_id",
    );
    this.cache = new Map(r.rows.map((row) => [row.party_id, { party: row.party_id, displayName: row.display_name, handle: row.handle }]));
    this.loadedAt = Date.now();
  }

  async ref(party: string): Promise<PartyRef> {
    await this.refresh();
    return this.cache.get(party) ?? { party, displayName: shortParty(party) };
  }

  async byHandle(handle: string): Promise<PartyRef | undefined> {
    await this.refresh();
    return [...this.cache.values()].find((p) => p.handle === handle);
  }
}

export function shortParty(party: string): string {
  const [hint] = party.split("::");
  return hint ?? party;
}

export function createContext(): AppContext {
  const config = loadConfig();
  const log = createLogger("summertime-api");
  const db = createDb(config.databaseUrl);
  const ledger = createLedger(config);
  let deployment: Deployment | undefined;
  return {
    config,
    db,
    ledger,
    registry: new RegistryClient(config.registryUrl),
    commands: new CommandRunner(ledger, db, log),
    log,
    deployment: async () => (deployment ??= await getDeployment(db)),
    directory: new Directory(db),
  };
}
