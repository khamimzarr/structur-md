// ============================================================================
// lib/scraper.ts
// Mesin scraper — HTTP fetch + Cheerio (bukan Chrome/Chromium).
//
// Cocok untuk website STATIS (HTML tersaji dari server). Ringan, cepat,
// sehingga bisa selesai dalam limit Vercel Free (tanpa headless browser).
//
// Alur:
//   validateUrl() -> fetch HTML -> parse dengan Cheerio -> ekstrak title + konten utama
//   -> return { url, title, mainHtml }
// ============================================================================

import * as cheerio from "cheerio";
import { promises as dns } from "node:dns";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5_000_000; // 5MB

// Hostname media/sosial yang gak layak di-scrape.
const BLOCKED_HOSTNAMES = new Set([
  "facebook.com", "www.facebook.com", "m.facebook.com",
  "instagram.com", "www.instagram.com",
  "twitter.com", "x.com", "tiktok.com", "www.tiktok.com",
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "reddit.com", "www.reddit.com",
  "login.microsoftonline.com", "accounts.google.com",
  "apple.com", "www.apple.com", "linkedin.com", "www.linkedin.com",
]);

// Error khusus yang membawa status HTTP + kode.
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// IP private / loopback / link-local — cegah SSRF.
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function hostIsPrivate(hostname: string): Promise<boolean> {
  try {
    const addrs = await dns.resolve4(hostname);
    return addrs.some(isPrivateIpv4);
  } catch {
    return false;
  }
}

// Validasi & normalisasi URL.
export function validateUrl(raw: string): URL {
  if (raw.trim().length > 2048) {
    throw new ApiError(400, "URL terlalu panjang (maks 2048 karakter).", "URL_TOO_LONG");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new ApiError(400, "URL tidak valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(400, "Hanya mendukung protokol http/https.");
  }

  // Tolak URL berisi kredensial (user:pass@host) — aman.
  if (parsed.username || parsed.password) {
    throw new ApiError(400, "URL tidak boleh mengandung kredensial (user:pass@).", "URL_CREDENTIALS");
  }
  parsed.hash = ""; // buang fragment
  if (!parsed.hostname) {
    throw new ApiError(400, "URL harus memiliki hostname valid.");
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new ApiError(400, `Hostname ${host} diblokir.`);
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ApiError(400, "Alamat lokal tidak diizinkan.");
  }
  return parsed;
}

// Ambil path "konten utama" bila ada; fallback ke document.body.
const MAIN_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  "#main-content",
  ".main-content",
  ".post-content",
  ".article-body",
  ".entry-content",
  ".prose",
  ".markdown-body",
  "#content",
  ".content",
];

export interface ScrapeResult {
  url: string;
  title: string;
  mainHtml: string;
  html: string; // dokumen HTML penuh (untuk ekstraksi desain: <style>/<link> di <head>)
}

// Jalaan utama: fetch + parse.
export async function scrapeUrl(
  rawUrl: string,
  opts: { timeoutMs?: number } = {}
): Promise<ScrapeResult> {
  const url = validateUrl(rawUrl);

  // SSRF guard: hostname tidak boleh resolve ke IP private.
  if (await hostIsPrivate(url.hostname)) {
    throw new ApiError(
      400,
      "Hostname menunjuk ke alamat private/internal — ditolak (SSRF).",
      "SSRF_BLOCKED"
    );
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "id,en;q=0.8",
      },
    });

    if (!res.ok) {
      throw new ApiError(
        502,
        `Halaman mengembalikan HTTP ${res.status}.`,
        "HTTP_ERROR"
      );
    }

    // Pastikan benar-benar HTML (tolak file biner).
    const ctype = res.headers.get("content-type") || "";
    if (ctype && !/html|xml|text\/|application\/(xhtml|xml)/i.test(ctype)) {
      throw new ApiError(400, "URL tidak mengembalikan dokumen HTML.", "NOT_HTML");
    }

    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_RESPONSE_BYTES) {
      throw new ApiError(413, "Respons terlalu besar.", "TOO_LARGE");
    }

    html = await res.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      throw new ApiError(413, "Respons terlalu besar.", "TOO_LARGE");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const isAbort = err instanceof Error && err.name === "AbortError";
    throw new ApiError(
      isAbort ? 504 : 502,
      isAbort
        ? `Waktu tunggu habis (${timeoutMs}ms).`
        : `Gagal mengambil halaman: ${err instanceof Error ? err.message : "error"}`,
      isAbort ? "TIMEOUT" : "FETCH_FAILED"
    );
  } finally {
    clearTimeout(timer);
  }

  // Parse HTML.
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim().slice(0, 200) || "Untitled";

  // Ambil konten utama (tipe diinferensi dari $ agar tidak bergantung nama internal).
  let root: ReturnType<typeof $> | null = null;
  for (const sel of MAIN_SELECTORS) {
    const el = $(sel).first();
    if (el.length && (el.text().trim().length ?? 0) > 40) {
      root = el;
      break;
    }
  }
  // Ambil elemen pertama (bukan dokumen) untuk diserialisasi.
  const node = (root && root.length ? root : $("body")).get(0) as ReturnType<typeof $>["0"] | undefined;
  const mainHtml = node ? $.html(node) ?? "" : "";

  if (mainHtml.trim().length < 10) {
    throw new ApiError(502, "Halaman tidak mengandung konten yang bisa di-scrape.", "EMPTY_CONTENT");
  }

  return { url: url.toString(), title, mainHtml, html };
}