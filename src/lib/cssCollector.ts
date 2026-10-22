// ============================================================================
// lib/cssCollector.ts
// Kumpulkan CSS mentah dari halaman: <style> inline + stylesheet eksternal
// (maks 8 link, 2MB). Dipakai /api/design DAN /api/scrape supaya hasil
// scrape juga bisa menyertakan file CSS terpisah.
// ============================================================================

import * as cheerio from "cheerio";

const MAX_CSS_BYTES = 2_000_000;
const MAX_LINKS = 8;

export interface CollectedCss {
  combined: string; // semua CSS digabung (untuk parsing tokens)
  sources: string[]; // URL stylesheet yang berhasil diambil
}

export function collectCss(html: string, baseUrl: string): Promise<CollectedCss> {
  const $ = cheerio.load(html);
  let combined = "";
  $("style").each((_, el) => {
    combined += ($(el).html() || "") + "\n";
  });
  const links: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push(href);
  });
  const sources: string[] = [];
  let fetched = 0;
  const jobs = links.slice(0, MAX_LINKS).map(async (href) => {
    try {
      const abs = new URL(href, baseUrl).toString();
      const res = await fetch(abs, {
        headers: { "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const text = await res.text();
      sources.push(abs);
      combined += "\n" + text.slice(0, MAX_CSS_BYTES);
      fetched++;
    } catch {}
  });
  return Promise.all(jobs).then(() => ({ combined, sources }));
}

// Nama file CSS untuk output: tailwind.css bila halaman pakai Tailwind,
// selain itu styles.css.
export function cssFileName(html: string, slug: string): string {
  const h = html.toLowerCase();
  const isTailwind =
    /@tailwind|tailwindcss/.test(h) ||
    /class="[^"]*\b(?:px|py|p|gap|flex|grid)-\d/.test(h);
  return isTailwind ? `${slug}-tailwind.css` : `${slug}-styles.css`;
}
