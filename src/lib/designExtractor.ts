// ============================================================================
// lib/designExtractor.ts
// Ekstraksi DESIGN dari halaman statis: baca CSS (inline + <style> + stylesheet
// eksternal), lalu rangkum menjadi "tokens" + "komponen utama" dengan nilai
// CSS terukur (padding, margin, warna hex, radius, font, dsb.) agar layout
// aslinya mudah ditiru.
//
// Tanpa headless browser (target statis). Nilai diambil dari SOURCE CSS yang
// berlaku ke selektor komponen — sesuai kebutuhan "meniru layout aslinya".
// FIX: resolve calc(var(--spacing)*N), dedup warna, radius full, heuristik komponen.
// ============================================================================

import * as cheerio from "cheerio";
import postcss from "postcss";
import { scrapeUrl } from "@/lib/scraper";
import { collectCss } from "@/lib/cssCollector";

const MAX_LINKS = 8;

export interface DesignTokens {
  colors: string[];
  chromeColors: string[]; // UI chrome: background, text, button, border
  contentColors: string[]; // content & syntax highlight (blok kode, hl)
  cssVars: Record<string, string>;
  fonts: string[];
  radius: string[];
  fontSizes: string[];
  spacing: string[];
}

export interface ComponentSpec {
  name: string;
  selector: string;
  sample: string;
  styles: Record<string, string>;
}

export interface DesignResult {
  url: string;
  title: string;
  requestedUrl?: string;
  finalUrl?: string;
  redirected?: boolean;
  warning?: string;
  library?: string;
  tokens: DesignTokens;
  components: ComponentSpec[];
  css?: string; // CSS mentah gabungan (untuk file tailwind.css/styles.css terpisah)
  cssSources?: string[];
}

const WANTED: string[] = [
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "background", "background-color", "color",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "border", "border-radius", "border-color", "border-width",
  "width", "height", "max-width", "display", "box-shadow", "text-transform",
];

interface ComponentDef {
  name: string;
  selectors: string[];
}

const COMPONENTS: ComponentDef[] = [
  { name: "Primary Button", selectors: ["a.bg-black", "a.inline-flex.bg-black", "button.bg-black", "a.btn", ".btn", ".button", 'a[class*="bg-black"]', "button", '[role="button"]'] },
  { name: "Secondary Button / Link", selectors: ["a.border", "a[class*='border-black']", "a", ".link", ".nav-link"] },
  { name: "Text Input", selectors: ["input[type=text]", "input[type=email]", "input[type=search]", "textarea", "input"] },
  { name: "Form / Card Surface", selectors: ["form", ".card", ".panel", "section.card", "article"] },
  { name: "Navigation Bar", selectors: ["header", "nav", ".navbar", ".nav"] },
  { name: "Hero Heading", selectors: ["h1", ".hero h1", ".hero-title", ".title", ".display"] },
  { name: "Section", selectors: ["section", ".section", "main section"] },
  { name: "Footer", selectors: ["footer", ".footer", ".site-footer"] },
];

async function collectCssOld(html: string, baseUrl: string): Promise<string> {
  const { combined } = await collectCss(html, baseUrl);
  return combined;
}

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

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

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

function resolveColor(raw: string, vars: Record<string, string>): string {
  const v = resolveVar(raw, vars).trim().toLowerCase();
  if (!v) return raw;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
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
  // warna modern: oklch/oklab/lab/lch -> hex
  const modern = convertModernColor(v);
  if (modern) return modern;
  return v;
}

