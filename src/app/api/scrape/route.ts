// ============================================================================
// app/api/scrape/route.ts
// Vercel Serverless Function — MESIN UTAMA.
//
// POST /api/scrape  body: { url }
//
// Alur:
//   1. Terima URL dari frontend.
//   2. Jalankan Puppeteer (lib/scraper.ts) untuk ekstrak DOM (static & dynamic).
//   3. Konversi DOM -> Markdown (lib/domToMarkdown.ts).
//   4. Upload file .md ke Supabase Storage (bucket publik).
//   5. Simpan metadata di tabel `scrapes`.
//   6. Kembalikan { title, downloadUrl, preview } ke frontend.
//
// Catatan: route ini TIDAK berjalan di Edge Runtime (butuh Chromium full Node),
// jadi digunakan default Node.js runtime dari Next.js.
// ============================================================================

import { NextResponse } from "next/server";
import { scrapeUrl, ApiError } from "@/lib/scraper";
import { domToMarkdown } from "@/lib/domToMarkdown";
import { getServiceClient, getBucket } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_500_000; // batas output markdown

interface ScrapeRequest {
  url?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ScrapeRequest;
  try {
    body = (await req.json()) as ScrapeRequest;
  } catch {
    return jsonError(400, "Body tidak valid, kirim JSON.", "INVALID_BODY");
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return jsonError(400, "Field `url` wajib diisi.", "MISSING_URL");
  }

  // --- 1 & 2. Scrape (browser headless) ---
  let scraped;
  try {
    scraped = await scrapeUrl(rawUrl, {
      timeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 20000),
    });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.message, err.code);
    return jsonError(500, "Terjadi kesalahan saat scraping.", "SCRAPE_ERROR");
  }

  // --- 3. Convert DOM -> Markdown ---
  let converted;
  try {
    converted = domToMarkdown(scraped.mainHtml, scraped.title);
  } catch (err) {
    const m = err instanceof Error ? err.message : "konversi gagal";
    return jsonError(500, `Konversi ke Markdown gagal: ${m}`, "CONVERT_ERROR");
  }

  if (converted.markdown.length > MAX_BODY_BYTES) {
    return jsonError(413, "Hasil markdown terlalu besar.", "TOO_LARGE");
  }

  // --- 4 & 5. Simpan ke Supabase (Storage + tabel) ---
  const slug = makeSlug(scraped.title);
  const filePath = `markdown/${slug}.md`;
  const supabase = getServiceClient();
  const bucket = getBucket();

  // Upload file .md ke bucket (publik).
  const upload = await supabase.storage
    .from(bucket)
    .upload(filePath, new TextEncoder().encode(converted.markdown), {
      contentType: "text/markdown",
      cacheControl: "3600",
      upsert: true,
    });

  if (upload.error) {
    return jsonError(
      502,
      `Upload ke Storage gagal: ${upload.error.message}`,
      "STORAGE_UPLOAD_FAILED"
    );
  }

  // Dapatkan URL publik file.
  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  // Simpan metadata baris di tabel scrapes.
  const { error: dbError } = await supabase.from("scrapes").insert({
    url: scraped.url,
    title: converted.title,
    slug,
    file_path: filePath,
    bytes: converted.markdown.length,
    status: "ready",
  });

  if (dbError) {
    // Non-fatal: file sudah terupload. Tetap kembalikan link tapi catat warning.
    console.error("DB insert warning:", dbError.message);
  }

  // --- 6. Return ke frontend ---
  return NextResponse.json(
    {
      ok: true,
      title: converted.title,
      url: scraped.url,
      slug,
      downloadUrl: publicData.publicUrl,
      preview: converted.markdown.slice(0, 4000),
    },
    { status: 200 }
  );
}

// --- Helpers ---

function jsonError(status: number, message: string, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

// Buat nama file aman dari judul (slugify) + suffix unik pendek.
function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // buang aksen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";

  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}