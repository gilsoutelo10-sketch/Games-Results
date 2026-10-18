import Link from "next/link";
import Selectors from "@/components/Selectors";
import {
  getSerieMatches,
  getSerieTeams,
  getTeamsByAssociation,
} from "@/lib/queries";
import { buildQuery, resolveSelection, type SearchParams } from "@/lib/selection";
import {
  addTeamToSerie,
  createAgeGroup,
  createAssociation,
  createMatch,
  createPhase,
  createSeason,
  createSerie,
  createTeam,
  deleteMatch,
  removeTeamFromSerie,
  setCurrentSeason,
  updateResult,
} from "./actions";

export const dynamic = "force-dynamic";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const btn =
  "rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-600 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

function Card({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { lists, selected } = await resolveSelection(sp);
  const returnTo = `/admin${buildQuery(selected)}`;

  const assocTeams = selected.assoc ? await getTeamsByAssociation(selected.assoc) : [];
  const [serieTeamList, serieMatches] = selected.serie
    ? await Promise.all([getSerieTeams(selected.serie), getSerieMatches(selected.serie)])
    : [[], []];
  const enrolledIds = new Set(serieTeamList.map((t) => t.id));
  const availableTeams = assocTeams.filter((t) => !enrolledIds.has(t.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
            Administração
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Alimentar dados</h1>
          <p className="mt-1 text-sm text-slate-600">
            Selecione o nível pretendido e adicione escalões, fases, séries, equipas e resultados.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${buildQuery(selected)}`} className={btnGhost}>
            ← Ver classificações
          </Link>
          <Link href={`/admin/importar${buildQuery(selected)}`} className={btn}>
            Importar da FPF
          </Link>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <Selectors
          seasons={lists.seasons}
          associations={lists.associations.map((a) => ({ id: a.id, name: a.name }))}
          ageGroups={lists.ageGroups}
          phases={lists.phases}
          series={lists.series}
          selected={selected}
        />
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Épocas */}
        <Card title="Épocas" hint="A época atual é selecionada por omissão na página pública.">
          <ul className="mb-4 flex flex-wrap gap-2">
            {lists.seasons.map((s) => (
              <li key={s.id}>
                <form action={setCurrentSeason}>
                  <input type="hidden" name="seasonId" value={s.id} />
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                      s.isCurrent
                        ? "bg-emerald-700 text-white ring-emerald-700"
                        : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                    }`}
                    title={s.isCurrent ? "Época atual" : "Definir como atual"}
                  >
                    {s.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={createSeason} className="flex flex-wrap gap-2">
            <input name="name" placeholder="ex.: 2027-2028" required className={input} />
            <input name="startYear" type="number" placeholder="2027" className={`${input} w-24`} />
            <button className={btn}>Adicionar época</button>
          </form>
        </Card>

        {/* Associações */}
        <Card title="Associações">
          <form action={createAssociation} className="flex flex-wrap gap-2">
            <input name="name" placeholder="Nome completo" required className={`${input} flex-1`} />
            <input name="shortName" placeholder="Sigla (AF ...)" className={`${input} w-32`} />
            <button className={btn}>Adicionar</button>
          </form>
        </Card>

        {/* Escalões */}
        <Card
          title="Escalões"
          hint={
            selected.assoc
              ? `Para ${lists.associations.find((a) => a.id === selected.assoc)?.shortName} na época ${
                  lists.seasons.find((s) => s.id === selected.season)?.name
                }`
              : "Selecione uma associação acima."
          }
        >
          {selected.assoc && selected.season ? (
            <form action={createAgeGroup} className="flex flex-wrap gap-2">
              <input type="hidden" name="seasonId" value={selected.season} />
              <input type="hidden" name="associationId" value={selected.assoc} />
              <input name="name" placeholder="ex.: Seniores" required className={`${input} flex-1`} />
              <input name="sortOrder" type="number" placeholder="Ordem" className={`${input} w-24`} />
              <button className={btn}>Adicionar escalão</button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Card>

        {/* Fases */}
        <Card
          title="Fases"
          hint={selected.group ? `No escalão ${lists.ageGroups.find((g) => g.id === selected.group)?.name}` : "Selecione um escalão acima."}
        >
          {selected.group ? (
            <form action={createPhase} className="flex flex-wrap gap-2">
              <input type="hidden" name="ageGroupId" value={selected.group} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input name="name" placeholder="ex.: 1ª Fase" required className={`${input} flex-1`} />
              <input name="sortOrder" type="number" placeholder="Ordem" className={`${input} w-24`} />
              <button className={btn}>Adicionar fase</button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Card>

        {/* Séries */}
        <Card
          title="Séries"
          hint={selected.phase ? `Na fase ${lists.phases.find((p) => p.id === selected.phase)?.name}` : "Selecione uma fase acima."}
        >
          {selected.phase ? (
            <form action={createSerie} className="flex flex-wrap gap-2">
              <input type="hidden" name="phaseId" value={selected.phase} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input name="name" placeholder="ex.: Série A" required className={`${input} flex-1`} />
              <input name="sortOrder" type="number" placeholder="Ordem" className={`${input} w-24`} />
              <button className={btn}>Adicionar série</button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Card>

        {/* Equipas */}
        <Card
          title="Equipas da associação"
          hint={selected.assoc ? `${assocTeams.length} equipa(s) registadas` : "Selecione uma associação acima."}
        >
          {selected.assoc ? (
            <form action={createTeam} className="flex flex-wrap gap-2">
              <input type="hidden" name="associationId" value={selected.assoc} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input name="name" placeholder="Nome da equipa" required className={`${input} flex-1`} />
              <button className={btn}>Adicionar equipa</button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Card>
      </div>

      {selected.serie && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* Inscrição de equipas na série */}
          <Card title="Equipas inscritas na série">
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {serieTeamList.length === 0 && <li className="py-2 text-slate-400">Nenhuma equipa.</li>}
              {serieTeamList.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-1.5">
                  <span>{t.name}</span>
                  <form action={removeTeamFromSerie}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="serieTeamId" value={t.serieTeamId} />
                    <button className="text-xs text-red-600 hover:underline">remover</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addTeamToSerie} className="flex gap-2">
              <input type="hidden" name="serieId" value={selected.serie} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select name="teamId" required className={`${input} flex-1`} defaultValue="">
                <option value="" disabled>
                  Escolher equipa…
                </option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className={btn} disabled={availableTeams.length === 0}>
                Inscrever
              </button>
            </form>
          </Card>

          {/* Jogos e resultados */}
          <Card title="Jogos e resultados">
            <form
              action={createMatch}
              className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[4rem_1fr_3.5rem_3.5rem_1fr_8rem_auto]"
            >
              <input type="hidden" name="serieId" value={selected.serie} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input name="round" type="number" min={1} placeholder="Jorn." className={input} />
              <select name="homeTeamId" required className={input} defaultValue="">
                <option value="" disabled>
                  Casa
                </option>
                {serieTeamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input name="homeGoals" type="number" min={0} placeholder="G" className={input} />
              <input name="awayGoals" type="number" min={0} placeholder="G" className={input} />
              <select name="awayTeamId" required className={input} defaultValue="">
                <option value="" disabled>
                  Fora
                </option>
                {serieTeamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input name="matchDate" type="date" className={input} />
              <button className={btn}>Adicionar jogo</button>
            </form>

            {serieMatches.length === 0 ? (
              <p className="text-sm text-slate-400">Ainda não há jogos nesta série.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1 text-left">J</th>
                      <th className="px-2 py-1 text-right">Casa</th>
                      <th className="px-2 py-1 text-center">Resultado</th>
                      <th className="px-2 py-1 text-left">Fora</th>
                      <th className="px-2 py-1 text-left">Data</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serieMatches.map((m) => (
                      <tr key={m.id}>
                        <td className="px-2 py-1.5 text-slate-500">{m.round}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{m.homeTeam}</td>
                        <td className="px-2 py-1.5">
                          <form
                            action={updateResult}
                            id={`res-${m.id}`}
                            className="flex items-center justify-center gap-1"
                          >
                            <input type="hidden" name="matchId" value={m.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input
                              name="homeGoals"
                              type="number"
                              min={0}
                              defaultValue={m.homeGoals ?? ""}
                              className={`${input} w-14 px-1 text-center`}
                            />
                            <span className="text-slate-400">-</span>
                            <input
                              name="awayGoals"
                              type="number"
                              min={0}
                              defaultValue={m.awayGoals ?? ""}
                              className={`${input} w-14 px-1 text-center`}
                            />
                          </form>
                        </td>
                        <td className="px-2 py-1.5 font-medium">{m.awayTeam}</td>
                        <td className="px-2 py-1.5">
                          <input
                            form={`res-${m.id}`}
                            name="matchDate"
                            type="date"
                            defaultValue={m.matchDate ?? ""}
                            className={`${input} px-2 py-1`}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex gap-1">
                            <button form={`res-${m.id}`} className={`${btn} px-2 py-1`}>
                              Guardar
                            </button>
                            <form action={deleteMatch}>
                              <input type="hidden" name="matchId" value={m.id} />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <button
                                className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                title="Apagar jogo"
                              >
                                ✕
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
