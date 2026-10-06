import { NextResponse } from "next/server";
import { exportCasesCsv, exportCasesExcel } from "@/lib/export";
import { ensureSeeded } from "@/lib/seed";

export async function GET(req: Request) {
  ensureSeeded();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "csv";
  const publicMask = url.searchParams.get("mask") !== "0";

  if (format === "xlsx") {
    const buf = await exportCasesExcel({ publicMask });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="koding-berkas-bab4.xlsx"',
      },
    });
  }

  const csv = exportCasesCsv({ publicMask });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="koding-berkas-bab4.csv"',
    },
  });
}
