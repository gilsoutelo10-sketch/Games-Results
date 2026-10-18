"use client";

import { useActionState } from "react";
import {
  importCompetitionFromHtml,
  importSelected,
  listCompetitions,
  listCompetitionsFromHtml,
  syncAll,
  testConnection,
  type ImportState,
} from "./actions";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const btn =
  "rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-600 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

type Props = {
  seasonId: number;
  associationId: number;
  fpfSeasonId: number;
  fpfAssociationId: number;
  listUrl: string;
};

function Status({ state }: { state: ImportState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "error")
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-medium">{state.blocked ? "Acesso bloqueado pela FPF" : "Erro"}</p>
        <p className="mt-1 whitespace-pre-wrap">{state.message}</p>
      </div>
    );
  if (state.kind === "imported")
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        {state.summary.map((l, i) => (
          <p key={i} className="whitespace-pre-wrap font-mono text-xs">
            {l}
          </p>
        ))}
      </div>
    );
  if (state.kind === "synced")
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        {state.results.length === 0 && <p className="text-slate-500">Nada ligado à FPF ainda. Importe primeiro uma competição.</p>}
        {state.results.map((r, i) => (
          <p key={i} className={r.ok ? "text-emerald-800" : "text-red-700"}>
            {r.ok ? "✓" : "✗"} {r.group}: {r.message}
          </p>
        ))}
      </div>
    );
  return null;
}

export default function ImportWizard(p: Props) {
  const [listState, listAction, listPending] = useActionState(listCompetitions, { kind: "idle" } as ImportState);
  const [listHtmlState, listHtmlAction, listHtmlPending] = useActionState(listCompetitionsFromHtml, { kind: "idle" } as ImportState);
  const [importState, importAction, importPending] = useActionState(importSelected, { kind: "idle" } as ImportState);
  const [htmlState, htmlAction, htmlPending] = useActionState(importCompetitionFromHtml, { kind: "idle" } as ImportState);
  const [syncState, syncAction, syncPending] = useActionState(syncAll, { kind: "idle" } as ImportState);
  const [testState, testAction, testPending] = useActionState(testConnection, { kind: "idle" } as ImportState);

  const comps =
    listState.kind === "competitions" ? listState : listHtmlState.kind === "competitions" ? listHtmlState : null;

  const grouped = comps
    ? comps.competitions.reduce<Record<string, typeof comps.competitions>>((acc, c) => {
        (acc[c.category || "Outras"] ||= []).push(c);
        return acc;
      }, {})
    : null;

  return (
    <div className="space-y-6">
      {/* Passo 1 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-900">1. Listar competições da associação</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Fonte:{" "}
          <a className="text-emerald-700 underline" href={p.listUrl} target="_blank" rel="noreferrer">
            {p.listUrl}
          </a>
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form action={listAction} className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Automático</p>
            <input type="hidden" name="fpfAssociationId" value={p.fpfAssociationId} />
            <input type="hidden" name="fpfSeasonId" value={p.fpfSeasonId} />
            <div className="mt-3 flex gap-2">
              <button className={btn} disabled={listPending}>
                {listPending ? "A ler a FPF…" : "Obter competições"}
              </button>
              <button formAction={testAction} className={btnGhost} disabled={testPending}>
                {testPending ? "…" : "Testar ligação"}
              </button>
            </div>
            <Status state={listState} />
            <Status state={testState} />
          </form>

          <form action={listHtmlAction} className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">A partir do HTML (se a FPF bloquear)</p>
            <p className="mt-1 text-xs text-slate-500">
              Abra o link acima no browser, guarde a página (Ctrl+S, &quot;apenas HTML&quot;) e envie-a aqui, ou cole o código-fonte.
            </p>
            <input type="file" name="file" accept=".html,.htm,text/html" className="mt-3 block w-full text-xs" />
            <textarea name="html" rows={3} placeholder="…ou cole aqui o HTML" className={`${input} mt-2 w-full font-mono text-xs`} />
            <button className={`${btnGhost} mt-2`} disabled={listHtmlPending}>
              {listHtmlPending ? "A ler…" : "Ler competições do HTML"}
            </button>
            <Status state={listHtmlState} />
          </form>
        </div>
      </section>

      {/* Passo 2 */}
      {comps && grouped && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            2. Escolher competições a importar {comps.associationName && <span className="font-normal text-slate-500">— {comps.associationName}</span>}
          </h2>
          {comps.seasons.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Épocas detetadas na FPF: {comps.seasons.map((s) => `${s.name} (id ${s.seasonId})`).join(", ")}
            </p>
          )}
          <form action={importAction} className="mt-4">
            <input type="hidden" name="seasonId" value={p.seasonId} />
            <input type="hidden" name="associationId" value={p.associationId} />
            <input type="hidden" name="fpfSeasonId" value={p.fpfSeasonId} />
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(grouped).map(([cat, list]) => (
                <fieldset key={cat} className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</legend>
                  {list.map((c) => (
                    <label key={c.competitionId} className="flex items-start gap-2 py-1 text-sm">
                      <input type="checkbox" name="competition" value={`${c.competitionId}|${c.category}|${c.name}`} className="mt-1" />
                      <span>
                        {c.name} <span className="text-xs text-slate-400">#{c.competitionId}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allRounds" defaultChecked /> Ler todas as jornadas (mais lento)
              </label>
              <button className={btn} disabled={importPending}>
                {importPending ? "A importar…" : "Importar selecionadas"}
              </button>
            </div>
            <Status state={importState} />
          </form>
        </section>
      )}

      {/* HTML de uma competição */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Importar uma competição a partir do HTML</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Para quando a FPF bloqueia o acesso automático. Abra a página da competição
          (<code>resultados.fpf.pt/Competition/Details?competitionId=…&amp;seasonId=…</code>), guarde-a e envie aqui. Lê fases, séries,
          classificação oficial e jogos.
        </p>
        <form action={htmlAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_8rem]">
          <input type="hidden" name="seasonId" value={p.seasonId} />
          <input type="hidden" name="associationId" value={p.associationId} />
          <input name="competitionName" placeholder="Nome da competição (opcional)" className={input} />
          <select name="category" className={input} defaultValue="">
            <option value="">Escalão (auto)</option>
            {["Seniores", "Juniores", "Juvenis", "Iniciados", "Infantis", "Benjamins", "Traquinas", "Petizes", "Veteranos", "Feminino"].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input name="fpfCompetitionId" type="number" placeholder="competitionId" className={input} />
          <input type="file" name="file" accept=".html,.htm,text/html" className="text-xs sm:col-span-3" />
          <textarea name="html" rows={4} placeholder="…ou cole aqui o HTML" className={`${input} font-mono text-xs sm:col-span-3`} />
          <div className="sm:col-span-3">
            <button className={btn} disabled={htmlPending}>
              {htmlPending ? "A importar…" : "Importar do HTML"}
            </button>
          </div>
        </form>
        <Status state={htmlState} />
      </section>

      {/* Sincronizar */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-900">3. Atualizar resultados</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Volta a ler na FPF todas as competições já importadas (resultados novos e classificação). Também pode ser chamado por um
          agendador externo via <code>POST /api/sync</code>.
        </p>
        <form action={syncAction} className="mt-3">
          <button className={btn} disabled={syncPending}>
            {syncPending ? "A sincronizar…" : "Sincronizar agora"}
          </button>
        </form>
        <Status state={syncState} />
      </section>
    </div>
  );
}
