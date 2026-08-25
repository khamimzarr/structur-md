// ============================================================================
// lib/designExtractor.ts
// Ekstraksi DESIGN dari halaman statis: baca CSS (inline + <style> + stylesheet
// eksternal), lalu rangkum menjadi "tokens" + "komponen utama" dengan nilai
// CSS terukur (padding, margin, warna hex, radius, font, dsb.) agar layout
// aslinya mudah ditiru.
//
// Tanpa headless browser (target statis). Nilai diambil dari SOURCE CSS yang
// berlaku ke selektor komponen — sesuai kebutuhan "meniru layout aslinya".
// ============================================================================

import * as cheerio from "cheerio";
import postcss from "postcss";
import { scrapeUrl } from "@/lib/scraper";

const MAX_CSS_BYTES = 2_000_000;
const MAX_LINKS = 8; // batas fetch stylesheet eksternal

// Tipe hasil
export interface DesignTokens {
  colors: string[]; // hex/oklch/rgb unik, terurut sering muncul
  cssVars: Record<string, string>; // --nama: nilai
  fonts: string[]; // font-family stacks
  radius: string[]; // nilai border-radius unik
  fontSizes: string[]; // font-size unik
  spacing: string[]; // margin/padding nilai unik
}

export interface ComponentSpec {
  name: string;
  selector: string;
  sample: string; // potongan outerHTML contoh (dipotong)
  styles: Record<string, string>; // deklarasi CSS terpilih
}

export interface DesignResult {
  url: string;
  title: string;
  library?: string; // deteksi framework styling (tailwind/emotion/styled-components/css-modules)
  tokens: DesignTokens;
  components: ComponentSpec[];
}

// Deklarasi CSS yang ingin kita ambil per komponen.
const WANTED: string[] = [
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "background", "background-color", "color",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "border", "border-radius", "border-color", "border-width",
  "width", "height", "max-width", "display", "box-shadow", "text-transform",
];

// Selektor komponen utama yang kita kenali.
interface ComponentDef {
  name: string;
  selectors: string[]; // order = prioritas
}

const COMPONENTS: ComponentDef[] = [
  { name: "Primary Button", selectors: ["button", "a.btn", ".btn", ".button", '[role="button"]'] },
  { name: "Secondary Button / Link", selectors: ["a", ".link", ".nav-link", "a.button"] },
  { name: "Text Input", selectors: ["input[type=text]", "input[type=email]", "input[type=search]", "textarea", "input"] },
  { name: "Form / Card Surface", selectors: ["form", ".card", ".panel", "section.card", "article"] },
  { name: "Navigation Bar", selectors: ["nav", "header", ".navbar", ".nav"] },
  { name: "Hero Heading", selectors: ["h1", ".hero h1", ".hero-title", ".title", ".display"] },
  { name: "Section", selectors: ["section", ".section", "main section"] },
  { name: "Footer", selectors: ["footer", ".footer", ".site-footer"] },
];

