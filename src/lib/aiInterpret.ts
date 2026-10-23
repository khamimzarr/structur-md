// ============================================================================
// lib/aiInterpret.ts
// Lapisan interpretasi AI untuk DESIGN.md (standar Output 1):
// dari data ekstraksi mentah (tokens + components), LLM menghasilkan
//   - narasi gaya + metafora desain,
//   - role per warna (chrome vs content terpisah),
//   - type scale berperan (caption..display),
//   - do's & don'ts,
//   - agent prompt guide (3-5 prompt siap pakai),
//   - similar brands (referensi DNA visual serupa).
// Provider: agnes-3.0-flash. Gagal AI = non-fatal: DESIGN.md tetap tersaji
// versi data murni.
// ============================================================================

import type { DesignResult } from "./designExtractor";

const AGNES_BASE = process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1";
const AGNES_MODEL = process.env.AGNES_MODEL || "agnes-3.0-flash";
const AI_TIMEOUT_MS = Number(process.env.DESIGN_AI_TIMEOUT_MS || 45_000);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

export interface TypeScaleEntry {
  size: string;
  weight: string;
  lineHeight: string;
  tracking: string;
  role: string;
}

export interface DesignInterpretation {
  narrative: string; // 2-3 kalimat mood & karakter visual
  metaphor: string; // satu kalimat metafora desain (tagline)
  colorRoles: Record<string, string>; // hex -> role (nama -> penjelasan)
  colorNames?: Record<string, string>; // hex -> nama token bermakna ("#0066cc" -> "apple-blue")
  theme?: "light" | "dark";
  typeScale: Record<string, TypeScaleEntry>; // caption|body|heading-sm|heading|heading-lg|display
  dos: string[];
  donts: string[];
  prompts: string[]; // agent prompt guide (3-5)
  similarBrands: string[]; // 3-4 brand/web dengan DNA visual serupa
}

export function aiEnabled(): boolean {
  return Boolean(process.env.AGNES_API_KEY);
}

