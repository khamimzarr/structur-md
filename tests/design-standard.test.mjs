// Contract test: standarisasi output — normalisasi oklch->hex, snap grid 4px,
// pemisahan chrome/content, struktur Output 1, sample HTML utuh.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/lib/designExtractor.ts", import.meta.url), "utf8");
const rd = readFileSync(new URL("../src/lib/renderDesignMd.ts", import.meta.url), "utf8");
const ai = readFileSync(new URL("../src/lib/aiInterpret.ts", import.meta.url), "utf8");

const checks = [
  // konversi warna modern
  ["convertModernColor oklch ada", css.includes("function convertModernColor")],
  ["oklch branch", css.includes("oklch\\(")],
  ["oklab branch", css.includes("oklab\\(")],
  ["lab branch (D50->D65)", css.includes("D50") || css.includes("0.9642")],
  ["lch branch", css.includes("lch\\(")],
  ["gamma precedence benar", css.includes("Math.round((c <= 0.0031308")],
  // spacing
  ["snapGrid 4px", css.includes("Math.round(px / 4) * 4")],
  ["buang spacing negatif", css.includes("if (px < 0 || px > 400) return null")],
  ["spacing dipanggil kind spacing", css.includes('"spacing"')],
  // chrome vs content
  ["interface chromeColors", css.includes("chromeColors: string[]")],
  ["interface contentColors", css.includes("contentColors: string[]")],
  ["heuristik syntax selector", css.includes("SYNTAX_SEL")],
  // sample html utuh
  ["cutSample batas tag", css.includes("cutSample")],
  ["stack tag tutup", css.includes("stack.reverse")],
  // struktur Output 1 di renderer
  ["header metafora", rd.includes("interp?.metaphor")],
  ["tabel token 4 kolom", rd.includes("Name | Hex Value | Token | Role")],
  ["type scale per peran", rd.includes("caption") && rd.includes("display")],
  ["spacing base unit 4px", rd.includes("Base unit: 4px")],
  ["chrome vs content table", rd.includes("UI Chrome") && rd.includes("Content & Syntax Highlight")],
  ["similar brands section", rd.includes("Similar Brands")],
  ["tanpa raw :root dump", !rd.includes("## Tokens — CSS Variables")],
  // prompt AI
  ["prompt minta metafora", ai.includes('"metaphor"')],
  ["prompt minta similarBrands", ai.includes('"similarBrands"')],
  ["prompt minta typeScale 6 peran", ai.includes('"heading-lg"') && ai.includes('"caption"')],
  ["chrome vs content di prompt", ai.includes("Chrome:") && ai.includes("Content/Syntax:")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
