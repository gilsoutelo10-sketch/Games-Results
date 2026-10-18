import {
  getAgeGroups,
  getAssociations,
  getPhases,
  getSeasons,
  getSeries,
} from "@/lib/queries";
import { seedIfEmpty } from "@/lib/seed";

export type SearchParams = Record<string, string | string[] | undefined>;

function toId(v: string | string[] | undefined) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function resolveSelection(sp: SearchParams) {
  await seedIfEmpty();

  const seasonList = await getSeasons();
  const assocList = await getAssociations();

  const current = seasonList.find((s) => s.isCurrent) ?? seasonList[0];
  const season = toId(sp.season) ?? current?.id;
  const assoc = toId(sp.assoc);

  const groupList = season && assoc ? await getAgeGroups(season, assoc) : [];
  const group = toId(sp.group);
  const groupValid =
    (groupList.some((g) => g.id === group) ? group : undefined) ?? groupList[0]?.id;

  const phaseList = groupValid ? await getPhases(groupValid) : [];
  const phase = toId(sp.phase);
  const phaseValid =
    (phaseList.some((p) => p.id === phase) ? phase : undefined) ?? phaseList[0]?.id;

  const serieList = phaseValid ? await getSeries(phaseValid) : [];
  const serie = toId(sp.serie);
  const serieValid =
    (serieList.some((s) => s.id === serie) ? serie : undefined) ?? serieList[0]?.id;

  return {
    lists: {
      seasons: seasonList,
      associations: assocList,
      ageGroups: groupList,
      phases: phaseList,
      series: serieList,
    },
    selected: {
      season,
      assoc,
      group: groupValid,
      phase: phaseValid,
      serie: serieValid,
    },
  };
}

export function buildQuery(sel: Record<string, number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sel)) if (v) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
