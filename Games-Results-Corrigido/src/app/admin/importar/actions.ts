"use server";

import { db } from "@/db";
import { associations, seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FpfBlockedError, fetchFpf, paths } from "@/lib/fpf/client";
import {
  fetchCompetitions,
  importCompetitionById,
  importCompetitionPage,
  log,
  syncAllLinked,
} from "@/lib/fpf/importer";
import { parseCompetitionPage, parseCompetitionsList } from "@/lib/fpf/parser";

export type ImportState =
  | { kind: "idle" }
  | { kind: "error"; message: string; blocked?: boolean; url?: string }
  | {
      kind: "competitions";
      associationName: string | null;
      seasons: Array<{ seasonId: number; name: string }>;
      competitions: Array<{ competitionId: number; name: string; category: string }>;
    }
  | { kind: "imported"; summary: string[] }
  | { kind: "synced"; results: Array<{ group: string; ok: boolean; message: string }> };

function num(fd: FormData, k: string) {
  const v = Number(fd.get(k));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

async function readUpload(fd: FormData, fileKey: string, textKey: string) {
  const f = fd.get(fileKey);
  if (f && typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0) {
    const buf = Buffer.from(await (f as File).arrayBuffer());
    // tenta utf-8, cai para latin1 se houver caracteres inválidos
    const utf = buf.toString("utf8");
    return utf.includes("\uFFFD") ? buf.toString("latin1") : utf;
  }
  return str(fd, textKey);
}

function errState(e: unknown): ImportState {
  if (e instanceof FpfBlockedError) return { kind: "error", message: e.message, blocked: true };
  return { kind: "error", message: e instanceof Error ? e.message : String(e) };
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/importar");
}

/** Guarda os ids da FPF (associação / época) */
export async function saveFpfIds(fd: FormData) {
  const seasonId = num(fd, "seasonId");
  const associationId = num(fd, "associationId");
  const fpfSeasonId = num(fd, "fpfSeasonId");
  const fpfAssociationId = num(fd, "fpfAssociationId");
  if (seasonId && fpfSeasonId) await db.update(seasons).set({ fpfSeasonId }).where(eq(seasons.id, seasonId));
  if (associationId && fpfAssociationId)
    await db.update(associations).set({ fpfAssociationId }).where(eq(associations.id, associationId));
  revalidate();
  redirect(str(fd, "returnTo") || "/admin/importar");
}

/** 1) Lista as competições da associação (automático) */
export async function listCompetitions(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const fpfAssociationId = num(fd, "fpfAssociationId");
  const fpfSeasonId = num(fd, "fpfSeasonId");
  if (!fpfAssociationId || !fpfSeasonId) return { kind: "error", message: "Indique o id FPF da associação e da época." };
  try {
    const r = await fetchCompetitions(fpfAssociationId, fpfSeasonId);
    if (!r.competitions.length)
      return {
        kind: "error",
        message:
          "A FPF respondeu mas não foram encontradas competições. Verifique o seasonId (pode não ser o da época 2026-2027) ou use a importação por HTML.",
      };
    return { kind: "competitions", associationName: r.associationName, seasons: r.seasons, competitions: r.competitions };
  } catch (e) {
    await log("fpf:list", "error", e instanceof Error ? e.message : String(e));
    return errState(e);
  }
}

/** 1b) Lista as competições a partir de HTML colado/enviado */
export async function listCompetitionsFromHtml(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const html = await readUpload(fd, "file", "html");
  if (!html || html.length < 100) return { kind: "error", message: "Cole o HTML da página ou envie o ficheiro .html." };
  const r = parseCompetitionsList(html);
  if (!r.competitions.length)
    return { kind: "error", message: "Não encontrei ligações com competitionId neste HTML. Confirme que é a página 'Competições da A.F. …'." };
  return { kind: "competitions", associationName: r.associationName, seasons: r.seasons, competitions: r.competitions };
}

/** 2) Importa as competições selecionadas (automático) */
export async function importSelected(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const seasonId = num(fd, "seasonId");
  const associationId = num(fd, "associationId");
  const fpfSeasonId = num(fd, "fpfSeasonId");
  const allRounds = fd.get("allRounds") === "on";
  const picked = fd.getAll("competition").map(String);
  if (!seasonId || !associationId || !fpfSeasonId) return { kind: "error", message: "Seleção inválida." };
  if (!picked.length) return { kind: "error", message: "Selecione pelo menos uma competição." };

  const summary: string[] = [];
  for (const p of picked) {
    const [id, category, ...nameParts] = p.split("|");
    const name = nameParts.join("|");
    try {
      const r = await importCompetitionById({
        seasonId,
        associationId,
        fpfSeasonId,
        fpfCompetitionId: Number(id),
        competitionName: name,
        category,
        allRounds,
      });
      summary.push(
        `✓ ${r.ageGroupName}: ${r.series.length} série(s), ${r.series.reduce((a, s) => a + s.teams, 0)} equipas, ${r.series.reduce((a, s) => a + s.matches, 0)} jogos`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log(`fpf:competition:${id}`, "error", msg);
      summary.push(`✗ ${name}: ${msg}`);
      if (e instanceof FpfBlockedError) break;
    }
  }
  revalidate();
  return { kind: "imported", summary };
}

/** 2b) Importa uma competição a partir do HTML da página Details */
export async function importCompetitionFromHtml(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const seasonId = num(fd, "seasonId");
  const associationId = num(fd, "associationId");
  if (!seasonId || !associationId) return { kind: "error", message: "Selecione a época e a associação." };
  const html = await readUpload(fd, "file", "html");
  if (!html || html.length < 100) return { kind: "error", message: "Cole o HTML da página da competição ou envie o ficheiro." };

  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  const page = parseCompetitionPage(html, season?.startYear);
  if (!page.series.length)
    return { kind: "error", message: "Não encontrei séries/classificações/jogos neste HTML. Confirme que é a página 'Competition/Details' da FPF." };

  const competitionName = str(fd, "competitionName") || page.title;
  const category = str(fd, "category");
  const fromHtml = Number((html.match(/competitionId\W{0,3}(\d{3,})/i) || [])[1]);
  const fpfCompetitionId = num(fd, "fpfCompetitionId") ?? (Number.isFinite(fromHtml) && fromHtml > 0 ? fromHtml : null);

  try {
    const r = await importCompetitionPage({ seasonId, associationId, fpfCompetitionId, competitionName, category, page });
    await log(`html:competition:${fpfCompetitionId ?? "?"}`, "ok", `${r.ageGroupName}: ${r.series.length} séries`);
    revalidate();
    return {
      kind: "imported",
      summary: [
        `✓ ${r.ageGroupName}`,
        ...r.series.map((s) => `   • ${s.phase} / ${s.name}: ${s.teams} equipas, ${s.standings} linhas de classificação, ${s.matches} jogos`),
      ],
    };
  } catch (e) {
    return errState(e);
  }
}

/** 3) Sincronizar tudo o que está ligado à FPF */
export async function syncAll(_prev: ImportState): Promise<ImportState> {
  try {
    const results = await syncAllLinked();
    revalidate();
    return { kind: "synced", results };
  } catch (e) {
    return errState(e);
  }
}

/** Teste de ligação à FPF */
export async function testConnection(_prev: ImportState): Promise<ImportState> {
  try {
    const html = await fetchFpf(paths.home());
    return { kind: "imported", summary: [`✓ Ligação OK (${html.length.toLocaleString("pt-PT")} bytes recebidos de resultados.fpf.pt)`] };
  } catch (e) {
    return errState(e);
  }
}
