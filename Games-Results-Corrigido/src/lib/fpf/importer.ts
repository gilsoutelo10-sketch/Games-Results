import { db } from "@/db";
import {
  ageGroups,
  associations,
  importLogs,
  matches,
  officialStandings,
  phases,
  serieTeams,
  series,
  seasons,
  teams,
} from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { fetchFpf, paths } from "./client";
import {
  parseCompetitionPage,
  parseCompetitionsList,
  parseFixturePage,
  type FpfCompetitionPage,
  type FpfMatch,
  type FpfSerie,
  type FpfStandingRow,
} from "./parser";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Escalão "humano" a partir do nome da categoria/competição da FPF */
export function categoryToEscalao(category: string, competitionName: string): string {
  const t = norm(`${category} ${competitionName}`);
  if (/senior/.test(t)) return "Seniores";
  if (/junior a|juniores a|sub ?19|sub ?18|juniores\b(?! [b-e])/.test(t)) return "Juniores";
  if (/junior b|juniores b|juvenil|juvenis|sub ?17|sub ?16/.test(t)) return "Juvenis";
  if (/junior c|juniores c|iniciad|sub ?15|sub ?14/.test(t)) return "Iniciados";
  if (/junior d|juniores d|infanti|sub ?13|sub ?12/.test(t)) return "Infantis";
  if (/junior e|juniores e|benjamin|sub ?11|sub ?10/.test(t)) return "Benjamins";
  if (/traquina|sub ?9|sub ?8/.test(t)) return "Traquinas";
  if (/petiz|sub ?7|sub ?6/.test(t)) return "Petizes";
  if (/veteran|master/.test(t)) return "Veteranos";
  if (/femin/.test(t)) return "Feminino";
  return category ? category.replace(/\(.*\)/, "").trim() || "Outros" : "Outros";
}

export async function log(source: string, status: "ok" | "error", message: string) {
  await db.insert(importLogs).values({ source, status, message: message.slice(0, 2000) });
}

async function ensureTeam(associationId: number, name: string, cache: Map<string, number>) {
  const key = norm(name);
  const hit = cache.get(key);
  if (hit) return hit;
  const existing = await db.select().from(teams).where(eq(teams.associationId, associationId));
  for (const t of existing) cache.set(norm(t.name), t.id);
  if (cache.has(key)) return cache.get(key)!;
  const [t] = await db.insert(teams).values({ associationId, name }).returning();
  cache.set(key, t.id);
  return t.id;
}

export type ImportResult = {
  ageGroupId: number;
  ageGroupName: string;
  series: Array<{ serieId: number; name: string; phase: string; teams: number; matches: number; standings: number }>;
};

/**
 * Importa uma página de competição da FPF (já lida) para a base de dados.
 * - ageGroup = competição (ex.: "Seniores · Divisão de Honra")
 * - phase/serie conforme a página
 */
