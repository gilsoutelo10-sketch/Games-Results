"use server";

import { db } from "@/db";
import {
  ageGroups,
  associations,
  matches,
  phases,
  serieTeams,
  series,
  seasons,
  teams,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}
function num(fd: FormData, key: string) {
  const v = Number(fd.get(key));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function optNum(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function createSeason(fd: FormData) {
  const name = str(fd, "name");
  const startYear = Number(str(fd, "startYear") || name.slice(0, 4));
  if (!name || !Number.isFinite(startYear)) return;
  await db.insert(seasons).values({ name, startYear }).onConflictDoNothing();
  revalidateAll();
}

export async function setCurrentSeason(fd: FormData) {
  const id = num(fd, "seasonId");
  if (!id) return;
  await db.update(seasons).set({ isCurrent: false });
  await db.update(seasons).set({ isCurrent: true }).where(eq(seasons.id, id));
  revalidateAll();
}

export async function createAssociation(fd: FormData) {
  const name = str(fd, "name");
  const shortName = str(fd, "shortName") || name;
  if (!name) return;
  await db.insert(associations).values({ name, shortName });
  revalidateAll();
}

export async function createAgeGroup(fd: FormData) {
  const seasonId = num(fd, "seasonId");
  const associationId = num(fd, "associationId");
  const name = str(fd, "name");
  if (!seasonId || !associationId || !name) return;
  await db
    .insert(ageGroups)
    .values({ seasonId, associationId, name, sortOrder: optNum(fd, "sortOrder") ?? 0 })
    .onConflictDoNothing();
  revalidateAll();
  redirect(`/admin?season=${seasonId}&assoc=${associationId}`);
}

export async function createPhase(fd: FormData) {
  const ageGroupId = num(fd, "ageGroupId");
  const name = str(fd, "name");
  if (!ageGroupId || !name) return;
  await db
    .insert(phases)
    .values({ ageGroupId, name, sortOrder: optNum(fd, "sortOrder") ?? 0 })
    .onConflictDoNothing();
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function createSerie(fd: FormData) {
  const phaseId = num(fd, "phaseId");
  const name = str(fd, "name");
  if (!phaseId || !name) return;
  await db
    .insert(series)
    .values({ phaseId, name, sortOrder: optNum(fd, "sortOrder") ?? 0 })
    .onConflictDoNothing();
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function createTeam(fd: FormData) {
  const associationId = num(fd, "associationId");
  const name = str(fd, "name");
  if (!associationId || !name) return;
  await db.insert(teams).values({ associationId, name }).onConflictDoNothing();
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function addTeamToSerie(fd: FormData) {
  const serieId = num(fd, "serieId");
  const teamId = num(fd, "teamId");
  if (!serieId || !teamId) return;
  await db.insert(serieTeams).values({ serieId, teamId }).onConflictDoNothing();
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function removeTeamFromSerie(fd: FormData) {
  const id = num(fd, "serieTeamId");
  if (!id) return;
  await db.delete(serieTeams).where(eq(serieTeams.id, id));
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function createMatch(fd: FormData) {
  const serieId = num(fd, "serieId");
  const homeTeamId = num(fd, "homeTeamId");
  const awayTeamId = num(fd, "awayTeamId");
  if (!serieId || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
  const matchDate = str(fd, "matchDate") || null;
  await db.insert(matches).values({
    serieId,
    homeTeamId,
    awayTeamId,
    round: optNum(fd, "round") ?? 1,
    matchDate,
    homeGoals: optNum(fd, "homeGoals"),
    awayGoals: optNum(fd, "awayGoals"),
  });
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function updateResult(fd: FormData) {
  const id = num(fd, "matchId");
  if (!id) return;
  await db
    .update(matches)
    .set({
      homeGoals: optNum(fd, "homeGoals"),
      awayGoals: optNum(fd, "awayGoals"),
      matchDate: str(fd, "matchDate") || null,
    })
    .where(eq(matches.id, id));
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}

export async function deleteMatch(fd: FormData) {
  const id = num(fd, "matchId");
  if (!id) return;
  await db.delete(matches).where(eq(matches.id, id));
  revalidateAll();
  redirect(str(fd, "returnTo") || "/admin");
}
