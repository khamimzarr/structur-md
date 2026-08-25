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
      // Warna: ambil literal (#/rgb/hsl/oklch) MAUPUN nilai var() yang merujuk ke hex.
      if (/(^|[- ])color$/.test(k)) {
        if (/\b(#|rgb|hsl|oklch|rgba|hsla)/i.test(v)) colors.add(v.toLowerCase());
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

  const sortByFreq = (set: Set<string>) => Array.from(set).slice(0, 24);

  return {
    colors: sortByFreq(colors),
    cssVars,
    fonts: Array.from(fonts).slice(0, 12),
    radius: Array.from(radius).slice(0, 12),
    fontSizes: Array.from(fontSizes).slice(0, 16).sort((a, b) => {
      const na = parseFloat(a); const nb = parseFloat(b);
      return na - nb;
    }),
    spacing: Array.from(spacing).slice(0, 16).sort((a, b) => parseFloat(a) - parseFloat(b)),
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
  def: ComponentDef
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
    const spec = extractComponent($, rules, def);
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
