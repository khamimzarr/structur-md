// Contract test: format refero lengkap — tokens JSON W3C, heading Style
// Reference, nama warna bermakna via AI.
import { readFileSync } from "node:fs";

const tj = readFileSync(new URL("../src/lib/renderTokensJson.ts", import.meta.url), "utf8");
const ai = readFileSync(new URL("../src/lib/aiInterpret.ts", import.meta.url), "utf8");
const rd = readFileSync(new URL("../src/lib/renderDesignMd.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/app/api/design/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const checks = [
  ["W3C $value/$type/$description", tj.includes("$value") && tj.includes("$type") && tj.includes("$description")],
  ["group color/font/dimension/borderRadius", tj.includes("borderRadius") && tj.includes("dimension")],
  ["AI colorNames dipakai untuk naming", tj.includes("colorNames")],
  ["fallback color-N tanpa AI", tj.includes("color-${i + 1}") || tj.includes("`color-${i + 1}`")],
  ["AI minta theme + colorNames", ai.includes("colorNames") && ai.includes('"theme"')],
  ["heading Style Reference", rd.includes("— Style Reference")],
  ["disclaimers ala refero", rd.includes("ditafsirkan") && rd.includes("rekonstruksi")],
  ["Peran warna bawa nama token", rd.includes("colorNames?.[c.toLowerCase()]")],
  ["API kirim design-tokens.json", api.includes('"design-tokens.json"')],
  ["API teruskan colorNames ke renderer", api.includes("colorNames: interp?.colorNames")],
  ["tab Design Tokens di UI", page.includes("Design Tokens")],
  ["tombol .json amber di UI", page.includes("token-amber") && page.includes(".json")],
  ["token warna amber di css", css.includes("--color-token-amber")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
