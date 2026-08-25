// Uji lokal ekstraksi desain -> DESIGN.md (tanpa Supabase).
import { extractDesign } from "../src/lib/designExtractor.js";
import { renderDesignMd } from "../src/lib/renderDesignMd.js";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/test-design.ts <url>");
    process.exit(1);
  }
  const t0 = Date.now();
  const result = await extractDesign(url);
  console.log("✓ extract OK dalam", Date.now() - t0, "ms");
  console.log("  components:", result.components.map((c) => c.name + `(${c.selector})`).join(", "));
  console.log("  colors found:", result.tokens.colors.length, "| fonts:", result.tokens.fonts.length);
  const md = renderDesignMd(result);
  console.log("  markdown length:", md.length);
  const fs = await import("node:fs");
  fs.writeFileSync("scripts/_out.md", md);
  console.log("  full DESIGN.md -> scripts/_out.md");
  console.log("\n================ DESIGN.md (first 1500 chars) ================\n");
  console.log(md.slice(0, 1500));
}

void main();
