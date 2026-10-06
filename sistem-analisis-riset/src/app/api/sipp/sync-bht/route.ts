import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { syncBhtCases } from "@/lib/sipp-bht-sync";

export const maxDuration = 300;

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
    const result = await syncBhtCases({
      keywords,
      dateFrom: body.dateFrom || body.date_from || null,
      dateTo: body.dateTo || body.date_to || null,
      maxPagesPerQuery: Number(body.maxPagesPerQuery || body.max_pages || 10),
      refreshExisting: body.refreshExisting !== false,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sinkron BHT gagal";
    return NextResponse.json(
      {
        error: msg,
        hint: "Periksa koneksi ke sipp.pa-sambas.go.id atau turunkan maxPagesPerQuery. Cadangan: impor CSV/JSON.",
      },
      { status: 502 },
    );
  }
}
