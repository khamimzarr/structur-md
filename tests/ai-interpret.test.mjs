// Contract test: lapisan interpretasi AI (aiInterpret) + render DESIGN.md.
import { readFileSync } from "node:fs";

const ai = readFileSync(new URL("../src/lib/aiInterpret.ts", import.meta.url), "utf8");
const rd = readFileSync(new URL("../src/lib/renderDesignMd.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/app/api/design/route.ts", import.meta.url), "utf8");

const checks = [
  ["agnes-3.0-flash model", /agnes-3\.0-flash/.test(ai)],
  ["env AGNES_API_KEY dipakai", ai.includes("AGNES_API_KEY")],
  ["retryable 429/5xx", /429/.test(ai) && />= 500/.test(ai)],
  ["non-fatal: return null saat gagal", ai.includes("return null")],
  ["JSON extraction dengan fence guard", ai.includes("```")],
  ["prompt minta Bahasa Indonesia", ai.includes("Bahasa Indonesia")],
  ["renderDesignMd menerima interp", rd.includes("interp?")],
  ["section Gaya di DESIGN.md", rd.includes("## Gaya")],
  ["Agent Prompt Guide di DESIGN.md", rd.includes("Agent Prompt Guide")],
  ["Do & Don't di DESIGN.md", rd.includes("Do & Don't")],
  ["api/design memanggil interpretDesign", api.includes("interpretDesign")],
  ["api/design kirim hasAi", api.includes("hasAi")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
