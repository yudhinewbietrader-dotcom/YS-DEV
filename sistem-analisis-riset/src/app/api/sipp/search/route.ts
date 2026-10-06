import { NextResponse } from "next/server";
import { searchSippPublic } from "@/lib/sipp";
import { ensureSeeded } from "@/lib/seed";

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").trim();
  if (!keyword) {
    return NextResponse.json({ error: "Kata kunci wajib" }, { status: 400 });
  }
  try {
    const items = await searchSippPublic(keyword);
    return NextResponse.json({
      baseUrl: process.env.SIPP_BASE_URL || "https://sipp.pa-sambas.go.id",
      count: items.length,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menghubungi SIPP";
    return NextResponse.json(
      {
        error: msg,
        hint: "Gunakan impor CSV/JSON manual jika SIPP tidak dapat diakses atau HTML berubah.",
      },
      { status: 502 },
    );
  }
}
