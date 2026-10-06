import { NextResponse } from "next/server";
import { fetchByNomorPerkara, fetchSippDetail, type SippListItem } from "@/lib/sipp";
import { getDb } from "@/lib/db";
import { makeBerkasCode, maskPartyText } from "@/lib/anonymize";
import { ensureSeeded } from "@/lib/seed";

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const nomor = String(body.nomor_perkara || "").trim();
  const detailUrl = String(body.detail_url || "").trim();
  const save = Boolean(body.save);

  try {
    let detail = null;
    let list: SippListItem[] = [];

    if (detailUrl) {
      detail = await fetchSippDetail(detailUrl);
    } else if (nomor) {
      const result = await fetchByNomorPerkara(nomor);
      detail = result.detail;
      list = result.list;
    } else {
      return NextResponse.json(
        { error: "Sertakan nomor_perkara atau detail_url" },
        { status: 400 },
      );
    }

    if (!detail) {
      return NextResponse.json(
        {
          error: "Detail tidak ditemukan / tidak unik",
          list,
          hint: "Pilih baris dari hasil pencarian atau tempel URL detil publik.",
        },
        { status: 404 },
      );
    }

    let savedId: number | bigint | null = null;
    let kode_berkas: string | null = null;

    if (save) {
      const db = getDb();
      const existing = db
        .prepare("SELECT id, kode_berkas FROM cases WHERE nomor_perkara = ?")
        .get(detail.nomor_perkara) as { id: number; kode_berkas: string } | undefined;

      if (existing) {
        db.prepare(
          `UPDATE cases SET
            jenis_perkara = ?, tanggal_register = ?, status_perkara = ?,
            para_pihak_masked = ?, sipp_detail_url = ?, sumber = 'sipp_public',
            updated_at = datetime('now')
          WHERE id = ?`,
        ).run(
          detail.jenis_perkara || null,
          detail.tanggal_register || null,
          detail.status_perkara || null,
          maskPartyText(detail.para_pihak_masked),
          detail.detail_url,
          existing.id,
        );
        savedId = existing.id;
        kode_berkas = existing.kode_berkas;
      } else {
        const year =
          Number(detail.nomor_perkara.match(/\/(\d{4})\//)?.[1]) ||
          new Date().getFullYear();
        const count = (
          db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
            n: number;
          }
        ).n;
        kode_berkas = makeBerkasCode(year, count + 1);
        const info = db
          .prepare(
            `INSERT INTO cases (
              kode_berkas, nomor_perkara, jenis_perkara, tanggal_register,
              status_perkara, para_pihak_masked, sipp_detail_url, sumber, tahun, coding_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sipp_public', ?, 'draft')`,
          )
          .run(
            kode_berkas,
            detail.nomor_perkara,
            detail.jenis_perkara || null,
            detail.tanggal_register || null,
            detail.status_perkara || null,
            maskPartyText(detail.para_pihak_masked),
            detail.detail_url,
            year,
          );
        savedId = info.lastInsertRowid;
      }
    }

    return NextResponse.json({ detail, list, savedId, kode_berkas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal fetch SIPP";
    return NextResponse.json(
      {
        error: msg,
        hint: "Fallback: impor CSV/JSON. Jangan gunakan akses non-publik.",
      },
      { status: 502 },
    );
  }
}
