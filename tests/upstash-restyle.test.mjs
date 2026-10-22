// Contract test: restyle Upstash — kanvas terang, hairline, emerald, obsidian output.
// Menjaga palet baru dan mencegah warna lama (lime #a8ff53 / dark slate) merayap balik.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

const checks = [
  // token baru
  ["canvas putih", css.includes("--color-slate-canvas: #ffffff;")],
  ["card ink-well putih", css.includes("--color-ink-well: #ffffff;")],
  ["hairline e5e7eb", css.includes("--color-steel-border: #e5e7eb;")],
  ["teks forest ink", css.includes("--color-bone-text: #022c22;")],
  ["muted graphite", css.includes("--color-fog-text: #71717a;")],
  ["emerald aksen", css.includes("--color-signal-lime: #0a6b4d;")],
  ["output obsidian", css.includes("background: #000000;") && css.includes("border-radius: 12px;")],
  ["radius card 16px", css.includes("--radius-card: 16px;")],
  ["color-scheme light", css.includes("color-scheme: light;")],
  // page
  ["CTA emerald teks putih", page.includes("bg-signal-lime text-white")],
  ["loading state Mengonversi", page.includes("Mengonversi...")],
  ["heading tracking-tight", page.includes("tracking-tight")],
  ["tab aktif emerald putih", page.includes('bg-signal-lime text-white"')],
  // layout
  ["themeColor putih", layout.includes('themeColor: "#ffffff"')],
  ["colorScheme light", layout.includes('colorScheme: "light"')],
  ["sw cache bumped", sw.includes("structur-md-v5")],
  // guard warna lama
  ["lime lama dihapus", !css.includes("#a8ff53")],
  ["pink lama dihapus", !css.includes("#fa3abf")],
  ["violet lama dihapus", !css.includes("#9c9af2")],
  ["dark canvas lama dihapus", !css.includes("#1c1e21")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
