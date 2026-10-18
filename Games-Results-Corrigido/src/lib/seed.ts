import { db, ensureSchema } from "@/db";
import { associations, seasons } from "@/db/schema";
import { guessFpfSeasonId, KNOWN_FPF_ASSOCIATIONS } from "./fpf/client";

/**
 * Arranque: garante que as tabelas existem e cria a época 2026-2027 e as 22 associações distritais (com o id da FPF).
 * Escalões, fases, séries, equipas e jogos vêm da importação do resultados.fpf.pt
 * ou são introduzidos manualmente — nada é inventado.
 */
export async function seedIfEmpty() {
  await ensureSchema();

  const existing = await db.select().from(seasons).limit(1);
  if (existing.length > 0) return { seeded: false };

  await db.insert(seasons).values({
    name: "2026-2027",
    startYear: 2026,
    fpfSeasonId: guessFpfSeasonId(2026),
    isCurrent: true,
  });

  await db.insert(associations).values(
    KNOWN_FPF_ASSOCIATIONS.map((a) => ({
      name: a.name,
      shortName: a.shortName,
      fpfAssociationId: a.fpfId,
    })),
  );

  return { seeded: true };
}
