import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPglite?: PGlite;
  __arenaNextJsDb?: NodePgDatabase;
  __arenaSchemaReady?: Promise<void>;
};

function createDb(): NodePgDatabase {
  if (databaseUrl && !databaseUrl.startsWith("pglite://")) {
    const pool =
      globalForDb.__arenaNextJsPostgresqlPool ??
      new Pool({
        connectionString: databaseUrl,
      });
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__arenaNextJsPostgresqlPool = pool;
    }
    return drizzlePg(pool);
  }

  const dataDir =
    process.env.PGLITE_DATA_DIR ||
    (process.env.VERCEL ? "memory://" : path.join(process.cwd(), "pgdata"));

  const client = globalForDb.__arenaNextJsPglite ?? new PGlite(dataDir);
  globalForDb.__arenaNextJsPglite = client;
  return drizzlePglite(client) as unknown as NodePgDatabase;
}

export const db: NodePgDatabase = globalForDb.__arenaNextJsDb ?? createDb();
globalForDb.__arenaNextJsDb = db;

const SCHEMA_STATEMENTS = [
  sql`CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    start_year INTEGER NOT NULL,
    fpf_season_id INTEGER,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS associations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    fpf_association_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS age_groups (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    association_id INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fpf_competition_id INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (season_id, association_id, name)
  )`,
  sql`CREATE TABLE IF NOT EXISTS phases (
    id SERIAL PRIMARY KEY,
    age_group_id INTEGER NOT NULL REFERENCES age_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (age_group_id, name)
  )`,
  sql`CREATE TABLE IF NOT EXISTS series (
    id SERIAL PRIMARY KEY,
    phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fpf_serie_id INTEGER,
    fpf_fixture_ids TEXT,
    last_synced_at TIMESTAMP,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (phase_id, name)
  )`,
  sql`CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (association_id, name)
  )`,
  sql`CREATE TABLE IF NOT EXISTS serie_teams (
    id SERIAL PRIMARY KEY,
    serie_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points_penalty INTEGER NOT NULL DEFAULT 0,
    UNIQUE (serie_id, team_id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    serie_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    round INTEGER NOT NULL DEFAULT 1,
    match_date DATE,
    home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    home_goals INTEGER,
    away_goals INTEGER,
    match_time TEXT,
    venue TEXT,
    fpf_match_id TEXT UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS official_standings (
    id SERIAL PRIMARY KEY,
    serie_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    goals_for INTEGER NOT NULL DEFAULT 0,
    goals_against INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (serie_id, team_id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS import_logs (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
];

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__arenaSchemaReady) {
    globalForDb.__arenaSchemaReady = (async () => {
      for (const stmt of SCHEMA_STATEMENTS) {
        await db.execute(stmt);
      }
    })().catch((err) => {
      globalForDb.__arenaSchemaReady = undefined;
      throw err;
    });
  }
  return globalForDb.__arenaSchemaReady;
}
