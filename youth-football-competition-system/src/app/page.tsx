import Link from "next/link";
import Selectors from "@/components/Selectors";
import { getSerieMatches, getStandings } from "@/lib/queries";
import { buildQuery, resolveSelection, type SearchParams } from "@/lib/selection";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { lists, selected } = await resolveSelection(sp);

  const serieId = selected.serie;
  const [standingsRes, matchList] = serieId
    ? await Promise.all([getStandings(serieId), getSerieMatches(serieId)])
    : [{ rows: [], official: false }, []];
  const standings = standingsRes.rows;

  const rounds = new Map<number, typeof matchList>();
  for (const m of matchList) {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round)!.push(m);
  }

  const seasonName = lists.seasons.find((s) => s.id === selected.season)?.name;
  const assocName = lists.associations.find((a) => a.id === selected.assoc)?.name;
  const groupName = lists.ageGroups.find((g) => g.id === selected.group)?.name;
  const phaseName = lists.phases.find((p) => p.id === selected.phase)?.name;
  const serieName = lists.series.find((s) => s.id === selected.serie)?.name;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
            Competições distritais
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950 sm:text-4xl">
            Época {seasonName ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Classificações e resultados por associação, escalão, fase e série.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/importar${buildQuery(selected)}`}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-600"
          >
            Importar da FPF
          </Link>
          <Link
            href={`/admin${buildQuery(selected)}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-700"
          >
            Gerir dados
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

      {!serieId ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-600">
          <p className="text-lg font-medium text-slate-800">Selecione uma série</p>
          <p className="mt-1 text-sm">
            Escolha a associação, o escalão, a fase e a série para ver a classificação e os jogos.
          </p>
          {selected.assoc && lists.ageGroups.length === 0 && (
            <p className="mt-3 text-sm">
              Esta associação ainda não tem competições nesta época.{" "}
              <Link className="text-emerald-700 underline" href={`/admin/importar${buildQuery(selected)}`}>
                Importar do resultados.fpf.pt
              </Link>
            </p>
          )}
        </section>
      ) : (
        <>
          <nav className="mt-8 flex flex-wrap items-center gap-1 text-sm text-slate-500">
            <span>{assocName}</span>
            <span>›</span>
            <span>{groupName}</span>
            <span>›</span>
            <span>{phaseName}</span>
            <span>›</span>
            <span className="font-semibold text-slate-900">{serieName}</span>
          </nav>

          <div className="mt-4 grid gap-8 lg:grid-cols-[3fr_2fr]">
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <h2 className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">
                Classificação
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    standingsRes.official ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {standingsRes.official ? "Oficial FPF" : "Calculada"}
                </span>
              </h2>
              {standings.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  Ainda não há equipas inscritas nesta série.{" "}
                  <Link className="text-emerald-700 underline" href={`/admin${buildQuery(selected)}`}>
                    Inscrever equipas e lançar jogos
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Equipa</th>
                        <th className="px-2 py-2 text-center">J</th>
                        <th className="px-2 py-2 text-center">V</th>
                        <th className="px-2 py-2 text-center">E</th>
                        <th className="px-2 py-2 text-center">D</th>
                        <th className="px-2 py-2 text-center">GM</th>
                        <th className="px-2 py-2 text-center">GS</th>
                        <th className="px-2 py-2 text-center">DG</th>
                        <th className="px-3 py-2 text-center font-bold">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((r, i) => (
                        <tr
                          key={r.teamId}
                          className={`border-t border-slate-100 ${i === 0 ? "bg-emerald-50/60" : ""}`}
                        >
                          <td className="px-3 py-2 font-medium text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {r.team}
                            {r.penalty > 0 && (
                              <span className="ml-1 text-xs text-red-600">(-{r.penalty})</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">{r.played}</td>
                          <td className="px-2 py-2 text-center">{r.wins}</td>
                          <td className="px-2 py-2 text-center">{r.draws}</td>
                          <td className="px-2 py-2 text-center">{r.losses}</td>
                          <td className="px-2 py-2 text-center">{r.goalsFor}</td>
                          <td className="px-2 py-2 text-center">{r.goalsAgainst}</td>
                          <td className="px-2 py-2 text-center">
                            {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-900">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <h2 className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">
                Jogos
              </h2>
              {matchList.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">Ainda não há jogos registados.</p>
              ) : (
                <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                  {[...rounds.entries()].map(([round, ms]) => (
                    <div key={round} className="px-5 py-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Jornada {round}
                        <span className="ml-2 font-normal normal-case tracking-normal">
                          {fmtDate(ms[0]?.matchDate ?? null)}
                        </span>
                      </h3>
                      <ul className="space-y-1.5">
                        {ms.map((m) => {
                          const played = m.homeGoals !== null && m.awayGoals !== null;
                          return (
                            <li
                              key={m.id}
                              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm"
                            >
                              <span className="truncate text-right">{m.homeTeam}</span>
                              <span
                                className={`min-w-[3.5rem] rounded px-2 py-0.5 text-center font-semibold tabular-nums ${
                                  played ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
                                }`}
                              >
                                {played ? `${m.homeGoals} - ${m.awayGoals}` : "vs"}
                              </span>
                              <span className="truncate">{m.awayTeam}</span>
                              {(m.matchTime || m.venue) && (
                                <span className="col-span-3 text-center text-[11px] text-slate-400">
                                  {[m.matchDate && fmtDate(m.matchDate), m.matchTime, m.venue].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
