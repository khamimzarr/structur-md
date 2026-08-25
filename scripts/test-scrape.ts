// Test lokal mesin scraper (fetch + cheerio) tanpa Supabase.
// Jalankan: npx tsx scripts/test-scrape.ts "https://contoh.com"
import { scrapeUrl } from "../src/lib/scraper.js";
import { domToMarkdown } from "../src/lib/domToMarkdown.js";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/test-scrape.ts <url>");
    process.exit(1);
  }

  const t0 = Date.now();
  try {
    const scraped = await scrapeUrl(url, { timeoutMs: 15000 });
    console.log("✓ scrape OK dalam", Date.now() - t0, "ms");
    console.log("  title:", scraped.title);
    console.log("  mainHtml length:", scraped.mainHtml.length);

    const converted = domToMarkdown(scraped.mainHtml, scraped.title);
    console.log("✓ markdown length:", converted.markdown.length);
    console.log("---------------- MARKDOWN (first 600 chars) ----------------");
    console.log(converted.markdown.slice(0, 600));
  } catch (err) {
    console.error("✗ GAGAL:", (err as Error).message);
    process.exit(1);
  }
}

void main();