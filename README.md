# structur-md

> **URL scraping → Markdown.** Tempel URL apa pun, mesin headless Chrome (Puppeteer) merender halaman — statis maupun dinamis (SPA) — lalu mengubah strukturnya menjadi file Markdown bersih yang siap diunduh.

## Stack

| Lapisan | Teknologi |
| :--- | :--- |
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind v4 — tema terminal gelap ala Trigger.dev |
| Backend / Storage | Supabase (Storage bucket `markdown-results` + tabel `scrapes`) |
| Scraper | Vercel Serverless Functions — `fetch` + Cheerio (ringan, cocok halaman statis) |

> Karena target scraping adalah **website statis**, mesin tidak butuh headless
> browser. Request HTTP + parse HTML (`cheerio`) sudah cukup — jadi fungsi serverless
> ringan & bisa selesai dalam limit Vercel Free (4.5s).
>
> *Untuk target dinamis/SPA di masa depan:* cukup ganti `src/lib/scraper.ts` dengan
> `puppeteer-core` + `@sparticuz/chromium` dan naikkan `maxDuration` (Vercel Pro).

## Cara kerja (alur API)

```
Frontend → POST /api/scrape { url }
   → fetch HTML + parse (Cheerio) + pilih konten utama   (lib/scraper.ts)
   → Turndown konversi HTML → Markdown                   (lib/domToMarkdown.ts)
   → Upload .md → Supabase Storage (publik)              (lib/supabase.ts)
   → Simpan metadata → tabel `scrapes`
   → Return { title, downloadUrl, preview }
```

## Struktur

```
structur-md/
  src/app/
    layout.tsx
    page.tsx                 # UI utama (URL → Convert → preview → download)
    globals.css              # design tokens (DESING.md)
    api/scrape/route.ts      # ⚙️ Vercel Serverless scraper (mesin utama)
  src/lib/
    scraper.ts               # fetch + Cheerio + SSRF guard
    domToMarkdown.ts         # Turndown config + pembersihan output
    supabase.ts              # client server (service_role)
  sql/schema.sql             # tabel + bucket + RLS
  .env.example               # placeholder env
  vercel.json
```

## Setup lokal

```bash
cp .env.example .env.local   # isi SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

1. Buat project di [Supabase](https://supabase.com).
2. Jalankan `sql/schema.sql` di **SQL Editor** (membuat tabel `scrapes`, bucket `markdown-results` publik, + RLS service-role).
3. Isi `.env.local` (lihat `.env.example`).
4. Login Vercel.

```bash
npm install
npm run dev
```

Uji mesin scraper secara lokal (tanpa perlu Supabase):

```bash
npx tsx scripts/test-scrape.ts "https://contoh.com/artikel"
```

Buka `http://localhost:3000`, tempel URL, tekan **Convert**.

## Deploy ke Vercel

```bash
vercel --prod --yes
```

Set variabel env di dashboard proyek Vercel (Settings → Environment Variables) dari `.env.local`.

## Keamanan

- **SSRF guard** — hostname diblok jika resolve ke IP private/loopback/link-local.
- **Allowlist block** — hostname platform sosial/media diblok.
- **Batas ukuran & timeout** — hasil markdown dibatasi, navigasi punya batas waktu.
- **Service role key** hanya dipakai di sisi server (`api/*`), tidak pernah di client.

## Lisensi

MIT