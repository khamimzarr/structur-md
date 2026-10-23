// Contract test: semua tombol download harus via blob (downloadFromUrl), bukan
// <a href cross-origin> yang membuat browser navigasi/buka tab Supabase.
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

const checks = [
  ["helper triggerDownload ada", page.includes("const triggerDownload = (")],
  ["helper downloadFromUrl ada (fetch->blob)", page.includes("const downloadFromUrl = async (")],
  ["download utama pakai blob", page.includes("await downloadFromUrl(result.downloadUrl")],
  ["revoke objectURL (leak guard)", page.includes("URL.revokeObjectURL")],
  ["fallback buka tab saat fetch gagal", page.includes('Gagal mengunduh — dibuka di tab baru')],
  ["tombol .md per-tab jadi button", /onClick=\{\(\) =>\s*\n?\s*downloadFromUrl\(\s*result\.downloadUrl!/s.test(page)],
  ["tombol .css jadi button", !page.includes('download="tailwind-v4.css"')],
  ["tombol .json jadi button", !page.includes('download="design-tokens.json"')],
  ["extraFiles jadi button (bukan <a target=_blank>)", !/href=\{f\.downloadUrl\}/.test(page)],
  ["nama file dinamis mengikuti tab aktif", page.includes('"tailwind-v4.css"') && page.includes('"css-variables.css"')],
  ["sw cache v6", sw.includes("structur-md-v6")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