export async function importCompetitionPage(opts: {
  seasonId: number;
  associationId: number;
  fpfCompetitionId: number | null;
  competitionName: string;
  category: string;
  page: FpfCompetitionPage;
}): Promise<ImportResult> {
  const { seasonId, associationId, page } = opts;
  const escalao = categoryToEscalao(opts.category, opts.competitionName);
  const compName = (opts.competitionName || page.title || "Competição").trim();
  const groupName = norm(compName).includes(norm(escalao)) ? compName : `${escalao} · ${compName}`;

  // age group (por fpfCompetitionId se existir, senão por nome)
  let group =
    opts.fpfCompetitionId != null
      ? (
          await db
            .select()
            .from(ageGroups)
            .where(
              and(
                eq(ageGroups.seasonId, seasonId),
                eq(ageGroups.associationId, associationId),
                eq(ageGroups.fpfCompetitionId, opts.fpfCompetitionId),
              ),
            )
        )[0]
      : undefined;
  if (!group) {
    [group] = await db
      .insert(ageGroups)
      .values({
        seasonId,
        associationId,
        name: groupName,
        fpfCompetitionId: opts.fpfCompetitionId,
        sortOrder: escalaoOrder(escalao),
      })
      .onConflictDoUpdate({
        target: [ageGroups.seasonId, ageGroups.associationId, ageGroups.name],
        set: { fpfCompetitionId: opts.fpfCompetitionId },
      })
      .returning();
  }

  const teamCache = new Map<string, number>();
  const result: ImportResult = { ageGroupId: group.id, ageGroupName: group.name, series: [] };

  for (let i = 0; i < page.series.length; i++) {
    const s = page.series[i];
    const [phase] = await db
      .insert(phases)
      .values({ ageGroupId: group.id, name: s.phase, sortOrder: i })
      .onConflictDoUpdate({ target: [phases.ageGroupId, phases.name], set: { name: s.phase } })
      .returning();
    const [serie] = await db
      .insert(series)
      .values({
        phaseId: phase.id,
        name: s.name,
        sortOrder: i,
        fpfSerieId: s.serieId,
        fpfFixtureIds: s.fixtureIds.length ? s.fixtureIds.join(",") : null,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [series.phaseId, series.name],
        set: {
          fpfSerieId: s.serieId,
          fpfFixtureIds: s.fixtureIds.length ? s.fixtureIds.join(",") : undefined,
          lastSyncedAt: new Date(),
        },
      })
      .returning();

    const r = await applySerieData(serie.id, associationId, s.standings, s.matches, teamCache);
    result.series.push({ serieId: serie.id, name: s.name, phase: s.phase, ...r });
  }
  return result;
}

function escalaoOrder(e: string) {
  const order = ["Seniores", "Juniores", "Juvenis", "Iniciados", "Infantis", "Benjamins", "Traquinas", "Petizes", "Veteranos", "Feminino"];
  const i = order.indexOf(e);
  return i < 0 ? 50 : i;
}

export async function applySerieData(
  serieId: number,
  associationId: number,
  standings: FpfStandingRow[],
  matchList: FpfMatch[],
  teamCache = new Map<string, number>(),
) {
  // equipas: da classificação e dos jogos
  const names = new Set<string>();
  standings.forEach((r) => names.add(r.team));
  matchList.forEach((m) => {
    names.add(m.home);
    names.add(m.away);
  });
  const ids = new Map<string, number>();
  for (const n of names) ids.set(norm(n), await ensureTeam(associationId, n, teamCache));

  if (ids.size) {
    await db
      .insert(serieTeams)
      .values([...ids.values()].map((teamId) => ({ serieId, teamId })))
      .onConflictDoNothing();
  }

  // classificação oficial
  if (standings.length) {
    await db.delete(officialStandings).where(eq(officialStandings.serieId, serieId));
    await db.insert(officialStandings).values(
      standings.map((r) => ({
        serieId,
        teamId: ids.get(norm(r.team))!,
        position: r.pos,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        points: r.points,
      })),
    );
  }

  // jogos
  let count = 0;
  for (const m of matchList) {
    const homeTeamId = ids.get(norm(m.home))!;
    const awayTeamId = ids.get(norm(m.away))!;
    const values = {
      serieId,
      homeTeamId,
      awayTeamId,
      round: m.round ?? 1,
      matchDate: m.date,
      matchTime: m.time,
      venue: m.venue,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      fpfMatchId: m.fpfMatchId,
    };
    if (m.fpfMatchId) {
      await db
        .insert(matches)
        .values(values)
        .onConflictDoUpdate({
          target: matches.fpfMatchId,
          set: {
            serieId,
            round: values.round,
            matchDate: values.matchDate,
            matchTime: values.matchTime,
            venue: values.venue,
            homeGoals: values.homeGoals,
            awayGoals: values.awayGoals,
          },
        });
    } else {
      const [existing] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.serieId, serieId), eq(matches.homeTeamId, homeTeamId), eq(matches.awayTeamId, awayTeamId)))
        .limit(1);
      if (existing) {
        await db.update(matches).set({ homeGoals: m.homeGoals, awayGoals: m.awayGoals, matchDate: m.date ?? undefined }).where(eq(matches.id, existing.id));
      } else {
        await db.insert(matches).values(values);
      }
    }
    count++;
  }
  return { teams: ids.size, matches: count, standings: standings.length };
}

