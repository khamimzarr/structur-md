// ============================================================================
// lib/rateLimit.ts
// Rate limit sederhana berbasis memori per-IP (token bucket).
//
// CATATAN: di Vercel Serverless state in-memory bersifat per-instance,
// jadi ini bukan batas global — tapi cukup untuk mencegah penyalahgunaan
// ringan per cold start (kasusmu: pribadi & jarang).
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
  remaining?: number;
}

interface Bucket {
  tokens: number;
  last: number;
}

const WINDOW_MS = 60_000; // 1 menit
const MAX_TOKENS = 8; // maks 8 request/menit per IP
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(req: Request): RateLimitResult {
  const ip = getClientIp(req);
  const now = Date.now();

  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: MAX_TOKENS - 1, last: now };
    buckets.set(ip, b);
    return { allowed: true, remaining: b.tokens };
  }

  // refill berdasarkan waktu berlalu
  const elapsed = now - b.last;
  b.tokens = Math.min(MAX_TOKENS, b.tokens + (elapsed / WINDOW_MS) * (MAX_TOKENS / 4));
  b.last = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: Math.floor(b.tokens) };
  }

  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
  return { allowed: false, retryAfterSec };
}

// Pembersih sederhana agar Map tidak membengkak (dipanggil tiap check saat Map besar).
if (buckets.size > 10_000) {
  const cutoff = Date.now() - WINDOW_MS * 10;
  for (const [k, v] of buckets) {
    if (v.last < cutoff) buckets.delete(k);
  }
}
