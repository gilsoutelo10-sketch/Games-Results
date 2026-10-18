import { FPF_BASE } from "./parser";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const GAP_MS = 1200;
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

export class FpfBlockedError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(
      `O resultados.fpf.pt recusou o pedido (HTTP ${status}). O site bloqueia pedidos automáticos vindos de servidores. ` +
        `Use a importação por HTML: abra ${url} no seu browser, guarde a página (Ctrl+S → "Página Web, apenas HTML") e envie o ficheiro.`,
    );
    this.status = status;
  }
}

export function fpfUrl(path: string) {
  return /^https?:/.test(path) ? path : `${FPF_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Pedido à FPF, um de cada vez e com intervalo mínimo (site pequeno, não martelar). */
export function fetchFpf(path: string): Promise<string> {
  const url = fpfUrl(path);
  const p = queue.then(async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        Referer: FPF_BASE + "/",
      },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const text = await res.text();
    if (res.status === 403 || res.status === 429 || res.status === 503 || /request was blocked/i.test(text)) {
      throw new FpfBlockedError(res.status, url);
    }
    if (!res.ok) throw new Error(`FPF respondeu HTTP ${res.status} em ${url}`);
    return text;
  });
  queue = p.catch(() => {});
  return p;
}

export const paths = {
  competitionsByAssociation: (associationId: number, seasonId: number) =>
    `/Competition/GetCompetitionsByAssociation?associationId=${associationId}&seasonId=${seasonId}`,
  competitionDetails: (competitionId: number, seasonId: number) =>
    `/Competition/Details?competitionId=${competitionId}&seasonId=${seasonId}`,
  fixture: (fixtureId: number) => `/Competition/GetClassificationAndMatchesByFixture?fixtureId=${fixtureId}`,
  home: () => "/",
};

/** IDs das associações distritais no resultados.fpf.pt (confirmados: Bragança 220, Coimbra 222, Viseu 237). */
export const KNOWN_FPF_ASSOCIATIONS: Array<{ name: string; shortName: string; fpfId: number | null }> = [
  { name: "Associação de Futebol do Algarve", shortName: "AF Algarve", fpfId: 215 },
  { name: "Associação de Futebol de Angra do Heroísmo", shortName: "AF Angra do Heroísmo", fpfId: 216 },
  { name: "Associação de Futebol de Aveiro", shortName: "AF Aveiro", fpfId: 217 },
  { name: "Associação de Futebol de Beja", shortName: "AF Beja", fpfId: 218 },
  { name: "Associação de Futebol de Braga", shortName: "AF Braga", fpfId: 219 },
  { name: "Associação de Futebol de Bragança", shortName: "AF Bragança", fpfId: 220 },
  { name: "Associação de Futebol de Castelo Branco", shortName: "AF Castelo Branco", fpfId: 221 },
  { name: "Associação de Futebol de Coimbra", shortName: "AF Coimbra", fpfId: 222 },
  { name: "Associação de Futebol de Évora", shortName: "AF Évora", fpfId: 223 },
  { name: "Associação de Futebol da Guarda", shortName: "AF Guarda", fpfId: 224 },
  { name: "Associação de Futebol da Horta", shortName: "AF Horta", fpfId: 225 },
  { name: "Associação de Futebol de Leiria", shortName: "AF Leiria", fpfId: 226 },
  { name: "Associação de Futebol de Lisboa", shortName: "AF Lisboa", fpfId: 227 },
  { name: "Associação de Futebol da Madeira", shortName: "AF Madeira", fpfId: 228 },
  { name: "Associação de Futebol de Ponta Delgada", shortName: "AF Ponta Delgada", fpfId: 229 },
  { name: "Associação de Futebol de Portalegre", shortName: "AF Portalegre", fpfId: 230 },
  { name: "Associação de Futebol do Porto", shortName: "AF Porto", fpfId: 231 },
  { name: "Associação de Futebol de Santarém", shortName: "AF Santarém", fpfId: 232 },
  { name: "Associação de Futebol de Setúbal", shortName: "AF Setúbal", fpfId: 233 },
  { name: "Associação de Futebol de Viana do Castelo", shortName: "AF Viana do Castelo", fpfId: 234 },
  { name: "Associação de Futebol de Vila Real", shortName: "AF Vila Real", fpfId: 235 },
  { name: "Associação de Futebol de Viseu", shortName: "AF Viseu", fpfId: 237 },
];

/** seasonId da FPF para uma época (estimado: 2025/26 = 104 → 2026/27 = 105). Pode ser corrigido no admin. */
export function guessFpfSeasonId(startYear: number) {
  return 104 + (startYear - 2025);
}
