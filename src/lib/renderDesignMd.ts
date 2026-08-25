// ============================================================================
// lib/renderDesignMd.ts
// Menyusun hasil ekstraksi desain menjadi dokumen markdown yang menyerupai
// format DESING.md (tokens terstruktur + komponen dengan nilai CSS terukur).
// ============================================================================

import type { DesignResult } from "./designExtractor.js";

function fmtDecls(decls: Record<string, string>): string {
  const lines = Object.entries(decls).map(([k, v]) => `| \`${k}\` | \`${v}\` |`);
  return lines.join("\n");
}

export function renderDesignMd(d: DesignResult): string {
  const L: string[] = [];
  L.push(`# DESIGN.md — ${d.title}`);
  L.push("");
  L.push(`> Ekstrak otomatis dari ${d.url}`);
  L.push("> Nilai CSS di bawah diambil dari source stylesheet & inline style halaman.");
  L.push("");
  L.push("---");
  L.push("");

  // ---- Tokens: Colors ----
  L.push("## Tokens — Colors");
  L.push("");
  if (d.tokens.colors.length) {
    L.push("| Value | Swatch |");
    L.push("|-------|--------|");
    for (const c of d.tokens.colors) {
      const sw = /^#([0-9a-f]{6})$/i.test(c) ? c : "";
      L.push(`| \`${c}\` | ${sw ? `<span style="background:${c};display:inline-block;width:16px;height:16px"></span>` : "—"} |`); // md tabel, swatch bg
    }
    L.push("");
  }

  // ---- Tokens: CSS Variables ----
  if (Object.keys(d.tokens.cssVars).length) {
    L.push("## Tokens — CSS Variables (`:root`)");
    L.push("");
    L.push("```css");
    L.push(":root {");
    for (const [k, v] of Object.entries(d.tokens.cssVars)) L.push(`  ${k}: ${v};`);
    L.push("}");
    L.push("```");
    L.push("");
  }

  // ---- Tokens: Fonts ----
  if (d.tokens.fonts.length) {
    L.push("## Tokens — Typography");
    L.push("");
    L.push("### Font families");
    L.push("");
    for (const f of d.tokens.fonts) L.push(`- \`${f}\``);
    L.push("");
    if (d.tokens.fontSizes.length) {
      L.push("### Font size scale");
      L.push("");
      L.push("| Size |");
      L.push("|------|");
      for (const s of d.tokens.fontSizes) L.push(`| \`${s}\` |`);
      L.push("");
    }
  }

  // ---- Tokens: Radius & Spacing ----
  if (d.tokens.radius.length || d.tokens.spacing.length) {
    L.push("## Tokens — Shapes & Spacing");
    L.push("");
    if (d.tokens.radius.length) {
      L.push("### Border radius");
      L.push("");
      L.push("| Value |");
      L.push("|-------|");
      for (const r of d.tokens.radius) L.push(`| \`${r}\` |`);
      L.push("");
    }
    if (d.tokens.spacing.length) {
      L.push("### Spacing (margin/padding)");
      L.push("");
      L.push("| Value |");
      L.push("|-------|");
      for (const s of d.tokens.spacing) L.push(`| \`${s}\` |`);
      L.push("");
    }
  }

  // ---- Components ----
  L.push("## Components");
  L.push("");
  L.push("> Nilai CSS terukur dari selektor komponen — pakai untuk meniru layout.");
  L.push("");
  for (const c of d.components) {
    L.push(`### ${c.name}  \`(${c.selector})\``);
    L.push("");
    if (c.sample) {
      L.push("**Contoh markup:**");
      L.push("");
      L.push("```html");
      L.push(c.sample);
      L.push("```");
      L.push("");
    }
    if (Object.keys(c.styles).length) {
      L.push("**Nilai CSS terukur:**");
      L.push("");
      L.push("| Property | Value |");
      L.push("|----------|-------|");
      L.push(fmtDecls(c.styles));
      L.push("");
    } else {
      L.push("_Tidak ada deklarasi CSS terdeteksi untuk selektor ini (mungkin pakai utility class eksternal)._");
      L.push("");
    }
  }

  L.push("---");
  L.push("");
  L.push(`*Dihasilkan oleh structur-md dari ${d.url}*`);

  return L.join("\n") + "\n";
}
