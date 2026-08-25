"use client";

import { useState, useRef, useEffect } from "react";

// ---------- tipe respons dari /api/scrape ----------
interface ScrapeResponse {
  ok: boolean;
  title?: string;
  url?: string;
  slug?: string;
  downloadUrl?: string;
  preview?: string;
  error?: string;
  code?: string;
}

type LogLine = { id: number; text: string; tone?: "muted" | "ok" | "err" };

let seq = 0;
function pushLine(
  setLog: React.Dispatch<React.SetStateAction<LogLine[]>>,
  text: string,
  tone?: LogLine["tone"]
) {
  setLog((prev) => [...prev, { id: ++seq, text, tone }]);
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;

    setBusy(true);
    setResult(null);
    setError(null);
    setLog([]);
    pushLine(setLog, `> structur-md v1.0`, "muted");
    pushLine(setLog, `$ scrape "${target}"`, "ok");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });

      const data = (await res.json()) as ScrapeResponse;

      if (!res.ok || !data.ok) {
        pushLine(setLog, `! ${data.error ?? `HTTP ${res.status}`}`, "err");
        setError(data.error ?? "Terjadi kesalahan tak diketahui.");
        setLog((p) => [...p, { id: ++seq, text: "exited(1)", tone: "err" }]);
        return;
      }

      pushLine(setLog, `✓ markdown siap — ${(data.preview?.length ?? 0)}+ karakter`);
      pushLine(setLog, `✓ upload sukses → ${data.downloadUrl}`);
      pushLine(setLog, "exited(0)", "ok");

      setResult(data);
    } catch {
      pushLine(setLog, "! Gagal menghubungi server.", "err");
      setError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result?.downloadUrl) return;
    const a = document.createElement("a");
    a.href = result.downloadUrl;
    a.download = `${result.slug ?? "markdown"}.md`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const copyMarkdown = async () => {
    if (!result?.preview) return;
    try {
      await navigator.clipboard.writeText(result.preview);
      alert("Preview markdown disalin.");
    } catch {
      alert("Gagal menyalin. Salin manual dari panel.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-canvas text-bone-text">
      {/* ---------- NAV ---------- */}
      <header className="sticky top-0 z-10 border-b border-steel-border bg-slate-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-signal-lime" />
            <span className="font-semibold tracking-wide">
              structur<span className="text-fog-text">_md</span>
            </span>
          </div>
          <nav className="hidden gap-6 text-sm text-cloud-text sm:flex">
            <a href="#how" className="hover:text-bone-text">Cara kerja</a>
            <a href="#tool" className="hover:text-bone-text">Alat</a>
          </nav>
          <a
            href="https://github.com/khamimzarr/structur-md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[4px] border border-graphite-hairline px-3 py-1.5 text-sm text-cloud-text hover:text-bone-text"
          >
            ★ GitHub
          </a>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="mx-auto max-w-[1200px] px-6 pb-16 pt-20 text-center">
        <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-steel-border px-3 py-1 text-sm text-bone-text">
          <span className="h-2 w-2 rounded-full bg-loop-green" />
          URL scraping → Markdown
        </p>

        <h1 className="mx-auto max-w-4xl text-4xl font-medium leading-tight tracking-[0.02em] sm:text-5xl md:text-6xl">
          Ubah halaman web apa&nbsp;pun menjadi{" "}
          <span className="text-event-violet">Markdown</span> instan
        </h1>

        <p className="mx-auto mt-6 max-w-[600px] text-lg leading-relaxed text-fog-text">
          Ketik atau tempel URL. Mesin headless kami merender halaman statis
          maupun dinamis, mengekstrak struktur konten, dan mengembalikannya
          sebagai file <span className="text-loop-green">.md</span> siap pakai.
        </p>

        {/* ---------- FORM ---------- */}
        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://contoh.com/artikel"
            disabled={busy}
            required
            className="h-12 flex-1 rounded-[4px] border border-steel-border bg-ink-well px-4 text-cloud-text placeholder:text-fog-text focus:border-graphite-hairline focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-[4px] bg-signal-lime px-6 font-semibold text-ink-well transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Memproses…" : "Convert →"}
          </button>
        </form>
      </section>

      {/* ---------- OUTPUT AREA ---------- */}
      <section id="tool" className="mx-auto max-w-[1200px] px-6 pb-24">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Terminal log */}
          <div className="overflow-hidden rounded-[4px] border border-steel-border bg-ink-well">
            <div className="flex items-center gap-2 border-b border-steel-border px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-mute-red/70" />
              <span className="h-2 w-2 rounded-full bg-key-lime/70" />
              <span className="h-2 w-2 rounded-full bg-loop-green/70" />
              <span className="ml-2 font-mono text-xs text-fog-text">scraper.ts</span>
            </div>
            <div
              ref={logRef}
              className="h-[340px] overflow-y-auto p-4 font-mono text-sm leading-6"
            >
              {log.length === 0 ? (
                <span className="code-muted">
                  # tempel URL di atas, lalu tekan Convert.{" "}
                  <span className="cursor-blink" />
                </span>
              ) : (
                log.map((l) => (
                  <div
                    key={l.id}
                    className={
                      l.tone === "err"
                        ? "code-str"
                        : l.tone === "ok"
                        ? "code-type"
                        : l.tone === "muted"
                        ? "code-muted"
                        : ""
                    }
                  >
                    {l.text}
                  </div>
                ))
              )}
              {busy && <span className="text-signal-lime cursor-blink" />}
            </div>
          </div>

          {/* Preview + actions */}
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-[4px] border border-mute-red/40 bg-ink-well p-4">
                <p className="text-sm font-medium text-mute-red">✕ {error}</p>
              </div>
            )}

            {result?.ok ? (
              <div className="flex-1 overflow-hidden rounded-[4px] border border-steel-border bg-ink-well">
                <div className="flex items-center justify-between gap-2 border-b border-steel-border px-4 py-2.5">
                  <span className="truncate font-mono text-xs text-fog-text">
                    {result.title}
                  </span>
                  <span className="shrink-0 rounded-full border border-steel-border px-2 py-0.5 text-xs text-loop-green">
                    .md
                  </span>
                </div>
                <pre className="md-preview h-[340px] overflow-auto p-4 text-cloud-text">
                  {result.preview}
                </pre>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-steel-border bg-ink-well p-8 text-center text-fog-text">
                <p className="max-w-sm text-sm leading-relaxed">
                  Hasil render Markdown akan tampil di sini setelah kamu
                  mengonversi satu URL.
                </p>
              </div>
            )}

            {result?.ok && (
              <div className="flex gap-3">
                <button
                  onClick={download}
                  className="flex-1 rounded-[4px] bg-signal-lime px-4 py-2.5 font-semibold text-ink-well transition-opacity hover:opacity-90"
                >
                  Download .md
                </button>
                <button
                  onClick={copyMarkdown}
                  className="flex-1 rounded-[4px] border border-graphite-hairline px-4 py-2.5 text-cloud-text transition-colors hover:text-bone-text"
                >
                  Copy
                </button>
                <a
                  href={result.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-[4px] border border-graphite-hairline px-4 py-2.5 text-center text-cloud-text transition-colors hover:text-bone-text"
                >
                  Buka link
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section id="how" className="border-t border-steel-border py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <h2 className="text-center text-3xl font-medium tracking-wide">
            Bagaimana <span className="text-event-violet">caranya</span>?
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                icon: "→",
                title: "Scrape",
                body: (
                  <>
                    Headless Chromium merender halaman —{" "}
                    <span className="text-syntax-violet">statis</span> maupun{" "}
                    <span className="text-syntax-pink">dinamis</span> (SPA).
                  </>
                ),
              },
              {
                icon: "#",
                title: "Konversi",
                body: (
                  <>
                    Struktur DOM diekstrak dan diubah jadi{" "}
                    <span className="text-loop-green">Markdown</span> bersih.
                  </>
                ),
              },
              {
                icon: "↓",
                title: "Export",
                body: (
                  <>
                    File <span className="text-tag-magenta">.md</span> di-upload ke
                    Supabase Storage untuk{" "}
                    <span className="text-key-lime">link publik</span>.
                  </>
                ),
              },
            ].map((s) => (
              <div
                key={s.title}
                className="rounded-[4px] border border-steel-border p-6 transition-colors hover:border-graphite-hairline"
              >
                <div className="mb-4 text-2xl text-signal-lime">{s.icon}</div>
                <h3 className="mb-2 text-xl font-medium">{s.title}</h3>
                <p className="text-sm leading-relaxed text-fog-text">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t border-steel-border py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <p className="text-sm text-fog-text">
            structur<span className="text-cloud-text">_md</span> — Next.js ·
            Puppeteer · Supabase Storage
          </p>
          <div className="flex gap-3">
            <span className="rounded-full border border-steel-border px-3 py-1 text-xs text-bone-text">
              <span className="text-syntax-violet">●</span> Node.js
            </span>
            <span className="rounded-full border border-steel-border px-3 py-1 text-xs text-bone-text">
              <span className="text-syntax-pink">●</span> Vercel
            </span>
            <span className="rounded-full border border-steel-border px-3 py-1 text-xs text-bone-text">
              <span className="text-loop-green">●</span> Supabase
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}