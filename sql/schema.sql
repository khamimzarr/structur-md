-- ============================================================================
-- structur-md — Supabase Schema
--
-- Jalankan skrip ini di Supabase Dashboard:
--   SQL Editor -> New query -> tempel -> Run
--
-- Skrip ini akan:
--   1. Membuat tabel `scrapes` untuk riwayat hasil scraping.
--   2. Membuat bucket storage `markdown-results` (publik untuk link download).
--   3. Membuat policy RLS supaya hanya service role yang bisa tulis/baca.
--
-- Setelah jalan, isi .env.local:
--   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE: scrapes
--    Menyimpan metadata tiap hasil konversi URL -> Markdown.
-- ---------------------------------------------------------------------------
create table if not exists public.scrapes (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  title       text not null default 'Untitled',
  slug        text not null unique,
  file_path   text not null unique,      -- path objek di Storage, contoh: markdown/abc123.md
  bytes       integer not null default 0,
  status      text not null default 'ready', -- ready | failed
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists scrapes_created_at_idx on public.scrapes (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. STORAGE BUCKET: markdown-results
--    Publik = file .md bisa diakses lewat link publik langsung.
--    (Kamu pilih link PENGUMUMAN publik di desain.)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('markdown-results', 'markdown-results', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. RLS: hanya service role (server) yang boleh tulis/baca tabel scrapes
-- ---------------------------------------------------------------------------
alter table public.scrapes enable row level security;

drop policy if exists "scrapes_select_service" on public.scrapes;
create policy "scrapes_select_service" on public.scrapes
  for select to service_role using (true);

drop policy if exists "scrapes_insert_service" on public.scrapes;
create policy "scrapes_insert_service" on public.scrapes
  for insert to service_role with check (true);

drop policy if exists "scrapes_update_service" on public.scrapes;
create policy "scrapes_update_service" on public.scrapes
  for update to service_role using (true);

drop policy if exists "scrapes_delete_service" on public.scrapes;
create policy "scrapes_delete_service" on public.scrapes
  for delete to service_role using (true);

-- Storage objects: hanya service role yang boleh upload/delete.
drop policy if exists "objects_insert_service" on storage.objects;
create policy "objects_insert_service" on storage.objects
  for insert to service_role with check (bucket_id = 'markdown-results');

drop policy if exists "objects_delete_service" on storage.objects;
create policy "objects_delete_service" on storage.objects
  for delete to service_role using (bucket_id = 'markdown-results');

-- Karena bucket public=true, file .md otomatis bisa dibaca publik tanpa policy.
-- (Offline/anon tidak perlu policy read untuk public bucket.)