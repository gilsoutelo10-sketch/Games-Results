import { NextResponse } from "next/server";
import { syncAllLinked } from "@/lib/fpf/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Re-sincroniza resultados e classificações de todas as competições ligadas à FPF.
 * Pode ser chamado por um agendador (cron) externo. Se SYNC_SECRET estiver definido,
 * é exigido o header `Authorization: Bearer <SYNC_SECRET>`.
 */
async function handle(req: Request) {
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await syncAllLinked();
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}

export const GET = handle;
export const POST = handle;
