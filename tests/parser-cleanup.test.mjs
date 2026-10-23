// Contract test: patch parser CSS — regex spacing, value corrupt, satu tabel
// warna, filter computed style browser bawaan.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/lib/designExtractor.ts", import.meta.url), "utf8");
const rd = readFileSync(new URL("../src/lib/renderDesignMd.ts", import.meta.url), "utf8");

const checks = [
  // 1. regex spacing
  ["calc operand sanitasi (buang teks)", css.includes('p.replace(/[^\\d.+-]/g, "")')],
  ["calc gagal -> sentinel INVALID", css.includes('return "INVALID"')],
  ["cleanScale buang INVALID", css.includes('resolved === "INVALID"')],
  ["non-numerik dibuang utk spacing/radius/fontsize", css.includes('else if (kind !== "other")')],
  // 2. value corrupt & font
  ["buang <value> & kosong", css.includes('v === "<value>"')],
  ["font simplify: ambil family utama", css.includes("fv.split(\",\")")],
  ["font: pertahankan generic fallback", css.includes("generics.includes")],
  ["font: buang var dump", css.includes('fv.replace(/var\\([^)]*\\)/g, "")')],
  // 3. satu tabel warna
  ["renderer: satu tabel gabungan", rd.includes("| Name | Hex Value | Role |")],
  ["renderer: tabel terpisah dihapus", !rd.includes("### UI Chrome (background")],
  ["renderer: buang warna tanpa role", rd.includes("if (!r) return;")],
  ["renderer: tidak ada tabel Name|Hex Value|Token|Role lama", !rd.includes("Name | Hex Value | Token | Role")],
  // 4. computed style browser
  ["filter display: list-item dsb", css.includes("list-item|table-footer-group")],
  ["filter text-transform: none", css.includes('"text-transform": /^(none)$/')],
  ["filter border-width medium", css.includes("medium|thin|thick")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
