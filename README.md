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
Frontend → POST /api/scrape { url }   (Konten -> Markdown)
   → fetch HTML + parse (Cheerio) + pilih konten utama   (lib/scraper.ts)
   → Turndown konversi HTML → Markdown                   (lib/domToMarkdown.ts)
   → Upload .md → Supabase Storage (publik)              (lib/supabase.ts)
   → Simpan metadata → tabel `scrapes`
   → Return { title, downloadUrl, preview }

Frontend → POST /api/design { url }   (Desain -> DESIGN.md)
   → fetch full HTML + CSS (style + link eksternal)      (lib/designExtractor.ts)
   → postcss parse tokens + komponen dgn nilai terukur   (batas, padding, warna hex)
   → render DESIGN.md                                    (lib/renderDesignMd.ts)
   → upload + simpan -> Return { title, downloadUrl }

Frontend → GET /api/history        (Riwayat hasil dari tabel scrapes)
```

## Fitur keamanan & ketahanan

- **SSRF guard** — hostname resolve ke IP private/loopback/link-local ditolak.
- **Validasi URL** — cek protokol http(s), tolak kredensial (`user:pass@`), batas
  panjang 2048, buang fragment, validasi content-type HTML.
- **Rate limit** — in-memory token bucket per IP (~8 req/menit, HTTP 429; per
  instance di serverless).
- **Batas ukuran & timeout** — output dibatasi, fetch punya timeout.
- **Library styling terdeteksi** — Tailwind/Emotion/Styled/CSS Modules muncul di
  header DESIGN.md.
- **Service role key** hanya untuk server (`api/*`).

## Struktur

```
structur-md/
  src/app/
    layout.tsx
    page.tsx                 # UI utama (toggle Konten/Desain, preview, riwayat)
    globals.css              # design tokens (DESING.md)
    api/scrape/route.ts      # ⚙️ Konversi URL -> Markdown
    api/design/route.ts      # ⚙️ Ekstrak URL -> DESIGN.md
    api/history/route.ts     # GET riwayat hasil
  src/lib/
    scraper.ts               # fetch + Cheerio + validasi URL + SSRF guard
    domToMarkdown.ts         # Turndown config + pembersihan output
    designExtractor.ts       # ekstraksi tokens & komponen (postcss)
    renderDesignMd.ts        # render dokumen DESIGN.md
    rateLimit.ts             # rate-limit per IP (in-memory)
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

Uji mesin scraping & ekstraksi desain secara lokal (tanpa perlu Supabase):

```bash
npx tsx scripts/test-scrape.ts "https://contoh.com/artikel"
npx tsx scripts/test-design.ts "https://contoh.com"
```

Buka `http://localhost:3000`, tempel URL, tekan **Convert**.

## Deploy ke Vercel

```bash
vercel --prod --yes
```

Set variabel env di dashboard proyek Vercel (Settings → Environment Variables) dari `.env.local`.

## Keamanan

- **SSRF guard** — hostname yang resolve ke IP private/loopback/link-local ditolak.
- **Validasi URL** — protokol http(s), tolak kredensial, batas panjang, buang fragment.
- **Rate limit** — in-memory token bucket per IP (~8 req/menit, HTTP 429; per-instance di serverless).
- **Batas ukuran & timeout** — hasil dibatasi, fetch punya timeout.
- **Service role key** hanya dipakai di sisi server (`api/*`), tidak pernah di client.

## Lisensi

MIT