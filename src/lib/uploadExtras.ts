// ============================================================================
// lib/uploadExtras.ts
// Upload file output tambahan (CSS, dsb.) ke Supabase Storage dan kembalikan
// daftar extra files untuk respons API.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtraFile {
  name: string; // nama file yang tampil di UI, mis. "tailwind.css"
  downloadUrl: string;
  bytes: number;
}

export async function uploadExtraFiles(
  supabase: SupabaseClient,
  bucket: string,
  slug: string,
  files: Array<{ name: string; content: string }>
): Promise<ExtraFile[]> {
  const out: ExtraFile[] = [];
  for (const f of files) {
    if (!f.content.trim()) continue;
    const ext = f.name.split(".").pop() || "txt";
    const contentType = ext === "css" ? "text/css" : "text/markdown";
    const filePath = `extras/${slug}-${f.name}`;
    const up = await supabase.storage
      .from(bucket)
      .upload(filePath, new TextEncoder().encode(f.content), {
        contentType,
        cacheControl: "3600",
        upsert: true,
      });
    if (up.error) {
      console.error(`Extra upload gagal (${f.name}):`, up.error.message);
      continue; // non-fatal: file utama tetap tersaji
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    out.push({ name: f.name, downloadUrl: data.publicUrl, bytes: f.content.length });
  }
  return out;
}
