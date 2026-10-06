import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import {
  bulkDetectModus,
  detectAndApplyForCase,
} from "@/lib/modus-detect";

/**
 * POST /api/cases/detect-modus
 * Body:
 *  - { caseId: number } → deteksi ulang satu perkara
 *  - { bulk: true, onlyDraft?, onlyEmptyModus?, limit? } → bulk
 */
export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));

  try {
    if (body.caseId != null || body.id != null) {
      const caseId = Number(body.caseId ?? body.id);
      if (!Number.isFinite(caseId)) {
        return NextResponse.json({ error: "caseId tidak valid" }, { status: 400 });
      }
      const out = detectAndApplyForCase(caseId);
      return NextResponse.json({
        caseId,
        suggestions: out.result.suggestions,
        objek_suggestions: out.result.objek_suggestions,
        respons_suggestions: out.result.respons_suggestions,
        quality: out.result.quality,
        empty_reason: out.result.empty_reason,
        appliedSoft: out.appliedSoft,
        skippedConfirmed: out.skippedConfirmed,
        note:
          out.result.suggestions.length === 0 &&
          out.result.objek_suggestions.length === 0
            ? out.result.empty_reason
            : "Usulan andal disimpan. Koding coded / modus terisi tidak ditimpa.",
      });
    }

    const summary = bulkDetectModus({
      onlyDraft: body.onlyDraft !== false,
      onlyEmptyModus: body.onlyEmptyModus === true,
      limit: Number(body.limit || 5000),
    });

    return NextResponse.json({
      ...summary,
      note:
        "Deteksi massal selesai. Usulan bersifat heuristik (amar/status/pekerjaan/verstek). " +
        "Perkara dengan status coded atau modus yang sudah terisi tidak ditimpa — hanya suggestions diperbarui.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Deteksi modus gagal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
