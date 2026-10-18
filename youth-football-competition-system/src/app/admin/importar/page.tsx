import Link from "next/link";
import { db } from "@/db";
import { importLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { fpfUrl, guessFpfSeasonId, paths } from "@/lib/fpf/client";
import { buildQuery, resolveSelection, type SearchParams } from "@/lib/selection";
import ImportWizard from "./ImportWizard";
import { saveFpfIds } from "./actions";

export const dynamic = "force-dynamic";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { lists, selected } = await resolveSelection(sp);
  const season = lists.seasons.find((s) => s.id === selected.season);
  const assoc = lists.associations.find((a) => a.id === selected.assoc);
  const returnTo = `/admin/importar${buildQuery({ season: selected.season, assoc: selected.assoc })}`;

  const logs = await db.select().from(importLogs).orderBy(desc(importLogs.createdAt)).limit(12);

  const fpfSeasonId = season?.fpfSeasonId ?? (season ? guessFpfSeasonId(season.startYear) : 105);
  const fpfAssociationId = assoc?.fpfAssociationId ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">Importação</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Dados oficiais da FPF</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lê competições, séries, classificações e resultados do <strong>resultados.fpf.pt</strong>, o portal oficial que
            agrega todas as associações distritais.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${buildQuery(selected)}`} className={btnGhost}>
            ← Classificações
          </Link>
          <Link href={`/admin${buildQuery(selected)}`} className={btnGhost}>
            Gerir dados
          </Link>
        </div>
      </header>

      {/* Seleção época/associação + ids FPF */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Época e associação</h2>
        <form method="get" className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Época</span>
            <select name="season" defaultValue={selected.season ?? ""} className={`${input} w-full`}>
              {lists.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Associação</span>
            <select name="assoc" defaultValue={selected.assoc ?? ""} className={`${input} w-full`}>
              <option value="">— Selecionar —</option>
              {lists.associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button className={btnGhost}>Aplicar</button>
          </div>
        </form>

        {season && assoc && (
          <form action={saveFpfIds} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="seasonId" value={season.id} />
            <input type="hidden" name="associationId" value={assoc.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">
                seasonId FPF para {season.name} {!season.fpfSeasonId && <em className="text-amber-600">(estimado)</em>}
              </span>
              <input name="fpfSeasonId" type="number" defaultValue={fpfSeasonId} className={`${input} w-full`} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">associationId FPF de {assoc.shortName}</span>
              <input name="fpfAssociationId" type="number" defaultValue={fpfAssociationId ?? ""} className={`${input} w-full`} />
            </label>
            <div className="self-end">
              <button className={btnGhost}>Guardar ids</button>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-3">
              Os ids podem ser confirmados no endereço da página da associação em resultados.fpf.pt (ex.:{" "}
              <code>…?associationId=222&amp;seasonId=104</code> é a AF Coimbra na época 2025/26). Se a lista vier vazia,
              experimente o seasonId seguinte/anterior.
            </p>
          </form>
        )}
      </section>

      <div className="mt-6">
        {season && assoc && fpfAssociationId ? (
          <ImportWizard
            seasonId={season.id}
            associationId={assoc.id}
            fpfSeasonId={fpfSeasonId}
            fpfAssociationId={fpfAssociationId}
            listUrl={fpfUrl(paths.competitionsByAssociation(fpfAssociationId, fpfSeasonId))}
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-600">
            Selecione a associação (e confirme o associationId da FPF) para começar.
          </p>
        )}
      </div>

      {logs.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Últimas importações</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-3 py-1.5">
                <span className="w-32 shrink-0 text-slate-400">{l.createdAt.toLocaleString("pt-PT")}</span>
                <span className={`w-10 shrink-0 font-semibold ${l.status === "ok" ? "text-emerald-700" : "text-red-600"}`}>
                  {l.status}
                </span>
                <span className="text-slate-700">
                  <span className="text-slate-400">{l.source}</span> — {l.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
