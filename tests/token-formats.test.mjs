// Contract test: format token terpisah (Tailwind v4 & CSS Variables)
// untuk fitur tab output DESIGN.md / Tailwind v4 / CSS Variables.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/renderTokens.ts", import.meta.url), "utf8");

const checks = [
  ["@theme block (Tailwind v4)", src.includes('"@theme {"}') || src.includes("@theme {")],
  [":root block (CSS Variables)", src.includes(":root {")],
  ["--color- prefix tailwind", src.includes("--color-")],
  ["--radius- prefix", src.includes("--radius-")],
  ["--spacing- prefix", src.includes("--spacing-")],
  ["asli vars dari halaman disertakan", src.includes("cssVars")],
];

// API design harus mengembalikan formats + extraFiles
const api = readFileSync(new URL("../src/app/api/design/route.ts", import.meta.url), "utf8");
checks.push(["API design kirim formats", api.includes("formats:")]);
checks.push(["API design kirim extraFiles", api.includes("extraFiles")]);
checks.push(["tailwind-v4.css format", api.includes('"tailwind-v4.css"')]);
checks.push(["css-variables.css format", api.includes('"css-variables.css"')]);

// UI: tab baru
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
checks.push(["tab Tailwind v4 di UI", page.includes("Tailwind v4")]);
checks.push(["tab CSS Variables di UI", page.includes("CSS Variables")]);
checks.push(["extraFiles dirender di UI", page.includes("extraFiles")]);

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