// --- Konversi warna modern (oklch/oklab/lab/lch) ke hex ---
// Referensi D65, gamma sRGB. Akurasi cukup untuk referensi desain (bukan colorimetry).
function gammapartial(r: number, g: number, b: number): string | null {
  const to = (v: number) => {
    const c = Math.max(0, Math.min(1, v));
    return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  };
  const R = to(r), G = to(g), B = to(b);
  if ([R, G, B].some((x) => isNaN(x) || x < 0 || x > 255)) return null;
  return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
}
function convertModernColor(v: string): string | null {
  let m = v.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:[\/,]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const L = parseFloat(m[1]) > 1 ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const C = parseFloat(m[2]);
    const Hdeg = parseFloat(m[3]);
    const hr = (Hdeg * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss;
    const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss;
    const bb = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss;
    const res = gammapartial(r, g, bb);
    return res ? (m[4] !== undefined && m[4] !== "1" ? res : res) : null;
  }
  m = v.match(/^oklab\(\s*([\d.]+)%?\s+([\d.-]+)\s+([\d.-]+)\s*(?:[\/,]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const L = parseFloat(m[1]) > 1 ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const a = parseFloat(m[2]);
    const b = parseFloat(m[3]);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss;
    const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss;
    const bb = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss;
    return gammapartial(r, g, bb);
  }
  m = v.match(/^lab\(\s*([\d.]+)%?\s+([\d.-]+)%?\s+([\d.-]+)%?\s*(?:[\/,]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    // D50 -> D65 (Bradford, approx) lalu XYZ -> sRGB
    const L = parseFloat(m[1]);
    const A = parseFloat(m[2]);
    const B = parseFloat(m[3]);
    const fy = (L + 16) / 116;
    const fx = fy + A / 500;
    const fz = fy - B / 200;
    const xr = fx ** 3 > 0.008856 ? fx ** 3 : (fx - 16 / 116) / 7.787;
    const yr = L > 8 ? fy ** 3 : L / 903.3;
    const zr = fz ** 3 > 0.008856 ? fz ** 3 : (fz - 16 / 116) / 7.787;
    // D50 white (0.9642,1.0,0.8249) -> D65
    const X = xr * 0.9642, Y = yr, Z = zr * 0.8249;
    const r = X * 3.0454273 + Y * -1.1593862 + Z * -0.0837442;
    const g = X * -0.1136995 + Y * 1.0159506 + Z * 0.0681299;
    const bb = X * -0.0119251 + Y * -0.0253035 + Z * 1.1477583;
    return gammapartial(r, g, bb);
  }
  m = v.match(/^lch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/);
  if (m) {
    const L = parseFloat(m[1]);
    const C = parseFloat(m[2]);
    const Hdeg = parseFloat(m[3]);
    const hr = (Hdeg * Math.PI) / 180;
    return convertModernColor(`lab(${L} ${C * Math.cos(hr)} ${C * Math.sin(hr)})`);
  }
  return null;
}

function isColorProp(k: string): boolean {
  return k === "color" || k === "background" || k === "background-color" || k === "border-color" || k.endsWith("-color");
}

function extractTokens(rules: { selectors: string[]; decls: Record<string, string> }[], $: cheerio.CheerioAPI): DesignTokens {
  const cssVars: Record<string, string> = {};
  const colors = new Set<string>();
  const chrome = new Set<string>();
  const content = new Set<string>();
  const fonts = new Set<string>();
  const radius = new Set<string>();
  const fontSizes = new Set<string>();
  const spacing = new Set<string>();
  const SYNTAX_SEL = /\b(code|pre|hl|highlight|syntax|token|katex|hljs|prism|shiki)\b/i;

  for (const rule of rules) {
    for (const sel of rule.selectors) {
      if (sel.trim() === ":root" || sel.trim().startsWith(":root")) {
        for (const [k, v] of Object.entries(rule.decls)) {
          if (k.startsWith("--")) cssVars[k] = v;
        }
      }
    }
    const isSyntax = rule.selectors.some((sel) => SYNTAX_SEL.test(sel));
    for (const [k, v] of Object.entries(rule.decls)) {
      if (isColorProp(k)) {
        const c = resolveColor(v, cssVars);
        if (c && c !== "transparent") {
          colors.add(c);
          if (isSyntax) content.add(c); else chrome.add(c);
        }
        const m = v.match(/var\(--[\w-]+\)/);
        if (m) {
          const ref = cssVars[m[1]] || "";
          if (/\b(#|rgb|hsl|oklch|rgba|hsla)/i.test(ref)) {
            const rc = resolveColor(ref, cssVars);
            colors.add(rc);
            if (isSyntax) content.add(rc); else chrome.add(rc);
          }
        }
      }
      if (k === "font-family") fonts.add(v);
      if (k === "border-radius") radius.add(v);
      if (k === "font-size") fontSizes.add(v);
      if (/^(margin|padding)/.test(k)) spacing.add(v);
    }
  }

  $("[style]").each((_, el) => {
    const st = $(el).attr("style") || "";
    const m = st.match(/#([0-9a-f]{3,8})\b/gi);
    if (m) m.forEach((c) => { colors.add(c.toLowerCase()); chrome.add(c.toLowerCase()); });
  });

  const resolvedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(cssVars)) {
    const r = resolveColor(v, cssVars);
    resolvedVars[k] = /^#[0-9a-f]{3,8}$/.test(r) ? r : v;
  }

  // --- resolve calc(var(--spacing)*N) etc ---
  const resolveForScale = (raw: string): string => {
    let v = resolveVar(raw, cssVars).trim();
    // replace all calc(...) inner
    v = v.replace(/calc\(([^)]+)\)/gi, (_all, inner: string) => {
      let expr: string = resolveVar(inner, cssVars).trim();
      if (/infinity/i.test(expr)) return "9999px";
      // handle multiplication: "0.25rem * 9" or ".25rem*9"
      if (expr.includes("*")) {
        const parts = expr.split("*").map((s) => s.trim()).filter(Boolean);
        let acc = 1;
        let hasPx = false;
        let ok = true;
        for (const p of parts) {
          if (p.endsWith("rem") || p.endsWith("em")) {
            const n = parseFloat(p);
            if (isNaN(n)) { ok = false; break; }
            acc *= n * 16;
            hasPx = true;
          } else if (p.endsWith("px")) {
            const n = parseFloat(p);
            if (isNaN(n)) { ok = false; break; }
            acc *= n;
            hasPx = true;
          } else {
            const n = parseFloat(p);
            if (isNaN(n)) { ok = false; break; }
            acc *= n;
          }
        }
        if (ok) return hasPx ? `${Math.round(acc)}px` : String(Math.round(acc));
        return expr;
      }
      // single value like "0.25rem" or "16px"
      const t = expr.trim();
      if (t.endsWith("rem") || t.endsWith("em")) {
        const n = parseFloat(t);
        if (!isNaN(n)) return `${Math.round(n * 16)}px`;
      }
      return expr;
    });
    if (/^[0-9.]+r?em$/.test(v.trim())) {
      const n = parseFloat(v);
      if (!isNaN(n)) return `${Math.round(n * 16)}px`;
    }
    if (/e\+/.test(v)) return "9999px";
    return v;
  };

  const toPx = (val: string): number | null => {
    const t = val.trim().toLowerCase();
    if (t === "full") return 9999;
    if (t.endsWith("rem") || t.endsWith("em")) return 16 * parseFloat(t);
    if (t.endsWith("px")) return parseFloat(t);
    if (/^[0-9.]+$/.test(t)) return parseFloat(t);
    return null;
  };

  // snap px ke grid kelipatan 4px (spacing system), buang layout-hack & clamp
  const snapGrid = (px: number): number | null => {
    if (px < 0 || px > 400) return null; // spacing negatif = layout hack; > 400 = ukuran kontainer, bukan spacing
    const snapped = Math.round(px / 4) * 4;
    return snapped === 0 ? null : Math.max(4, snapped);
  };
  const cleanScale = (vals: Set<string>, drop: RegExp, kind: "spacing" | "other"): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of vals) {
      const resolved = resolveForScale(raw);
      if (!resolved || /--tw-/.test(resolved)) continue;
      for (const tok of resolved.split(/\s+/).filter(Boolean)) {
        if (drop.test(tok)) continue;
        if (/--tw-/.test(tok)) continue;
        if (/e\+/.test(tok)) continue;
        let key = tok;
        const px = toPx(tok);
        if (px !== null) {
          if (px >= 9999) key = "full";
          else if (kind === "spacing") {
            const snapped = snapGrid(px);
            if (snapped === null) continue; // buang negatif/hack/oversize
            key = `${snapped}px`;
          } else key = `${Math.round(px)}px`;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
      }
    }
    return out
      .map((s) => ({ s, n: s === "full" ? 9999 : parseFloat(s) || 0 }))
      .sort((a, b) => a.n - b.n)
      .map((o) => o.s)
      .slice(0, 16);
  };

  // dedup colors: normalize #fff/#rgba/#rrggbbaa, buang alpha tipis
  const normalizeHex = (c: string): string | null => {
    c = c.toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    if (/^#[0-9a-f]{4}$/.test(c)) {
      const a = parseInt(c[3] + c[3], 16);
      if (a < 0x40) return null;
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    if (/^#[0-9a-f]{8}$/.test(c)) {
      const a = parseInt(c.slice(7, 9), 16);
      if (a < 0x40) return null;
      return c.slice(0, 7);
    }
    return null;
  };
  const deduped = new Set<string>();
  for (const c of colors) {
    const n = normalizeHex(c);
    if (n) deduped.add(n);
  }

  const allDeduped = Array.from(deduped);
  const chromeNorm = new Set(chrome);
  const contentNorm = new Set(content);
  return {
    colors: allDeduped.slice(0, 24),
    chromeColors: allDeduped.filter((c) => chromeNorm.has(c) && !contentNorm.has(c)).slice(0, 16),
    contentColors: allDeduped.filter((c) => contentNorm.has(c)).slice(0, 12),
    cssVars: resolvedVars,
    fonts: Array.from(fonts).map((f) => f.trim()).filter((f) => f && f !== "inherit").slice(0, 12),
    radius: cleanScale(radius, /^(inherit|auto|initial)$/i, "other"),
    fontSizes: cleanScale(fontSizes, /^(inherit|auto|initial|100%|75%)$/i, "other"),
    spacing: cleanScale(spacing, /^(auto|inherit)$/i, "spacing"),
  };
}

function lookupDecls(
  rules: { selectors: string[]; decls: Record<string, string> }[],
  needle: string
): Record<string, string> {
  const merged: Record<string, string> = {};
  const n = needle.toLowerCase();
  for (const rule of rules) {
    for (const s of rule.selectors) {
      const st = s.trim().toLowerCase().replace(/\\/g, "");
      if (st === n || st.endsWith("." + n) || st.includes(n)) {
        for (const k of WANTED) if (rule.decls[k] && !merged[k]) merged[k] = rule.decls[k];
      }
    }
  }
  return merged;
}

// Tailwind arbitrary: text-[52px], bg-[#c4c3b6], etc -> decls
function arbitraryToDecls(cls: string): Record<string, string> {
  const d: Record<string, string> = {};
  let m: RegExpMatchArray | null;
  if ((m = cls.match(/^text-\[(\d+(?:\.\d+)?(?:px|rem|em))\]$/))) d["font-size"] = m[1];
  else if ((m = cls.match(/^bg-\[(#[0-9a-f]{3,8})\]$/i))) d["background-color"] = m[1].toLowerCase();
  else if ((m = cls.match(/^border-\[(#[0-9a-f]{3,8})\]$/i))) d["border-color"] = m[1].toLowerCase();
  else if ((m = cls.match(/^w-\[(\d+(?:\.\d+)?(?:px|rem|%))\]$/))) d["width"] = m[1];
  else if ((m = cls.match(/^h-\[(\d+(?:\.\d+)?(?:px|rem|%))\]$/))) d["height"] = m[1];
  else if ((m = cls.match(/^rounded-\[(\d+(?:\.\d+)?(?:px|rem))\]$/))) d["border-radius"] = m[1];
  else if (cls === "rounded-full") d["border-radius"] = "full";
  else if ((m = cls.match(/^p-\[(\d+(?:\.\d+)?(?:px|rem))\]$/))) d["padding"] = m[1];
  else if ((m = cls.match(/^px-\[(\d+(?:\.\d+)?(?:px|rem))\]$/))) { d["padding-left"] = m[1]; d["padding-right"] = m[1]; }
  else if ((m = cls.match(/^py-\[(\d+(?:\.\d+)?(?:px|rem))\]$/))) { d["padding-top"] = m[1]; d["padding-bottom"] = m[1]; }
  return d;
}

function scoreElement($el: cheerio.Cheerio<any>): number {
  const cls = ($el.attr("class") || "");
  const tokens = cls.split(/\s+/);
  let score = 0;
  // hidden penalize
  if (tokens.includes("hidden")) score -= 8;
  if (cls.includes("md:hidden")) score -= 6;
  if (tokens.includes("sr-only")) score -= 20;
  // visible flex etc boost
  if (tokens.includes("flex") || cls.includes("inline-flex")) score += 2;
  // has bg/border/rounded -> likely real component
  if (/bg-\[|bg-(white|black|slate|gray|putty|bone)|background/.test(cls)) score += 3;
  if (/rounded|border/.test(cls)) score += 2;
  if (/px-|py-|p-|gap-/.test(cls)) score += 1;
  // text length: longer text more likely real button (burger has empty)
  const txt = $el.text().trim();
  if (txt.length > 2 && txt.length < 80) score += 3;
  if (txt.length === 0) score -= 2;
  // aria/label
  if ($el.attr("aria-label")?.toLowerCase().includes("menu")) score -= 5;
  if ($el.attr("href") && $el.attr("href") !== "#") score += 1;
  return score;
}

function extractComponent(
  $: cheerio.CheerioAPI,
  rules: { selectors: string[]; decls: Record<string, string> }[],
  def: ComponentDef,
  cssVars: Record<string, string>
): ComponentSpec | null {
  let best: { el: cheerio.Cheerio<any>; sel: string; score: number } | null = null;

  for (const sel of def.selectors) {
    let found: cheerio.Cheerio<any>;
    try {
      found = $(sel) as unknown as cheerio.Cheerio<any>;
    } catch {
      continue;
    }
    if (!found.length) continue;
    // evaluate up to first 5 candidates for this selector
    const candidates = found.slice(0, 5);
    candidates.each((_, el) => {
      const $el = $(el) as unknown as cheerio.Cheerio<any>;
      const s = scoreElement($el) + (def.selectors.indexOf(sel) === 0 ? 1 : 0);
      const cur = best as { score: number } | null;
      if (!cur || s > cur.score) best = { el: $el, sel, score: s };
    });
    if ((best as unknown as { score: number } | null)?.score !== undefined && (best as unknown as { score: number }).score >= 4) break; // good enough
  }

  if (!best) {
    for (const sel of def.selectors) {
      try {
        const f = $(sel).first();
        if (f.length) { best = { el: f as unknown as cheerio.Cheerio<any>, sel, score: 0 }; break; }
      } catch {}
    }
  }
  if (!best) return null;
  const sampleEl = best.el;
  const selUsed = best.sel;

  const fromSelector = lookupDecls(rules, selUsed);
  const cls = (sampleEl.attr("class") || "").split(/\s+/).filter(Boolean);
  const fromClasses: Record<string, string> = {};
  for (const c of cls) {
    const d = lookupDecls(rules, c);
    for (const [k, v] of Object.entries(d)) if (!fromClasses[k]) fromClasses[k] = v;
    const arb = arbitraryToDecls(c);
    for (const [k, v] of Object.entries(arb)) if (!fromClasses[k]) fromClasses[k] = v;
  }
  // responsive md:text-[52px] -> extract largest text-[] as font-size
  const textSizes = cls.map((c) => c.match(/(?:^|:)(text-\[(\d+(?:\.\d+)?px)\])/)?.[2]).filter(Boolean) as string[];
  if (textSizes.length) {
    const biggest = textSizes.map((s) => parseFloat(s)).sort((a, b) => b - a)[0];
    const biggestStr = textSizes.find((s) => parseFloat(s) === biggest)!;
    if (!fromClasses["font-size"] || parseFloat(fromClasses["font-size"]) < biggest) {
      fromClasses["font-size"] = biggestStr;
    }
  }

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

  const decls: Record<string, string> = { ...fromSelector, ...fromClasses, ...inline };
  for (const [k, v] of Object.entries(decls)) {
    if (isColorProp(k)) decls[k] = resolveColor(v, cssVars);
    if (v === "full" && k === "border-radius") decls[k] = "9999px";
  }
  // resolve calc(var(--spacing)*N) inside component decls too
  for (const [k, v] of Object.entries(decls)) {
    if (/calc|var\(/.test(v)) {
      let nv = resolveVar(v, cssVars);
      nv = nv.replace(/calc\(([^)]+)\)/gi, (_all, inner: string) => {
        let expr: string = resolveVar(inner, cssVars).trim();
        if (/infinity/i.test(expr)) return "9999px";
        if (expr.includes("*")) {
          const parts = expr.split("*").map((s) => s.trim());
          let acc = 1; let hasPx = false;
          for (const p of parts) {
            if (p.endsWith("rem") || p.endsWith("em")) { acc *= parseFloat(p) * 16; hasPx = true; }
            else if (p.endsWith("px")) { acc *= parseFloat(p); hasPx = true; }
            else acc *= parseFloat(p) || 1;
          }
          return hasPx ? `${Math.round(acc)}px` : String(Math.round(acc));
        }
        return expr;
      });
      if (/^[0-9.]+rem$/.test(nv.trim())) nv = `${Math.round(parseFloat(nv) * 16)}px`;
      if (/e\+/.test(nv)) nv = "9999px";
      decls[k] = nv;
    }
  }

  // Potong sample pada batas tag agar tidak ada markup yang putus di tengah.
  const cutSample = (html: string, max: number): string => {
    if (html.length <= max) return html;
    let cut = html.slice(0, max);
    const lastGt = cut.lastIndexOf(">");
    if (lastGt > max * 0.5) cut = cut.slice(0, lastGt + 1);
    // tutup tag yang masih terbuka (stack sederhana)
    const stack: string[] = [];
    for (const m of cut.matchAll(/<(\/)?([\w-]+)(?:\s[^>]*)?(\/?)>/g)) {
      if (m[3] === "/" || /^(br|hr|img|input|meta|link|source)$/i.test(m[2])) continue;
      if (m[1]) { const i = stack.lastIndexOf(m[2]); if (i >= 0) stack.splice(i, 1); }
      else stack.push(m[2]);
    }
    for (const tag of stack.reverse()) cut += `</${tag}>`;
    return cut;
  };
  const sampleHtml = cutSample($.html(sampleEl).replace(/\s+/g, " "), 400);
  return { name: def.name, selector: selUsed, sample: sampleHtml, styles: decls };
}

function detectLibrary(html: string, $: cheerio.CheerioAPI): string | undefined {
  const h = html.toLowerCase();
  const classStr = Array.from($("[class]"))
    .slice(0, 200)
    .map((el) => $(el).attr("class") || "")
    .join(" ");
  if (/@tailwind|tailwindcss|(?:class|className)=\"[^\"]*\b(?:px|py|p)-\d/.test(h) && !/data-emotion/.test(h)) {
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
  const redirected = scraped.redirected;
  const requestedUrl = scraped.requestedUrl;
  const finalUrl = scraped.finalUrl;
  let warning: string | undefined;
  if (redirected) {
    try {
      const p = new URL(finalUrl).pathname;
      if (/\/(login|signin|sign-in|auth|register)/i.test(p)) {
        warning = "Halaman dialihkan ke login — DESIGN diambil dari halaman login, bukan dashboard. Coba URL publik tanpa login.";
      }
    } catch {}
  }
  const $ = cheerio.load(scraped.mainHtml);
  const cssCollected = await collectCss(scraped.html, scraped.url);
  const combined = cssCollected.combined;
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
    requestedUrl,
    finalUrl,
    redirected,
    warning,
    library: detectLibrary(scraped.html, $),
    tokens,
    components,
    css: cssCollected.combined,
    cssSources: cssCollected.sources,
  };
}
