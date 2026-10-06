import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { syncSippLocalToWorkspace } from "@/lib/sipp-local-sync";
import { getSippLocalConfig, testSippLocalConnection } from "@/lib/sipp-local";

export const maxDuration = 300;

export async function GET() {
  ensureSeeded();
  const cfg = getSippLocalConfig();
  const probe = await testSippLocalConnection();
  return NextResponse.json({
    configured: cfg.enabled && Boolean(cfg.host && cfg.user),
    host: cfg.host || null,
    database: cfg.database,
    port: cfg.port,
    probe,
  });
}

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const keywords = body.keywords ?? body.keyword ?? "";
  if (!String(keywords).trim()) {
    return NextResponse.json(
      { error: "Isi minimal satu kata kunci (mis. Cerai Gugat, Cerai Talak)" },
      { status: 400 },
    );
  }

  try {
    const result = await syncSippLocalToWorkspace({
      keywords,
      dateFrom: body.dateFrom || body.date_from || null,
      dateTo: body.dateTo || body.date_to || null,
      onlyBht: body.onlyBht !== false,
      bhtMode: body.bhtMode || body.bht_mode || undefined,
      requireNafkah: body.requireNafkah !== false && body.require_nafkah !== false,
      dateField: body.dateField || body.date_field || "putusan",
      limit: Number(body.limit || 500),
      refreshExisting: body.refreshExisting !== false,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sinkron SIPP lokal gagal";
    return NextResponse.json(
      {
        error: msg,
        hint: "Pastikan SIPP_ENABLED=true dan SIPP_HOST/USER/PASSWORD/DB (pola WA-gateway) di .env.local, MariaDB dapat dijangkau. Alternatif: Sinkron BHT publik atau impor CSV.",
      },
      { status: 502 },
    );
  }
}
