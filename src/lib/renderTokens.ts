// ============================================================================
// lib/renderTokens.ts
// Renderer format token desain: Tailwind v4 (@theme) dan CSS Variables
// (:root). Sumber: DesignResult dari designExtractor — nilai warna, font,
// radius, spacing, ukuran font yang sudah diresolusi jadi px/hex.
// ============================================================================

import type { DesignResult } from "./designExtractor";

// Slug aman untuk nama token: "bg-slate" -> slate, dsb.
function tokenName(prefix: string, value: string, index: number): string {
  // pakai nilai kalau bisa jadi identifier, kalau tidak pakai nomor
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return safe ? `${prefix}-${safe}` : `${prefix}-${index + 1}`;
}

// Warna bernama: hanya hex yang bisa dipakai sebagai warna Tailwind.
function isHexColor(c: string): boolean {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c);
}

function shortColorName(c: string, index: number): string {
  // contoh: #0f172a -> 0f172a; biar gak tabrakan pakai nomor urut bila perlu
  return c.replace("#", "").slice(0, 6);
}

export interface TokenFormats {
  tailwindV4: string;
  cssVariables: string;
}

export function renderTokenFormats(d: DesignResult): TokenFormats {
  const colors = d.tokens.colors.filter(isHexColor);
  const fonts = d.tokens.fonts;
  const radii = d.tokens.radius;
  const spacings = d.tokens.spacing;
  const fontSizes = d.tokens.fontSizes;

  // ---------- Tailwind v4 (@theme) ----------
  const T: string[] = [];
  T.push(`/* Tailwind v4 theme — ${d.title}`);
  T.push(` * Sumber: ${d.url}`);
  if (d.library) T.push(` * Styling asli: ${d.library}`);
  T.push(` * Pakai: @import "tailwindcss"; lalu file ini. */`);
  T.push("");
  T.push("@theme {");
  colors.forEach((c, i) => {
    T.push(`  --color-${shortColorName(c, i)}: ${c};`);
  });
  if (colors.length) T.push("");
  fonts.forEach((f, i) => {
    const name = tokenName("font", f.split(",")[0].replace(/['"]/g, ""), i);
    T.push(`  --${name}: ${f};`);
  });
  if (fonts.length) T.push("");
  radii.forEach((r, i) => {
    T.push(`  --radius-${i + 1}: ${r};`);
  });
  if (radii.length) T.push("");
  fontSizes.forEach((s, i) => {
    T.push(`  --text-${i + 1}: ${s};`);
  });
  if (fontSizes.length) T.push("");
  spacings.forEach((s, i) => {
    T.push(`  --spacing-${i + 1}: ${s};`);
  });
  T.push("}");
  const tailwindV4 = T.join("\n") + "\n";

  // ---------- CSS Variables (:root) ----------
  const C: string[] = [];
  C.push(`/* CSS Variables — ${d.title}`);
  C.push(` * Sumber: ${d.url}`);
  C.push(` */`);
  C.push("");
  C.push(":root {");
  colors.forEach((c, i) => {
    C.push(`  --color-${i + 1}: ${c};`);
  });
  if (colors.length) C.push("");
  fonts.forEach((f, i) => {
    C.push(`  --font-${i + 1}: ${f};`);
  });
  if (fonts.length) C.push("");
  radii.forEach((r, i) => {
    C.push(`  --radius-${i + 1}: ${r};`);
  });
  if (radii.length) C.push("");
  fontSizes.forEach((s, i) => {
    C.push(`  --font-size-${i + 1}: ${s};`);
  });
  if (fontSizes.length) C.push("");
  spacings.forEach((s, i) => {
    C.push(`  --spacing-${i + 1}: ${s};`);
  });
  if (Object.keys(d.tokens.cssVars).length) {
    C.push("");
    C.push("  /* Variabel asli dari halaman sumber */");
    for (const [k, v] of Object.entries(d.tokens.cssVars)) C.push(`  ${k}: ${v};`);
  }
  C.push("}");
  const cssVariables = C.join("\n") + "\n";

  return { tailwindV4, cssVariables };
}