// Ambil semua stylesheet (inline <style> + <link rel=stylesheet>).
async function collectCss(html: string, baseUrl: string): Promise<string> {
  const $ = cheerio.load(html);
  let combined = "";

  // 1. <style> blocks
  $("style").each((_, el) => {
    combined += ($(el).html() || "") + "\n";
  });

  // 2. <link rel=stylesheet href>
  const links: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push(href);
  });

  let fetched = 0;
  for (const href of links) {
    if (fetched >= MAX_LINKS) break;
    try {
      const abs = new URL(href, baseUrl).toString();
      const res = await fetch(abs, {
        headers: { "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      combined += "\n" + text.slice(0, MAX_CSS_BYTES);
      fetched++;
    } catch {
      // abaikan stylesheet yang gagal
    }
  }

  return combined;
}

// Parse CSS -> rule terstruktur { selectors: string[], decls: Record<string,string> }
// Pakai postcss (toleran CSS modern: @layer, lab(), rgb(from...), dll.)
function parseRules(combined: string): { selectors: string[]; decls: Record<string, string> }[] {
  const out: { selectors: string[]; decls: Record<string, string> }[] = [];
  if (!combined.trim()) return out;
  let root;
  try {
    root = postcss.parse(combined);
  } catch {
    return out;
  }
  root.walkRules((rule) => {
    // abaikan keyframes (0%, 100%, from, to)
    if (/^(\d|from|to|@)/i.test(rule.selector.trim())) return;
    const decls: Record<string, string> = {};
    rule.walkDecls((decl) => {
      if (decl.prop && decl.value) decls[decl.prop.toLowerCase()] = decl.value.trim();
    });
    if (rule.selectors.length && Object.keys(decls).length) {
      out.push({ selectors: rule.selectors.map((s) => s.trim()), decls });
    }
  });
  return out;
}

// ============ Utilitas resolusi warna (CSS -> hex) ============
function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

// Resolve rantai var(--x) memakai peta cssVars.
function resolveVar(v: string, vars: Record<string, string>): string {
  let out = v;
  let guard = 0;
  while (guard++ < 10) {
    const next = out.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_m, name: string, fb?: string) => {
      const val = vars[name];
      return val !== undefined ? val : (fb ?? "");
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

// Warna CSS -> hex (#rrggbb / #rrggbbaa) bila memungkinkan; selain itu kembalikan nilai ternormalisasi.
function resolveColor(raw: string, vars: Record<string, string>): string {
  const v = resolveVar(raw, vars).trim().toLowerCase();
  if (!v) return raw;

  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;

  // rgb(r g b) / rgb(r g b / a) / rgba(); ruang atau koma bisa.
  const rgbm = v.match(/^rgba?\(\s*([\d.]+)\s*[,\s]+([\d.]+)\s*[,\s]+([\d.]+)\s*(?:\s*[\/,]\s*([\d.]+%?))?\s*\)$/);
  if (rgbm) {
    const r = toHex(Number(rgbm[1]));
    const g = toHex(Number(rgbm[2]));
    const b = toHex(Number(rgbm[3]));
    const a = rgbm[4];
    if (a === undefined) return `#${r}${g}${b}`;
    const pct = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
    return `#${r}${g}${b}${toHex(pct * 255)}`;
  }

  // hsl / hsla
  const hslm = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]+([\d.]+)%\s*[,\s]+([\d.]+)%\s*(?:[,\/]\s*([\d.]+%?))?\s*\)$/);
  if (hslm) {
    const H = ((Number(hslm[1]) % 360) + 360) % 360;
    const S = Number(hslm[2]) / 100;
    const L = Number(hslm[3]) / 100;
    const a = hslm[4];
    const C = (1 - Math.abs(2 * L - 1)) * S;
    const X = C * (1 - Math.abs(((H / 60) % 2) - 1));
    const mm = L - C / 2;
    const hh = H / 60;
    let r: number, g: number, b: number;
    if (hh < 1) { r = C; g = X; b = 0; }
    else if (hh < 2) { r = X; g = C; b = 0; }
    else if (hh < 3) { r = 0; g = C; b = X; }
    else if (hh < 4) { r = 0; g = X; b = C; }
    else if (hh < 5) { r = X; g = 0; b = C; }
    else { r = C; g = 0; b = X; }
    const hex = `#${toHex((r + mm) * 255)}${toHex((g + mm) * 255)}${toHex((b + mm) * 255)}`;
    if (a === undefined) return hex;
    const pct = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
    return `${hex}${toHex(pct * 255)}`;
  }

  return v;
}

function isColorProp(k: string): boolean {
  return k === "color" || k === "background" || k === "background-color" || k === "border-color" || k.endsWith("-color");
}

// Ekstrak tokens global.
function extractTokens(rules: { selectors: string[]; decls: Record<string, string> }[], $: cheerio.CheerioAPI): DesignTokens {
  const cssVars: Record<string, string> = {};
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const radius = new Set<string>();
  const fontSizes = new Set<string>();
  const spacing = new Set<string>();

  for (const rule of rules) {
    for (const sel of rule.selectors) {
      if (sel.trim() === ":root" || sel.trim().startsWith(":root")) {
        for (const [k, v] of Object.entries(rule.decls)) {
          if (k.startsWith("--")) cssVars[k] = v;
        }
      }
    }
    for (const [k, v] of Object.entries(rule.decls)) {
      if (isColorProp(k)) {
        const c = resolveColor(v, cssVars);
        if (c && c !== "transparent") colors.add(c);
        const m = v.match(/var\(--[\w-]+\)/);
        if (m) {
          const ref = cssVars[m[1]] || "";
          if (/\b(#|rgb|hsl|oklch|rgba|hsla)/i.test(ref)) colors.add(ref.toLowerCase());
        }
      }
      if (k === "font-family") fonts.add(v);
      if (k === "border-radius") radius.add(v);
      if (k === "font-size") fontSizes.add(v);
      if (/^(margin|padding)/.test(k)) spacing.add(v);
    }
  }

  // Tambahkan warna inline pada elemen (mis. style="background:#fff")
  $("[style]").each((_, el) => {
    const st = $(el).attr("style") || "";
    const m = st.match(/#([0-9a-f]{3,8})\b/gi);
    if (m) m.forEach((c) => colors.add(c.toLowerCase()));
  });

  // Resolve nilai cssVars (rantai var -> hex) supaya :root tampil #hex.
  const resolvedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(cssVars)) {
    const r = resolveColor(v, cssVars);
    resolvedVars[k] = /^#[0-9a-f]{3,8}$/.test(r) ? r : v;
  }

  // Bersihkan scale numerik.
  const toPx = (val: string): number | null => {
    const t = val.trim().toLowerCase();
    if (t.endsWith("rem") || t.endsWith("em")) return 16 * parseFloat(t);
    if (t.endsWith("px")) return parseFloat(t);
    if (/^[\d.]+$/.test(t)) return parseFloat(t);
    return null;
  };
  const cleanScale = (vals: Set<string>, drop: RegExp): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of vals) {
      for (const tok of raw.split(/\s+/).filter(Boolean)) {
        if (drop.test(tok)) continue;
        const px = toPx(tok);
        const key = px !== null ? `${Math.round(px)}px` : tok;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
      }
    }
    return out
      .map((s) => ({ s, n: parseFloat(s) || 0 }))
      .sort((a, b) => a.n - b.n)
      .map((o) => o.s)
      .slice(0, 16);
  };

  return {
    colors: Array.from(colors).filter((c) => /^#[0-9a-f]{3,8}$/.test(c)).slice(0, 24),
    cssVars: resolvedVars,
    fonts: Array.from(fonts).map((f) => f.trim()).filter((f) => f && f !== "inherit").slice(0, 12),
    radius: cleanScale(radius, /^(inherit|auto|initial)$/i),
    fontSizes: cleanScale(fontSizes, /^(inherit|auto|initial|100%|75%)$/i),
    spacing: cleanScale(spacing, /^(auto|inherit)$/i),
  };
}

// Ekstrak satu komponen: pilih elemen pertama yang cocok di DOM lalu ambil CSS
// dari selektor komponen DAN dari class utility elemen (mis. Tailwind: .px-4).
function lookupDecls(
  rules: { selectors: string[]; decls: Record<string, string> }[],
  needle: string
): Record<string, string> {
  const merged: Record<string, string> = {};
  const n = needle.toLowerCase();
  for (const rule of rules) {
    for (const s of rule.selectors) {
      const st = s.trim().toLowerCase();
      // cocok bila selektor == needle, atau diakhiri .needle (class), atau mengandung
      if (st === n || st.endsWith("." + n) || st.includes(n)) {
        for (const k of WANTED) if (rule.decls[k] && !merged[k]) merged[k] = rule.decls[k];
      }
    }
  }
  return merged;
}

function extractComponent(
  $: cheerio.CheerioAPI,
  rules: { selectors: string[]; decls: Record<string, string> }[],
  def: ComponentDef,
  cssVars: Record<string, string>
): ComponentSpec | null {
  let selUsed = "";
  let sampleEl: ReturnType<typeof $> | null = null;

  for (const sel of def.selectors) {
    let found: ReturnType<typeof $>;
    try {
      found = $(sel).first();
    } catch {
      continue;
    }
    if (found.length) {
      selUsed = sel;
      sampleEl = found;
      break;
    }
  }

  if (!sampleEl || !sampleEl.length) return null;

  // Deklarasi dari selektor komponen (mis. button{})
  const fromSelector = lookupDecls(rules, selUsed);

  // Deklarasi dari class utility elemen (Tailwind: .px-4, .bg-..., dll.)
  const cls = (sampleEl.attr("class") || "").split(/\s+/).filter(Boolean);
  const fromClasses: Record<string, string> = {};
  for (const c of cls) {
    const d = lookupDecls(rules, c);
    for (const [k, v] of Object.entries(d)) if (!fromClasses[k]) fromClasses[k] = v;
  }

  // Deklarasi inline (style="...")
  const inline: Record<string, string> = {};
  const styleAttr = sampleEl.attr("style");
  if (styleAttr) {
    for (const part of styleAttr.split(";")) {
      const i = part.indexOf(":");
      if (i <= 0) continue;
      const k = part.slice(0, i).trim().toLowerCase();
      const v = part.slice(i + 1).trim();
      if (k && v && WANTED.includes(k)) inline[k] = v;
    }
  }

  // Gabungkan: inline > class utility > selektor komponen (spesifisitas kasar)
  const decls: Record<string, string> = { ...fromSelector, ...fromClasses, ...inline };
  // Resolve warna (var(--x) + rgb() → #hex) bila ada.
  for (const [k, v] of Object.entries(decls)) {
    if (isColorProp(k)) decls[k] = resolveColor(v, cssVars);
  }

  const sampleHtml = $.html(sampleEl).slice(0, 400).replace(/\s+/g, " ");

  return { name: def.name, selector: selUsed, sample: sampleHtml, styles: decls };
}

// Deteksi framework/approach styling dari penanda HTML + pola class.
function detectLibrary(html: string, $: cheerio.CheerioAPI): string | undefined {
  const h = html.toLowerCase();
  const classStr = Array.from($("[class]"))
    .slice(0, 200)
    .map((el) => $(el).attr("class") || "")
    .join(" ");

  // Tailwind: pertaruhkan pola utility (px-/py-/p--/bg-/text-/m-/gap-/flex...) bukan kata bebas.
  if (/@tailwind|tailwindcss|(?:class|className)=\"[^\"]*\\b(?:px|py|p)-\\d/.test(h) && !/data-emotion/.test(h)) {
    return "Tailwind CSS (utility classes)";
  }
  if (/data-emotion|@emotion|emotion\.core/i.test(h)) return "Emotion (CSS-in-JS)";
  if (/data-styled|styled-components/i.test(h)) return "Styled-Components (CSS-in-JS)";
  if (classStr.split(/\s+/).some((c) => /^(css|sc)-[\w-]+$/i.test(c))) return "CSS-in-JS (hashed class)";
  if (/__[\w]+__[\w]+/i.test(classStr)) return "CSS Modules";
  return undefined;
}

export async function extractDesign(rawUrl: string): Promise<DesignResult> {
  const scraped = await scrapeUrl(rawUrl, { timeoutMs: 15000 });
  const $ = cheerio.load(scraped.mainHtml);

  const combined = await collectCss(scraped.html, scraped.url);
  const rules = parseRules(combined);
  const tokens = extractTokens(rules, $);

  const components: ComponentSpec[] = [];
  for (const def of COMPONENTS) {
    const spec = extractComponent($, rules, def, tokens.cssVars);
    if (spec) components.push(spec);
  }

  return {
    url: scraped.url,
    title: scraped.title,
    library: detectLibrary(scraped.html, $),
    tokens,
    components,
  };
}
