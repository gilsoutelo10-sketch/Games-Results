/**
 * Leitor do resultados.fpf.pt (site oficial da FPF com todas as competições distritais).
 *
 * O site é HTML gerado no servidor, sem API pública. Em vez de depender de classes CSS,
 * procuramos padrões estáveis: ligações com competitionId / fixtureId / matchId, tabelas com
 * as colunas POS/JGS/V/E/D/GM/GS/PTS, blocos "equipa  resultado  equipa", e títulos de fase/série.
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export const FPF_BASE = "https://resultados.fpf.pt";

export type FpfCompetition = {
  competitionId: number;
  seasonId: number | null;
  name: string;
  category: string; // Senior, Junior-A(Junior), ... texto do título da secção
};

export type FpfSeasonOption = { seasonId: number; name: string };
export type FpfAssociationOption = { associationId: number; name: string };

export type FpfStandingRow = {
  pos: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type FpfMatch = {
  fpfMatchId: string | null;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  venue: string | null;
  round: number | null;
};

export type FpfSerie = {
  key: string;
  phase: string;
  name: string;
  serieId: number | null;
  fixtureIds: number[];
  standings: FpfStandingRow[];
  matches: FpfMatch[];
};

export type FpfCompetitionPage = {
  title: string;
  series: FpfSerie[];
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function idIn(v: string | undefined, key: string): string | null {
  if (!v) return null;
  const m = v.match(new RegExp(`${key}\\W{0,3}(\\d{2,})`, "i"));
  return m ? m[1] : null;
}

/** "12-10-2026", "2026-10-12", "12 out", "12 out 2026" → YYYY-MM-DD (ano inferido se faltar) */
export function parseDate(t: string, seasonStartYear?: number): string | null {
  const s = norm(t);
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?\s*(?:de\s+)?(\d{4})?\b/);
  if (m && MESES[m[2]]) {
    const mes = MESES[m[2]];
    let y = m[3] ? Number(m[3]) : undefined;
    if (!y) {
      const start = seasonStartYear ?? new Date().getFullYear();
      y = mes >= 7 ? start : start + 1; // época começa em agosto/setembro
    }
    return `${y}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function parseTime(t: string): string | null {
  const m = t.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// ───────────────── lista de competições de uma associação ─────────────────

export function parseCompetitionsList(html: string): {
  competitions: FpfCompetition[];
  seasons: FpfSeasonOption[];
  associationName: string | null;
} {
  const $ = cheerio.load(html);
  const out = new Map<number, FpfCompetition>();
  let context = "";

  const associationName =
    clean($("h1").first().text()) || clean($("h2").first().text()) || null;

  $("body *").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    const cls = ($el.attr("class") || "").toLowerCase();
    if (/^h[1-6]$/.test(tag) || /title|header|titulo|category|categoria|escalao/.test(cls)) {
      const t = clean($el.clone().children("a").remove().end().text());
      if (t && t.length < 80 && !$el.find("a[href*='competitionId']").length) context = t;
    }
    if (tag === "a") {
      const href = $el.attr("href") || $el.attr("onclick") || "";
      const id = idIn(href, "competitionId");
      if (!id) return;
      const name = clean($el.text()) || clean($el.attr("title") || "");
      if (!name || name.length > 160) return;
      const cid = Number(id);
      if (!out.has(cid)) {
        out.set(cid, {
          competitionId: cid,
          seasonId: idIn(href, "seasonId") ? Number(idIn(href, "seasonId")) : null,
          name,
          category: context,
        });
      }
    }
  });

  return { competitions: [...out.values()], seasons: parseSeasonOptions($), associationName };
}

function parseSeasonOptions($: cheerio.CheerioAPI): FpfSeasonOption[] {
  const out: FpfSeasonOption[] = [];
  $("select").each((_, sel) => {
    const key = norm(`${$(sel).attr("id") || ""} ${$(sel).attr("name") || ""} ${$(sel).attr("class") || ""}`);
    const text = norm($(sel).text());
    if (!/season|epoca/.test(key) && !/\d{4}\s*[\/-]\s*\d{2,4}/.test(text)) return;
    $(sel)
      .find("option")
      .each((_, o) => {
        const v = $(o).attr("value") || "";
        const label = clean($(o).text());
        if (/^\d+$/.test(v) && /\d{4}/.test(label)) out.push({ seasonId: Number(v), name: label });
      });
  });
  // também ligações com seasonId=
  if (out.length === 0) {
    $("a[href*='seasonId']").each((_, a) => {
      const href = $(a).attr("href") || "";
      const id = idIn(href, "seasonId");
      const label = clean($(a).text());
      if (id && /\d{4}\s*[\/-]\s*\d{2,4}/.test(label) && !out.some((s) => s.seasonId === Number(id)))
        out.push({ seasonId: Number(id), name: label });
    });
  }
  return out;
}

/** Lista de associações (select/links com associationId=) numa página qualquer da FPF */
export function parseAssociationOptions(html: string): FpfAssociationOption[] {
  const $ = cheerio.load(html);
  const out = new Map<number, string>();
  $("select option").each((_, o) => {
    const sel = $(o).closest("select");
    const key = norm(`${sel.attr("id") || ""} ${sel.attr("name") || ""} ${sel.attr("class") || ""}`);
    if (!/assoc/.test(key)) return;
    const v = $(o).attr("value") || "";
    if (/^\d+$/.test(v)) out.set(Number(v), clean($(o).text()));
  });
  $("a[href*='associationId'], [data-association-id], [onclick*='associationId']").each((_, a) => {
    const v = $(a).attr("href") || $(a).attr("onclick") || $(a).attr("data-association-id") || "";
    const id = idIn(v, "associationId") || (v.match(/^\d+$/) ? v : null);
    const label = clean($(a).text());
    if (id && label && !out.has(Number(id))) out.set(Number(id), label);
  });
  return [...out.entries()].map(([associationId, name]) => ({ associationId, name }));
}

// ───────────────── página de uma competição (fases, séries, classificação, jogos) ─────────────────

const COL: Array<[RegExp, keyof FpfStandingRow | "dg"]> = [
  [/^(pos|#|n\.?o|lugar|cl\.?|posicao)$/, "pos"],
  [/^(equipa|clube|equipas|clubes|team|nome)$/, "team"],
  [/^(pts?|pontos|points?)$/, "points"],
  [/^(j|jg|jgs|jogos|pj)$/, "played"],
  [/^(v|vit|vitorias|w)$/, "wins"],
  [/^(e|emp|empates)$/, "draws"],
  [/^(d|der|derrotas|l)$/, "losses"],
  [/^(gm|gf|golos marcados|marcados|g\.?m\.?)$/, "goalsFor"],
  [/^(gs|gc|ga|golos sofridos|sofridos|g\.?s\.?)$/, "goalsAgainst"],
  [/^(dg|dif|\+\/-|saldo|gd)$/, "dg"],
];

function parseStandingsTable($: cheerio.CheerioAPI, table: Element): FpfStandingRow[] {
  const rows = $(table).find("tr").toArray();
  if (rows.length < 2) return [];
  const headerRow =
    rows.find((tr) => $(tr).find("th").length >= 4) ??
    rows.find((tr) => /\bpts\b|\bpos\b/i.test($(tr).text()));
  if (!headerRow) return [];
  const headers = $(headerRow)
    .find("th,td")
    .toArray()
    .map((c) => norm($(c).text()));
  const map = headers.map((h) => COL.find(([re]) => re.test(h))?.[1] ?? null);
  if (!map.includes("points") || !map.includes("played")) return [];

  const out: FpfStandingRow[] = [];
  for (const tr of rows) {
    if (tr === headerRow) continue;
    const cells = $(tr).find("td").toArray().map((c) => clean($(c).text()));
    if (cells.length < 5) continue;
    const row: Partial<FpfStandingRow> = {};
    let teamIdx = map.indexOf("team");
    if (teamIdx < 0) {
      // coluna com mais texto
      teamIdx = cells.findIndex((c) => /[a-zà-ú]{3}/i.test(c));
    }
    map.forEach((k, i) => {
      if (!k || k === "dg" || k === "team") return;
      const n = Number((cells[i] || "").replace(/[^\d-]/g, ""));
      if (Number.isFinite(n)) (row as Record<string, number>)[k] = n;
    });
    const team = (cells[teamIdx] || "").replace(/^\d+\s*[.ºª]?\s*/, "").trim();
    if (!team || row.points === undefined) continue;
    out.push({
      pos: row.pos ?? out.length + 1,
      team,
      played: row.played ?? 0,
      wins: row.wins ?? 0,
      draws: row.draws ?? 0,
      losses: row.losses ?? 0,
      goalsFor: row.goalsFor ?? 0,
      goalsAgainst: row.goalsAgainst ?? 0,
      points: row.points,
    });
  }
  return out;
}

const NOISE =
  /^(vs\.?|x|-|–|jornada.*|j\.?\s*\d+|data|hora|local|campo|est[aá]dio|resultado|ver (jogo|ficha)|ficha|detalhes?|classifica[cç][aã]o|calend[aá]rio|adiado|suspenso|anulado|cancelado|a decorrer|intervalo|terminado|final|jogos|jornadas|pos|jgs|v|e|d|gm|gs|pts)$/i;

const looksLikeTeam = (t: string) =>
  /[a-zà-ú]{2}/i.test(t) &&
  t.length >= 2 &&
  t.length <= 70 &&
  !NOISE.test(t) &&
  !/^\d{1,2}[:h]\d{2}$/.test(t) &&
  !/^\d+\s*-\s*\d+$/.test(t) &&
  !parseTime(t) &&
  !/^\d{1,2}\s+[a-z]{3}\b/i.test(t) &&
  !/^(estádio|estadio|campo|complexo|parque|pavilh|academia|centro|est\.|cd |c\.d\.)/i.test(t);

const looksLikeVenue = (t: string) =>
  /^(estádio|estadio|campo|complexo|parque|pavilh|academia|centro desp|est\.|municipal|sintético|relvado)/i.test(t);

/** Pedaços de texto (folhas) de um elemento, por ordem. */
function pieces($: cheerio.CheerioAPI, el: AnyNode): string[] {
  const out: string[] = [];
  const walk = (n: AnyNode) => {
    if (n.type === "text") {
      const t = clean((n as unknown as { data: string }).data || "");
      if (t) out.push(t);
    } else if (n.type === "tag") {
      const e = n as Element;
      if (/^(script|style)$/i.test(e.tagName)) return;
      if (e.tagName === "img" && e.attribs?.alt) out.push(clean(e.attribs.alt));
      for (const c of e.children) walk(c);
    }
  };
  walk(el);
  return out;
}

function parseMatchBlock(ps: string[], seasonStartYear?: number): Omit<FpfMatch, "fpfMatchId" | "round"> | null {
  let home: string | null = null;
  let away: string | null = null;
  let hg: number | null = null;
  let ag: number | null = null;
  let date: string | null = null;
  let time: string | null = null;
  let venue: string | null = null;
  let scoreSeen = false;

  for (const p of ps) {
    // resultado "2 - 1" (com eventuais penáltis "(5) 2 - 2 (3)")
    const sc = p.match(/^(?:\(\d+\)\s*)?(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s*\(\d+\))?$/);
    if (sc && home && !scoreSeen) {
      hg = Number(sc[1]);
      ag = Number(sc[2]);
      scoreSeen = true;
      continue;
    }
    if (!time) {
      const t = parseTime(p);
      if (t && p.length <= 20) {
        time = t;
        const d = parseDate(p, seasonStartYear);
        if (d) date = d;
        if (!home) continue;
        scoreSeen = true; // hora no lugar do resultado = por jogar
        continue;
      }
    }
    if (!date) {
      const d = parseDate(p, seasonStartYear);
      if (d && p.length <= 24) {
        date = d;
        if (home && !away) scoreSeen = true;
        continue;
      }
    }
    if (looksLikeVenue(p)) {
      if (home && away) venue = p;
      continue;
    }
    if (looksLikeTeam(p)) {
      if (!home) home = p;
      else if (!away && (scoreSeen || p !== home)) away = p;
      else if (!venue && home && away) venue = p;
    }
  }

  if (!home || !away || norm(home) === norm(away)) return null;
  return { home, away, homeGoals: hg, awayGoals: ag, date, time, venue };
}

type Ctx = { phase: string; serie: string; round: number | null; serieId: number | null };

export function parseCompetitionPage(html: string, seasonStartYear?: number): FpfCompetitionPage {
  const $ = cheerio.load(html);
  const title =
    clean($("title").text()).replace(/\s*[—–|-]\s*(Compet[ií]ç[õo]es|Resultados|FPF).*$/i, "") ||
    clean($("h1").first().text()) ||
    clean($("h2").first().text());

  const series = new Map<string, FpfSerie>();
  const ctx: Ctx = { phase: "", serie: "", round: null, serieId: null };
  const seenMatchIds = new Set<string>();
  const seenTables = new Set<Element>();

  const getSerie = () => {
    const phase = ctx.phase || "Fase única";
    const name = ctx.serie || "Série única";
    const key = `${phase}::${name}`;
    let s = series.get(key);
    if (!s) {
      s = { key, phase, name, serieId: ctx.serieId, fixtureIds: [], standings: [], matches: [] };
      series.set(key, s);
    }
    if (ctx.serieId && !s.serieId) s.serieId = ctx.serieId;
    return s;
  };

  const isPhaseLabel = (t: string) =>
    /\bfase\b|eliminat|apuramento|manuten|play-?off|subida|descida|final/i.test(t) && t.length <= 90;
  const isSerieLabel = (t: string) =>
    /\bs[ée]rie\b|\bgrupo\b|\bzona\b|\búnica\b/i.test(t) && t.length <= 60;

  const matchAnchors = new Map<string, Element>();

  const walk = (node: AnyNode) => {
    if (node.type !== "tag") return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (/^(script|style|noscript)$/.test(tag)) return;
    const $el = $(el);

    // títulos → contexto de fase/série
    if (/^h[1-6]$/.test(tag) || /title|header|titulo|phase|fase|serie|group|grupo|tab/i.test(el.attribs?.class || "")) {
      const own = clean($el.clone().children().remove().end().text()) || clean($el.text());
      if (own && own.length <= 90 && !$el.find("table").length) {
        if (isSerieLabel(own) && !/^jornada/i.test(own)) {
          // "2.ª FASE/SÉRIE A" contém ambos
          const parts = own.split(/\s*[\/|]\s*/);
          if (parts.length === 2 && isPhaseLabel(parts[0])) ctx.phase = parts[0];
          ctx.serie = parts.length === 2 ? parts[1] : own;
          ctx.serieId = null;
          ctx.round = null;
          getSerie();
        } else if (isPhaseLabel(own) && !/^jornada/i.test(own)) {
          ctx.phase = own;
          ctx.serie = "";
          ctx.serieId = null;
          ctx.round = null;
        }
      }
    }

    // atributos com ids
    const attrs = Object.entries(el.attribs || {});
    for (const [k, v] of attrs) {
      if (!/href|onclick|data-|value|id/.test(k)) continue;
      const sid = idIn(v, "serieId");
      if (sid) ctx.serieId = Number(sid);
      const fid = idIn(v, "fixtureId");
      if (fid) {
        const s = getSerie();
        const n = Number(fid);
        if (!s.fixtureIds.includes(n)) s.fixtureIds.push(n);
      }
      const mid = idIn(v, "matchId");
      if (mid && !matchAnchors.has(mid)) matchAnchors.set(mid, el);
    }

    // "Jornada N"
    if (tag !== "select") {
      const own = clean($el.clone().children().remove().end().text());
      const jm = own && own.length < 40 ? norm(own).match(/jornada\s*(\d+)|(\d+)\s*[aª]?\s*jornada/) : null;
      if (jm) ctx.round = Number(jm[1] || jm[2]);
    }

    // tabela de classificação
    if (tag === "table" && !seenTables.has(el)) {
      const rows = parseStandingsTable($, el);
      if (rows.length >= 2) {
        seenTables.add(el);
        const s = getSerie();
        if (s.standings.length === 0) s.standings = rows;
        return; // não descer
      }
    }

    // bloco de jogo: elemento com ligação matchId
    for (const [k, v] of attrs) {
      if (!/href|onclick|data-/.test(k)) continue;
      const mid = idIn(v, "matchId");
      if (!mid || seenMatchIds.has(mid)) continue;
      // sobe até ter duas equipas
      let b: Element | null = el;
      for (let i = 0; i < 6 && b; i++) {
        const txt = $(b).text();
        const matchIdsInside = (txt.match(/matchId/gi) || []).length;
        const anchorsInside = $(b).find("[href*='matchId'],[onclick*='matchId']").length;
        if (i > 0 && (anchorsInside > 1 || matchIdsInside > 1)) break;
        const parsed = parseMatchBlock(pieces($, b), seasonStartYear);
        if (parsed) {
          seenMatchIds.add(mid);
          const s = getSerie();
          s.matches.push({ fpfMatchId: mid, round: ctx.round, ...parsed });
          return; // bloco consumido
        }
        b = b.parent && b.parent.type === "tag" ? (b.parent as Element) : null;
      }
    }

    for (const c of el.children) walk(c);
  };

  const body = $("body").get(0) ?? $.root().get(0);
  if (body) walk(body as AnyNode);

  // blocos de jogo sem matchId (classe game/match/jogo)
  $("[class*='game'],[class*='match'],[class*='jogo'],[class*='partida']").each((_, el) => {
    if ($(el).find("[href*='matchId'],[onclick*='matchId']").length) return;
    if ($(el).parents("[class*='game'],[class*='match'],[class*='jogo'],[class*='partida']").length) return;
    const parsed = parseMatchBlock(pieces($, el), seasonStartYear);
    if (!parsed) return;
    // atribui à série cuja classificação contém estas equipas
    const target =
      [...series.values()].find(
        (s) =>
          s.standings.some((r) => norm(r.team) === norm(parsed.home)) &&
          s.standings.some((r) => norm(r.team) === norm(parsed.away)),
      ) ?? [...series.values()][0];
    if (!target) return;
    if (target.matches.some((m) => norm(m.home) === norm(parsed.home) && norm(m.away) === norm(parsed.away) && m.date === parsed.date)) return;
    target.matches.push({ fpfMatchId: null, round: null, ...parsed });
  });

  return { title, series: [...series.values()].filter((s) => s.standings.length || s.matches.length || s.fixtureIds.length) };
}

/** Página de uma jornada (GetClassificationAndMatchesByFixture): jogos + classificação */
export function parseFixturePage(html: string, seasonStartYear?: number) {
  const page = parseCompetitionPage(html, seasonStartYear);
  const matches = page.series.flatMap((s) => s.matches);
  const standings = page.series.find((s) => s.standings.length)?.standings ?? [];
  const $ = cheerio.load(html);
  const jm = norm($("body").text()).match(/jornada\s*(\d+)/);
  return { matches, standings, round: jm ? Number(jm[1]) : null };
}