// ───────────────── fluxos automáticos (quando a FPF não bloqueia) ─────────────────

export async function fetchCompetitions(fpfAssociationId: number, fpfSeasonId: number) {
  const html = await fetchFpf(paths.competitionsByAssociation(fpfAssociationId, fpfSeasonId));
  return parseCompetitionsList(html);
}

export async function importCompetitionById(opts: {
  seasonId: number;
  associationId: number;
  fpfSeasonId: number;
  fpfCompetitionId: number;
  competitionName?: string;
  category?: string;
  allRounds?: boolean;
}) {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, opts.seasonId));
  const html = await fetchFpf(paths.competitionDetails(opts.fpfCompetitionId, opts.fpfSeasonId));
  const page = parseCompetitionPage(html, season?.startYear);

  // Todas as jornadas: a página principal normalmente só mostra a jornada atual
  if (opts.allRounds) {
    for (const s of page.series) await fetchAllRounds(s, season?.startYear);
  }

  const res = await importCompetitionPage({
    seasonId: opts.seasonId,
    associationId: opts.associationId,
    fpfCompetitionId: opts.fpfCompetitionId,
    competitionName: opts.competitionName || page.title,
    category: opts.category || "",
    page,
  });
  await log(
    `fpf:competition:${opts.fpfCompetitionId}`,
    "ok",
    `${res.ageGroupName}: ${res.series.length} série(s), ${res.series.reduce((a, s) => a + s.matches, 0)} jogos`,
  );
  return res;
}

async function fetchAllRounds(s: FpfSerie, startYear?: number) {
  const seen = new Set(s.matches.map((m) => m.fpfMatchId).filter(Boolean));
  for (const fid of s.fixtureIds) {
    try {
      const html = await fetchFpf(paths.fixture(fid));
      const fx = parseFixturePage(html, startYear);
      for (const m of fx.matches) {
        if (m.fpfMatchId && seen.has(m.fpfMatchId)) continue;
        if (m.fpfMatchId) seen.add(m.fpfMatchId);
        s.matches.push({ ...m, round: m.round ?? fx.round });
      }
      if (fx.standings.length && !s.standings.length) s.standings = fx.standings;
    } catch {
      // jornada indisponível: segue
    }
  }
}

/** Re-sincroniza todas as séries com ligação à FPF (resultados e classificação). */
export async function syncAllLinked() {
  const rows = await db
    .select({
      serie: series,
      phase: phases,
      group: ageGroups,
      assoc: associations,
      season: seasons,
    })
    .from(series)
    .innerJoin(phases, eq(series.phaseId, phases.id))
    .innerJoin(ageGroups, eq(phases.ageGroupId, ageGroups.id))
    .innerJoin(associations, eq(ageGroups.associationId, associations.id))
    .innerJoin(seasons, eq(ageGroups.seasonId, seasons.id))
    .where(isNotNull(ageGroups.fpfCompetitionId));

  const comps = new Map<string, (typeof rows)[number]>();
  for (const r of rows) comps.set(`${r.group.id}`, r);

  const out: Array<{ group: string; ok: boolean; message: string }> = [];
  for (const r of comps.values()) {
    try {
      const fpfSeasonId = r.season.fpfSeasonId ?? 105;
      const res = await importCompetitionById({
        seasonId: r.season.id,
        associationId: r.assoc.id,
        fpfSeasonId,
        fpfCompetitionId: r.group.fpfCompetitionId!,
        competitionName: r.group.name,
        allRounds: true,
      });
      out.push({ group: r.group.name, ok: true, message: `${res.series.reduce((a, s) => a + s.matches, 0)} jogos` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log(`fpf:sync:${r.group.id}`, "error", msg);
      out.push({ group: r.group.name, ok: false, message: msg });
    }
  }
  return out;
}
