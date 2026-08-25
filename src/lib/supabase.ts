// ============================================================================
// lib/supabase.ts
// Client Supabase untuk SISI SERVER (service_role).
// DIPAKAI HANYA di berjalan di server (api/*), jangan pernah di client.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error(
      "Missing Supabase env. Set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  _client = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

// Nama bucket tempat .md disimpan. Default `markdown-results` (dibuat oleh sql/schema.sql).
export function getBucket(): string {
  return process.env.SUPABASE_BUCKET || "markdown-results";
}