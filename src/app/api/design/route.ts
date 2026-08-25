// ============================================================================
// app/api/design/route.ts
// Vercel Serverless — ekstrak DESIGN dari URL target.
//
// POST /api/design  body: { url }
// Alur: validate -> fetch+CSS -> ekstrak tokens & komponen -> render DESIGN.md
//       -> upload ke Supabase Storage (publik) -> simpan tabel scrapes
//       -> return { title, downloadUrl, preview }
// ============================================================================

import { NextResponse } from "next/server";
import { extractDesign } from "@/lib/designExtractor";
import { renderDesignMd } from "@/lib/renderDesignMd";
import { getServiceClient, getBucket } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_PREVIEW = 30000; // naik dari 8000 — DESIGN tebal (refero ~15-20k) biar gak kepotong, fetch full tetap via downloadUrl

interface DesignRequest {
  url?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const rl = checkRateLimit(req);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar lagi.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 30) } }
    );
  }

  let body: DesignRequest;
  try {
    body = (await req.json()) as DesignRequest;
  } catch {
    return jsonError(400, "Body tidak valid, kirim JSON.", "INVALID_BODY");
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) return jsonError(400, "Field `url` wajib diisi.", "MISSING_URL");

  // Ekstrak desain
  let md: string;
  let title: string;
  let finalUrl: string;
  let requestedUrl: string | undefined;
  let redirected: boolean | undefined;
  let warning: string | undefined;
  try {
    const result = await extractDesign(rawUrl);
    md = renderDesignMd(result);
    title = result.title;
    finalUrl = result.url;
    requestedUrl = (result as unknown as { requestedUrl?: string }).requestedUrl;
    redirected = (result as unknown as { redirected?: boolean }).redirected;
    warning = (result as unknown as { warning?: string }).warning;
  } catch (err) {
    const m = err instanceof Error ? err.message : "ekstraksi gagal";
    return jsonError(502, `Gagal mengekstrak desain: ${m}`, "DESIGN_ERROR");
  }

  if (md.length > 2_000_000) {
    return jsonError(413, "Hasil DESIGN.md terlalu besar.", "TOO_LARGE");
  }

  // Upload ke Supabase (publik)
  const slug = makeSlug(title);
  const filePath = `design/${slug}.md`;
  const supabase = getServiceClient();
  const bucket = getBucket();

  const upload = await supabase.storage
    .from(bucket)
    .upload(filePath, new TextEncoder().encode(md), {
      contentType: "text/markdown",
      cacheControl: "3600",
      upsert: true,
    });
  if (upload.error) {
    return jsonError(502, `Upload gagal: ${upload.error.message}`, "STORAGE_UPLOAD_FAILED");
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);

  const { error: dbError } = await supabase.from("scrapes").insert({
    url: finalUrl,
    title,
    slug,
    file_path: filePath,
    bytes: md.length,
    status: "ready",
  });
  if (dbError) console.error("DB insert warning:", dbError.message);

  return NextResponse.json(
    {
      ok: true,
      title,
      url: finalUrl,
      requestedUrl,
      finalUrl,
      redirected,
      warning,
      slug,
      downloadUrl: pub.publicUrl,
      preview: md.slice(0, MAX_PREVIEW) + (md.length > MAX_PREVIEW ? `\n\n---\n*Preview terpotong ${MAX_PREVIEW.toLocaleString("id-ID")} karakter dari ${md.length.toLocaleString("id-ID")} — Download untuk lengkap atau Muat lengkap di preview.*` : ""),
      truncated: md.length > MAX_PREVIEW,
      totalChars: md.length,
    },
    { status: 200 }
  );
}

function jsonError(status: number, message: string, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "design";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
