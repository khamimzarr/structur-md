// ============================================================================
// app/api/history/route.ts
// GET /api/history?limit=N — daftar riwayat hasil scraping (dari tabel scrapes).
// Pakai service_role, aman (hanya server).
// ============================================================================

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 12)));

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("scrapes")
    .select("slug,title,url,file_path,bytes,created_at,status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, code: "HISTORY_ERROR" },
      { status: 502 }
    );
  }

  // Bawa link publik langsung dari path storage.
  const bucket = process.env.SUPABASE_BUCKET || "markdown-results";
  const rows = (data ?? []).map((r) => ({
    ...r,
    downloadUrl: r.file_path
      ? supabase.storage.from(bucket).getPublicUrl(r.file_path).data.publicUrl
      : null,
  }));

  return NextResponse.json({ ok: true, items: rows }, { status: 200 });
}