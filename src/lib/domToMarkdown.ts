// ============================================================================
// lib/domToMarkdown.ts
// Konversi HTML -> Markdown menggunakan Turndown (berjalan di Node/server).
//
// Input `html` adalah elemen konten utama (hasil seleksi di lib/scraper.ts,
// pakai Cheerio). Output: markdown bersih dengan judul di paling atas.
// ============================================================================

import TurndownService from "turndown";

// Tag & klasifikasi yang dihapus (filter function supaya selektor class jalan).
const REMOVE_TAGS: string[] = [
  "script", "style", "noscript", "nav", "header", "footer", "aside",
  "form", "button", "iframe", "svg", "canvas", "audio", "video", "template",
  "figure",
];

// /class/ attribute yang menandakan elemen non-konten / iklan.
const CLASS_HINTS =
  /^(ad|ads|advert|advertisement|cookie|popup|modal|banner|comment|social|share|sidebar|menu|widget|promo|sponsored|newsletter|subscribe|related)$/i;

function isRemovableClass(el: HTMLElement): boolean {
  const cls = el.className;
  if (typeof cls !== "string" || !cls) return false;
  return cls.split(/\s+/).some((c) => {
    const p = c.replace(/^[_-]+|[_-]+$/g, "").toLowerCase();
    return CLASS_HINTS.test(p);
  });
}

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (_turndown) return _turndown;

  const td = new TurndownService({
    headingStyle: "atx",            // ## Heading
    codeBlockStyle: "fenced",       // ``` ... ```
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",           // [label](url)
  });

  // Hapus berdasarkan tag.
  td.remove(REMOVE_TAGS as never[]);

  // Hapus berdasarkan nama class yang mencurigakan (iklan/non-konten).
  td.remove((node: HTMLElement) => isRemovableClass(node));

  // <img> tanpa alt -> fallback alt kosong.
  td.addRule("imgAltFallback", {
    filter: (node) =>
      node.nodeName === "IMG" && node.getAttribute("alt") === null,
    replacement: (_content, node) => {
      const img = node as HTMLElement;
      const src = img.getAttribute("src");
      if (!src) return "";
      return `![](${src})\n\n`;
    },
  });

  // Anchor kosong / tanpa href -> dibuang.
  td.addRule("emptyAnchor", {
    filter: (node) =>
      node.nodeName === "A" &&
      !node.textContent?.trim() &&
      !node.getAttribute("href"),
    replacement: () => "",
  });

  // Relative link pada <img> tidak terpengaruh turndown (tidak medaftar)
  _turndown = td;
  return td;
}

export interface DomToMarkdownResult {
  title: string;
  markdown: string;
}

export function domToMarkdown(html: string, title?: string): DomToMarkdownResult {
  const cleanTitle = (title ?? "Untitled").trim().slice(0, 200) || "Untitled";

  const td = getTurndown();
  const body = td.turndown(html);

  const markdown = body
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title: cleanTitle, markdown: `# ${cleanTitle}\n\n${markdown}\n` };
}