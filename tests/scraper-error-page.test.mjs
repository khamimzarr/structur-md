// Contract test: deteksi halaman error/anti-bot di src/lib/scraper.ts.
// Regex di sini harus sinkron dengan ERROR_PAGE_PATTERNS + batas 4000 char.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/scraper.ts", import.meta.url), "utf8");
for (const frag of ["there was an error while loading", "just a moment", "ERROR_PAGE_DETECTED", "4000"]) {
  if (!src.includes(frag)) { console.error("FAIL: pola hilang dari scraper.ts:", frag); process.exit(1); }
}
const patterns = [
  /there was an error while loading\. please reload this page/i,
  /just a moment\.\.\.|enable javascript and cookies to continue|attention required!/i,
  /access to this page has been denied|you have been blocked|unusual traffic from your computer/i,
  /sign in to continue|please log in to continue|log in to continue/i,
];
function looksLikeErrorPage(text) {
  if (text.length > 4000) return null;
  for (const re of patterns) if (re.test(text)) return "detected";
  return null;
}
const gh = "Uh oh! There was an error while loading. Please reload this page. You can’t perform that action at this time.";
const cf = "Just a moment... Enable JavaScript and cookies to continue";
const login = "Log in to continue reading this article.";
const longArticle = ("an article quoting there was an error while loading. please reload this page " ).padEnd(4500, "x");
const normalPage = "This is a normal page about web scraping with lots of content.";
const checks = [
  ["github error detected", looksLikeErrorPage(gh) !== null],
  ["cloudflare detected", looksLikeErrorPage(cf) !== null],
  ["loginwall detected", looksLikeErrorPage(login) !== null],
  ["long article NOT flagged", looksLikeErrorPage(longArticle) === null],
  ["normal page NOT flagged", looksLikeErrorPage(normalPage) === null],
];
let fail = 0;
for (const [name, ok] of checks) { console.log(ok ? "PASS" : "FAIL", name); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
