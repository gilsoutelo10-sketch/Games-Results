import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Época (ex.: 2026-2027)
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  startYear: integer("start_year").notNull(),
  fpfSeasonId: integer("fpf_season_id"),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Associação (ex.: AF Lisboa, AF Porto)
export const associations = pgTable("associations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  fpfAssociationId: integer("fpf_association_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Escalão (ex.: Seniores, Juniores, Juvenis) – por época e associação
export const ageGroups = pgTable(
  "age_groups",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    associationId: integer("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fpfCompetitionId: integer("fpf_competition_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.seasonId, t.associationId, t.name)],
);

// Fase (ex.: 1ª Fase, Fase de Apuramento de Campeão, Fase de Manutenção)
export const phases = pgTable(
  "phases",
  {
    id: serial("id").primaryKey(),
    ageGroupId: integer("age_group_id")
      .notNull()
      .references(() => ageGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.ageGroupId, t.name)],
);

// Série (ex.: Série A, Série B)
export const series = pgTable(
  "series",
  {
    id: serial("id").primaryKey(),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fpfSerieId: integer("fpf_serie_id"),
    fpfFixtureIds: text("fpf_fixture_ids"),
    lastSyncedAt: timestamp("last_synced_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.phaseId, t.name)],
);

// Equipas (clubes) – pertencem a uma associação
export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    associationId: integer("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.associationId, t.name)],
);

// Inscrição de equipas numa série
export const serieTeams = pgTable(
  "serie_teams",
  {
    id: serial("id").primaryKey(),
    serieId: integer("serie_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    pointsPenalty: integer("points_penalty").notNull().default(0),
  },
  (t) => [unique().on(t.serieId, t.teamId)],
);

// Jogos
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  serieId: integer("serie_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  round: integer("round").notNull().default(1),
  matchDate: date("match_date"),
  homeTeamId: integer("home_team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  awayTeamId: integer("away_team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  homeGoals: integer("home_goals"),
  awayGoals: integer("away_goals"),
  matchTime: text("match_time"),
  venue: text("venue"),
  fpfMatchId: text("fpf_match_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Classificação oficial (importada da FPF). Quando existe, prevalece sobre a calculada.
export const officialStandings = pgTable(
  "official_standings",
  {
    id: serial("id").primaryKey(),
    serieId: integer("serie_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    played: integer("played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    goalsFor: integer("goals_for").notNull().default(0),
    goalsAgainst: integer("goals_against").notNull().default(0),
    points: integer("points").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.serieId, t.teamId)],
);

// Registo de importações
export const importLogs = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Season = typeof seasons.$inferSelect;
export type Association = typeof associations.$inferSelect;
export type AgeGroup = typeof ageGroups.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type Serie = typeof series.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