function buildPrompt(d: DesignResult): string {
  const colorList = d.tokens.colors.slice(0, 14).join(", ");
  const fonts = d.tokens.fonts.slice(0, 4).join("; ");
  const sizes = d.tokens.fontSizes.slice(0, 10).join(", ");
  const radii = d.tokens.radius.slice(0, 6).join(", ");
  const spacing = d.tokens.spacing.slice(0, 10).join(", ");
  const components = d.components
    .slice(0, 6)
    .map((c) => `- ${c.name} (${c.selector}): ${Object.entries(c.styles).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}`)
    .join("\n");

  return `Kamu adalah desainer UI senior yang menulis Design System Reference. Dari data ekstraksi halaman berikut, tulis interpretasi gaya desainnya sesuai standar dokumen Style Reference.

JUDUL: ${d.title}
URL: ${d.url}
STYLING: ${d.library ?? "tidak terdeteksi"}
WARNA (hex): ${colorList}
FONT: ${fonts}
UKURAN FONT (px): ${sizes}
RADIUS: ${radii}
SPACING (px, sudah snap grid 4px): ${spacing}
KOMPONEN:
${components || "- (tidak ada detail komponen)"}

Aturan WAJIB:
- Warna UI chrome (background, text, button, border) dan warna content/syntax highlight DIPISAH tegas dalam colorRoles (tandai peran dengan awalan "Chrome:" atau "Content/Syntax:").
- Type scale wajib 6 peran: caption, body, heading-sm, heading, heading-lg, display — ukuran dipilih dari daftar ukuran font yang tersedia (px).
- Spacing sudah dinormalisasi ke grid 4px; jangan menyebut nilai negatif atau aneh.
- similarBrands: 3-4 nama brand/web yang DNA visualnya mirip (mis. "Linear", "Stripe Docs", "Vercel").
- prompts: 3-5 prompt, bukan 4 pasti.

Balas HANYA JSON valid (tanpa markdown fence) dengan struktur:
{
  "narrative": "2-3 kalimat Bahasa Indonesia menjelaskan mood & karakter visual gaya ini (copywriting desain, bukan daftar nilai)",
  "metaphor": "SATU kalimat metafora desain yang menangkap karakter situs",
  "theme": "light atau dark",
  "colorNames": { "<hex>": "nama-token-bermakna-kebab-case (contoh: apple-blue, ink)" },
  "colorRoles": { "<hex>": "Chrome: ... atau Content/Syntax: ... + penjelasan 1 kalimat" },
  "typeScale": {
    "caption": { "size": "<px dari daftar>", "weight": "<400|500|600|700>", "lineHeight": "<1.4>", "tracking": "<normal|tight|wide>", "role": "<kapan dipakai>" },
    "body": { "size": "...", "weight": "...", "lineHeight": "...", "tracking": "...", "role": "..." },
    "heading-sm": { "size": "...", "weight": "...", "lineHeight": "...", "tracking": "...", "role": "..." },
    "heading": { "size": "...", "weight": "...", "lineHeight": "...", "tracking": "...", "role": "..." },
    "heading-lg": { "size": "...", "weight": "...", "lineHeight": "...", "tracking": "...", "role": "..." },
    "display": { "size": "...", "weight": "...", "lineHeight": "...", "tracking": "...", "role": "..." }
  },
  "dos": ["5 aturan yang HARUS diikuti saat meniru gaya ini"],
  "donts": ["5 larangan saat meniru gaya ini"],
  "prompts": ["3-5 prompt siap pakai (Bahasa Indonesia) untuk AI builder (Cursor/v0/Claude) membangun section khas gaya ini, sebutkan nilai konkret (hex, px)"],
  "similarBrands": ["3-4 nama brand/web dengan DNA visual serupa"]
}
Semua teks Bahasa Indonesia. colorNames & colorRoles hanya untuk warna utama (maks 8). Nama token deskriptif TENTANG PERANNYA, kebab-case.`;
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
    if (!narrative) return null;
    const colorRolesRaw = raw.colorRoles;
    const colorNamesRaw = raw.colorNames;
    const theme = raw.theme === "dark" ? "dark" : raw.theme === "light" ? "light" : undefined;
    const dos = Array.isArray(raw.dos) ? raw.dos.filter((x): x is string => typeof x === "string") : [];
    const donts = Array.isArray(raw.donts) ? raw.donts.filter((x): x is string => typeof x === "string") : [];
    const prompts = Array.isArray(raw.prompts) ? raw.prompts.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
    const similarBrands = Array.isArray(raw.similarBrands)
      ? raw.similarBrands.filter((x): x is string => typeof x === "string").slice(0, 4)
      : [];
    const metaphor = typeof raw.metaphor === "string" ? raw.metaphor : "";

    const colorRoles: Record<string, string> = {};
    if (colorRolesRaw && typeof colorRolesRaw === "object") {
      for (const [k, v] of Object.entries(colorRolesRaw as Record<string, unknown>)) {
        if (typeof v === "string") colorRoles[k.toLowerCase()] = v;
      }
    }
    const colorNames: Record<string, string> = {};
    if (colorNamesRaw && typeof colorNamesRaw === "object") {
      for (const [k, v] of Object.entries(colorNamesRaw as Record<string, unknown>)) {
        if (typeof v === "string") colorNames[k.toLowerCase()] = v;
      }
    }
    // typeScale: validasi peran yang dikenal
    const KNOWN = ["caption", "body", "heading-sm", "heading", "heading-lg", "display"];
    const typeScale: DesignInterpretation["typeScale"] = {};
    if (raw.typeScale && typeof raw.typeScale === "object") {
      for (const [role, val] of Object.entries(raw.typeScale as Record<string, unknown>)) {
        if (!KNOWN.includes(role) || !val || typeof val !== "object") continue;
        const v = val as Record<string, unknown>;
        typeScale[role] = {
          size: typeof v.size === "string" ? v.size : "",
          weight: typeof v.weight === "string" ? v.weight : "400",
          lineHeight: typeof v.lineHeight === "string" ? v.lineHeight : "1.5",
          tracking: typeof v.tracking === "string" ? v.tracking : "normal",
          role: typeof v.role === "string" ? v.role : "",
        };
      }
    }
    return { narrative, metaphor, colorRoles, colorNames, theme, typeScale, dos, donts, prompts, similarBrands };
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
