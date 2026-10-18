import { db } from "@/db";
import {
  ageGroups,
  associations,
  matches,
  officialStandings,
  phases,
  serieTeams,
  series,
  seasons,
  teams,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function getSeasons() {
  return db.select().from(seasons).orderBy(asc(seasons.startYear));
}

export async function getAssociations() {
  return db.select().from(associations).orderBy(asc(associations.name));
}

export async function getAgeGroups(seasonId: number, associationId: number) {
  return db
    .select()
    .from(ageGroups)
    .where(and(eq(ageGroups.seasonId, seasonId), eq(ageGroups.associationId, associationId)))
    .orderBy(asc(ageGroups.sortOrder), asc(ageGroups.name));
}

export async function getPhases(ageGroupId: number) {
  return db
    .select()
    .from(phases)
    .where(eq(phases.ageGroupId, ageGroupId))
    .orderBy(asc(phases.sortOrder), asc(phases.name));
}

export async function getSeries(phaseId: number) {
  return db
    .select()
    .from(series)
    .where(eq(series.phaseId, phaseId))
    .orderBy(asc(series.sortOrder), asc(series.name));
}

export async function getTeamsByAssociation(associationId: number) {
  return db
    .select()
    .from(teams)
    .where(eq(teams.associationId, associationId))
    .orderBy(asc(teams.name));
}

export async function getSerieTeams(serieId: number) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      serieTeamId: serieTeams.id,
      pointsPenalty: serieTeams.pointsPenalty,
    })
    .from(serieTeams)
    .innerJoin(teams, eq(serieTeams.teamId, teams.id))
    .where(eq(serieTeams.serieId, serieId))
    .orderBy(asc(teams.name));
}

export async function getSerieMatches(serieId: number) {
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  return db
    .select({
      id: matches.id,
      round: matches.round,
      matchDate: matches.matchDate,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeam: home.name,
      awayTeam: away.name,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      matchTime: matches.matchTime,
      venue: matches.venue,
      fpfMatchId: matches.fpfMatchId,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(eq(matches.serieId, serieId))
    .orderBy(asc(matches.round), asc(matches.matchDate), asc(matches.id));
}

export type StandingRow = {
  teamId: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  penalty: number;
};

export type StandingsResult = { rows: StandingRow[]; official: boolean };

export async function getStandings(serieId: number): Promise<StandingsResult> {
  const official = await db
    .select({
      teamId: officialStandings.teamId,
      team: teams.name,
      position: officialStandings.position,
      played: officialStandings.played,
      wins: officialStandings.wins,
      draws: officialStandings.draws,
      losses: officialStandings.losses,
      goalsFor: officialStandings.goalsFor,
      goalsAgainst: officialStandings.goalsAgainst,
      points: officialStandings.points,
    })
    .from(officialStandings)
    .innerJoin(teams, eq(officialStandings.teamId, teams.id))
    .where(eq(officialStandings.serieId, serieId))
    .orderBy(asc(officialStandings.position));
  if (official.length) {
    return {
      official: true,
      rows: official.map((r) => ({
        teamId: r.teamId,
        team: r.team,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        goalDiff: r.goalsFor - r.goalsAgainst,
        points: r.points,
        penalty: 0,
      })),
    };
  }
  return { official: false, rows: await computeStandings(serieId) };
}

export async function computeStandings(serieId: number): Promise<StandingRow[]> {
  const [teamRows, matchRows] = await Promise.all([
    getSerieTeams(serieId),
    getSerieMatches(serieId),
  ]);

  const table = new Map<number, StandingRow>();
  for (const t of teamRows) {
    table.set(t.id, {
      teamId: t.id,
      team: t.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: -t.pointsPenalty,
      penalty: t.pointsPenalty,
    });
  }

  for (const m of matchRows) {
    if (m.homeGoals === null || m.awayGoals === null) continue;
    const h = table.get(m.homeTeamId);
    const a = table.get(m.awayTeamId);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.goalsFor += m.homeGoals;
    h.goalsAgainst += m.awayGoals;
    a.goalsFor += m.awayGoals;
    a.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) {
      h.wins++;
      h.points += 3;
      a.losses++;
    } else if (m.homeGoals < m.awayGoals) {
      a.wins++;
      a.points += 3;
      h.losses++;
    } else {
      h.draws++;
      a.draws++;
      h.points++;
      a.points++;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) r.goalDiff = r.goalsFor - r.goalsAgainst;
  rows.sort(
    (x, y) =>
      y.points - x.points ||
      y.goalDiff - x.goalDiff ||
      y.goalsFor - x.goalsFor ||
      x.team.localeCompare(y.team, "pt"),
  );
  return rows;
}

/** Resolve the full breadcrumb for a serie id. */
export async function getSerieContext(serieId: number) {
  const rows = await db
    .select({
      serie: series,
      phase: phases,
      ageGroup: ageGroups,
      association: associations,
      season: seasons,
    })
    .from(series)
    .innerJoin(phases, eq(series.phaseId, phases.id))
    .innerJoin(ageGroups, eq(phases.ageGroupId, ageGroups.id))
    .innerJoin(associations, eq(ageGroups.associationId, associations.id))
    .innerJoin(seasons, eq(ageGroups.seasonId, seasons.id))
    .where(eq(series.id, serieId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTeamsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(teams).where(inArray(teams.id, ids));
}
