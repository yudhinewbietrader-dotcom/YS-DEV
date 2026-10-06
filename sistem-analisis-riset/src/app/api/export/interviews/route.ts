import { NextResponse } from "next/server";
import { exportInterviewsJson } from "@/lib/export";
import { ensureSeeded } from "@/lib/seed";

export async function GET() {
  ensureSeeded();
  const json = exportInterviewsJson();
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="respons-wawancara.json"',
    },
  });
}
