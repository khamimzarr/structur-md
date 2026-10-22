// ============================================================================
// lib/aiInterpret.ts
// Lapisan interpretasi AI untuk DESIGN.md (ala refero):
// dari data ekstraksi mentah (tokens + components), LLM menghasilkan
//   - narasi gaya (2-3 kalimat),
//   - role per warna,
//   - do's & don'ts,
//   - agent prompt guide (4 prompt siap pakai).
// Provider: agnes-3.0-flash. Gagal AI = non-fatal: DESIGN.md tetap tersaji
// versi data murni.
// ============================================================================

import type { DesignResult } from "./designExtractor";

const AGNES_BASE = process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1";
const AGNES_MODEL = process.env.AGNES_MODEL || "agnes-3.0-flash";
const AI_TIMEOUT_MS = Number(process.env.DESIGN_AI_TIMEOUT_MS || 45_000);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

export interface DesignInterpretation {
  narrative: string; // 2-3 kalimat mood & karakter visual
  colorRoles: Record<string, string>; // hex -> role (nama -> penjelasan)
  dos: string[];
  donts: string[];
  prompts: string[]; // agent prompt guide
}

export function aiEnabled(): boolean {
  return Boolean(process.env.AGNES_API_KEY);
}

function buildPrompt(d: DesignResult): string {
  const colorList = d.tokens.colors.slice(0, 14).join(", ");
  const fonts = d.tokens.fonts.slice(0, 4).join("; ");
  const sizes = d.tokens.fontSizes.slice(0, 8).join(", ");
  const radii = d.tokens.radius.slice(0, 6).join(", ");
  const spacing = d.tokens.spacing.slice(0, 8).join(", ");
  const components = d.components
    .slice(0, 6)
    .map((c) => `- ${c.name} (${c.selector}): ${Object.entries(c.styles).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}`)
    .join("\n");

  return `Kamu adalah desainer UI senior. Dari data ekstraksi halaman berikut, tulis interpretasi gaya desainnya.

JUDUL: ${d.title}
URL: ${d.url}
STYLING: ${d.library ?? "tidak terdeteksi"}
WARNA (hex): ${colorList}
FONT: ${fonts}
UKURAN FONT: ${sizes}
RADIUS: ${radii}
SPACING: ${spacing}
KOMPONEN:
${components || "- (tidak ada detail komponen)"}

Balas HANYA JSON valid (tanpa markdown fence) dengan struktur:
{
  "narrative": "2-3 kalimat Bahasa Indonesia menjelaskan mood & karakter visual gaya ini (seperti copywriting desain, bukan daftar nilai)",
  "colorRoles": { "<hex>": "<role penggunaannya, 1 kalimat>" },
  "dos": ["5 aturan yang HARUS diikuti saat meniru gaya ini"],
  "donts": ["5 larangan saat meniru gaya ini"],
  "prompts": ["4 prompt siap pakai (Bahasa Indonesia) untuk AI builder (Cursor/v0) membangun section khas gaya ini, sebutkan nilai konkret (hex, px)"]
}
Semua teks Bahasa Indonesia. colorRoles hanya untuk warna utama (maks 8).`;
}

function extractJson(text: string): DesignInterpretation | null {
  // buang fence bila ada
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const narrative = typeof raw.narrative === "string" ? raw.narrative : "";
    const colorRolesRaw = raw.colorRoles;
    const dos = Array.isArray(raw.dos) ? raw.dos.filter((x): x is string => typeof x === "string") : [];
    const donts = Array.isArray(raw.donts) ? raw.donts.filter((x): x is string => typeof x === "string") : [];
    const prompts = Array.isArray(raw.prompts) ? raw.prompts.filter((x): x is string => typeof x === "string") : [];
    const colorRoles: Record<string, string> = {};
    if (colorRolesRaw && typeof colorRolesRaw === "object") {
      for (const [k, v] of Object.entries(colorRolesRaw as Record<string, unknown>)) {
        if (typeof v === "string") colorRoles[k] = v;
      }
    }
    if (!narrative) return null;
    return { narrative, colorRoles, dos, donts, prompts };
  } catch {
    return null;
  }
}

export async function interpretDesign(d: DesignResult): Promise<DesignInterpretation | null> {
  const key = process.env.AGNES_API_KEY;
  if (!key) return null;

  const payload = {
    model: AGNES_MODEL,
    messages: [{ role: "user", content: buildPrompt(d) }],
    temperature: 0.4,
    stream: false,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${AGNES_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (res.status === 200) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content ?? "";
        const parsed = extractJson(content);
        if (parsed) return parsed;
        // JSON rusak — coba sekali lagi
      } else if (res.status === 429 || res.status >= 500) {
        // retryable
      } else {
        return null; // 4xx lain: jangan buang waktu
      }
    } catch {
      // timeout/network: fallback
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt - 1)));
    }
  }
  return null;
}
