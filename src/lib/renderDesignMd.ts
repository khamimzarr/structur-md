// ============================================================================
// lib/renderDesignMd.ts
// Menyusun hasil ekstraksi desain menjadi dokumen markdown standar Output 1:
// struktur hierarki tetap (Header metafora, Tokens Colors/Typography/Spacing,
// Components per peran, Do's & Don'ts, Agent Prompt Guide, Similar Brands).
// Semua warna dinormalisasi hex; spacing snap grid 4px; tanpa raw CSS dump.
// ============================================================================

import type { DesignResult } from "./designExtractor.js";

function fmtDecls(decls: Record<string, string>): string {
  const lines = Object.entries(decls).map(([k, v]) => `| \`${k}\` | \`${v}\` |`);
  return lines.join("\n");
}

export function renderDesignMd(d: DesignResult, interp?: import("./aiInterpret").DesignInterpretation | null): string {
  const L: string[] = [];
  // Heading ala refero: "# <Judul> — Style Reference" + metafora + theme.
  const title = (d.title || "Untitled").replace(/\s*[|·—-]\s*(GitHub|Homepage|Website).*$/i, "").trim() || "Untitled";
  L.push(`# ${title} — Style Reference`);
  L.push("");
  if (interp?.metaphor) {
    // metafora satu kalimat dari AI (fallback: kalimat pertama narasi)
    L.push(`> ${interp.metaphor}`);
    L.push("");
  } else if (interp?.narrative) {
    const tagline = interp.narrative.split(/(?<=[.!?])\s/)[0];
    L.push(`> ${tagline}`);
    L.push("");
  }
  if (interp?.theme) {
    L.push(`**Theme:** ${interp.theme}`);
    L.push("");
  }
  L.push(`> Ekstrak otomatis dari ${d.url}`);
  if (d.requestedUrl && d.redirected && d.requestedUrl !== d.url) L.push(`> Diminta: ${d.requestedUrl} → ${d.url}`);
  if (d.warning) { L.push(`> ⚠️ ${d.warning}`); L.push(""); }
  L.push("> Sumber pengukuran dinormalisasi; peran & rekomendasi ditafsirkan.");
  L.push("> Spacing dinormalisasi ke grid 4px; warna dinormalisasi ke HEX.");
  L.push("> Contoh HTML adalah rekonstruksi, bukan komponen sumber.");
  if (d.library) L.push(`> Styling: **${d.library}**`);
  L.push("");
  L.push("---");
  L.push("");

  // ---- Interpretasi AI (bila tersedia) ----
  if (interp) {
    L.push("## Gaya");
    L.push("");
    L.push(interp.narrative);
    L.push("");
    if (Object.keys(interp.colorRoles).length) {
      L.push("### Peran warna");
      L.push("");
      L.push("| Warna | Peran |");
      L.push("|-------|-------|");
      for (const [c, role] of Object.entries(interp.colorRoles)) {
        const named = interp.colorNames?.[c.toLowerCase()];
        L.push(`| \`${c}\`${named ? ` (\`${named}\`)` : ""} | ${role} |`);
      }
      L.push("");
    }
    if (interp.typeScale && Object.keys(interp.typeScale).length) {
      L.push("### Type Scale");
      L.push("");
      L.push("| Peran | Size | Weight | Line-height | Tracking | Kapan dipakai |");
      L.push("|-------|------|--------|-------------|----------|---------------|");
      const ORDER = ["caption", "body", "heading-sm", "heading", "heading-lg", "display"];
      for (const role of ORDER) {
        const t = interp.typeScale[role];
        if (!t) continue;
        L.push(`| **${role}** | \`${t.size}\` | ${t.weight} | ${t.lineHeight} | ${t.tracking} | ${t.role} |`);
      }
      L.push("");
    }
    if (interp.dos.length || interp.donts.length) {
      L.push("### Do & Don't");
      L.push("");
      if (interp.dos.length) {
        L.push("**Lakukan:**");
        L.push("");
        for (const x of interp.dos) L.push(`- ${x}`);
        L.push("");
      }
      if (interp.donts.length) {
        L.push("**Hindari:**");
        L.push("");
        for (const x of interp.donts) L.push(`- ${x}`);
        L.push("");
      }
    }
    if (interp.prompts.length) {
      L.push("### Agent Prompt Guide");
      L.push("");
      L.push("> Prompt siap pakai untuk AI builder (Cursor, v0, Claude) membangun section khas gaya ini.");
      L.push("");
      interp.prompts.forEach((p, i) => {
        L.push(`${i + 1}. ${p}`);
      });
      L.push("");
    }
    if (interp.similarBrands.length) {
      L.push("### Similar Brands");
      L.push("");
      for (const b of interp.similarBrands) L.push(`- ${b}`);
      L.push("");
    }
    L.push("---");
    L.push("");
  }

  // ---- Tokens: Colors (chrome & content dipisah; tanpa raw dump) ----
  L.push("## Tokens — Colors");
  L.push("");
  const renderColorTable = (colors: string[], label: string) => {
    if (!colors.length) return;
    L.push(`### ${label}`);
    L.push("");
    L.push("| Name | Hex Value | Token | Role |");
    L.push("|------|-----------|-------|------|");
    for (const c of colors) {
      const named = interp?.colorNames?.[c.toLowerCase()] ?? "—";
      const role = interp?.colorRoles?.[c.toLowerCase()] ?? "—";
      const sw = /^#([0-9a-f]{6})$/i.test(c) ? `<span style="background:${c};display:inline-block;width:16px;height:16px"></span>` : "—";
      L.push(`| ${named === "—" ? "—" : `\`${named}\``} | \`${c}\` ${sw ? `<span style="background:${c};display:inline-block;width:16px;height:16px"></span>` : ""} | ${sw ? `\`${c}\`` : `\`${c}\``} | ${role} |`);
    }
    L.push("");
  };
  renderColorTable(d.tokens.chromeColors, "UI Chrome (background, text, button, border)");
  renderColorTable(d.tokens.contentColors, "Content & Syntax Highlight");
  if (!d.tokens.chromeColors.length && !d.tokens.contentColors.length && d.tokens.colors.length) {
    // fallback: AI tak memisah — tampilkan semua sebagai chrome
    renderColorTable(d.tokens.colors, "UI Chrome (background, text, button, border)");
  }

  // ---- Tokens: Typography (families + openType + type scale fallback) ----
  if (d.tokens.fonts.length) {
    L.push("## Tokens — Typography");
    L.push("");
    L.push("### Font families");
    L.push("");
    for (const f of d.tokens.fonts) L.push(`- \`${f}\``);
    L.push("");
    if (d.tokens.fontSizes.length) {
      L.push("### Size scale terukur");
      L.push("");
      L.push("| Size |");
      L.push("|------|");
      for (const s of d.tokens.fontSizes) L.push(`| \`${s}\` |`);
      L.push("");
    }
    if (interp?.typeScale && Object.keys(interp.typeScale).length) {
      L.push("### Type scale (per peran)");
      L.push("");
      L.push("| Peran | Size | Weight | Line-height | Tracking |");
      L.push("|-------|------|--------|-------------|----------|");
      const ORDER = ["caption", "body", "heading-sm", "heading", "heading-lg", "display"];
      for (const role of ORDER) {
        const t = interp.typeScale[role];
        if (!t) continue;
        L.push(`| **${role}** | \`${t.size}\` | ${t.weight} | ${t.lineHeight} | ${t.tracking} |`);
      }
      L.push("");
    }
  }

  // ---- Tokens: Spacing & Shapes (grid 4px, tanpa nilai negatif) ----
  if (d.tokens.radius.length || d.tokens.spacing.length) {
    L.push("## Tokens — Spacing & Shapes");
    L.push("");
    L.push("> Base unit: 4px (semua spacing kelipatan grid).");
    L.push("");
    if (d.tokens.spacing.length) {
      L.push("### Spacing scale (margin/padding)");
      L.push("");
      L.push("| Value |");
      L.push("|-------|");
      for (const s of d.tokens.spacing) L.push(`| \`${s}\` |`);
      L.push("");
    }
    if (d.tokens.radius.length) {
      L.push("### Border radius");
      L.push("");
      L.push("| Value |");
      L.push("|-------|");
      for (const r of d.tokens.radius) L.push(`| \`${r}\` |`);
      L.push("");
    }
  }

  // ---- Components (per peran; sample HTML dipotong pada batas tag) ----
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
