// ============================================================================
// lib/renderTokensJson.ts
// Format W3C Design Tokens ($value/$type/$description) ala refero:
// warna bernama bermakna (gallery-white, apple-blue), font, radius,
// spacing — semuanya dengan deskripsi per token.
// Nama bermakna datang dari interpretasi AI (aiInterpret.colorNames);
// tanpa AI, fallback ke nama generik (color-1, color-2, ...).
// ============================================================================

import type { DesignResult } from "./designExtractor";

export interface TokenNaming {
  colorNames?: Record<string, string>; // hex -> nama bermakna ("#0066cc" -> "apple-blue")
  colorDescriptions?: Record<string, string>; // hex -> deskripsi
  theme?: "light" | "dark";
}

function safeName(name: string, fallback: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || fallback;
}

// Font: ekstrak nama family pertama ("SF Pro Display", Inter, ...) + fallback stack penuh.
function fontName(family: string): string {
  const first = family.split(",")[0].replace(/['"]/g, "").trim();
  return safeName(first || "font", "font");
}

export function renderTokensJson(d: DesignResult, naming: TokenNaming = {}): string {
  const colorNames = naming.colorNames ?? {};
  const colorDesc = naming.colorDescriptions ?? {};
  const used = new Set<string>();

  const nameFor = (hex: string, i: number): string => {
    const candidate = safeName(colorNames[hex.toLowerCase()] ?? "", "");
    let n = candidate || `color-${i + 1}`;
    while (used.has(n)) n = `${n}-${i + 1}`;
    used.add(n);
    return n;
  };

  const out: Record<string, unknown> = {
    color: Object.fromEntries(
      d.tokens.colors.map((c, i) => {
        const n = nameFor(c, i);
        return [n, {
          $value: c,
          $type: "color",
          $description: colorDesc[c.toLowerCase()] ?? `${c}`,
        }];
      })
    ),
  };

  if (d.tokens.fonts.length) {
    out.font = Object.fromEntries(
      d.tokens.fonts.slice(0, 6).map((f, i) => [fontName(f), {
        $value: f,
        $type: "fontFamily",
        $description: `Font family ${i + 1} dari ${d.title}`,
      }])
    );
  }

  if (d.tokens.fontSizes.length) {
    out.dimension = {
      ...Object.fromEntries(d.tokens.fontSizes.slice(0, 8).map((s, i) => [`font-size-${i + 1}`, {
        $value: s, $type: "dimension", $description: `Ukuran font ${i + 1}`,
      }])),
      ...Object.fromEntries(d.tokens.spacing.slice(0, 10).map((s, i) => [`spacing-${i + 1}`, {
        $value: s, $type: "dimension", $description: `Spacing ${i + 1} (margin/padding)`,
      }])),
    };
  } else if (d.tokens.spacing.length) {
    out.dimension = Object.fromEntries(d.tokens.spacing.slice(0, 10).map((s, i) => [`spacing-${i + 1}`, {
      $value: s, $type: "dimension", $description: `Spacing ${i + 1} (margin/padding)`,
    }]));
  }

  if (d.tokens.radius.length) {
    out.borderRadius = Object.fromEntries(d.tokens.radius.slice(0, 6).map((r, i) => [`radius-${i + 1}`, {
      $value: r, $type: "borderRadius", $description: `Radius ${i + 1}`,
    }]));
  }

  const meta: Record<string, unknown> = {
    $description: `Design tokens — ${d.title} (sumber: ${d.url})`,
  };
  if (naming.theme) meta.$theme = naming.theme;

  const body = { ...meta, ...out };
  return JSON.stringify(body, null, 2) + "\n";
}
