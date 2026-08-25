"use client";

/* eslint-disable react-hooks/refs -- reveal uses callback refs intentionally */
import { useState, useRef, useEffect, useCallback } from "react";

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

type HistoryItem = {
  slug: string;
  title: string;
  url: string;
  downloadUrl: string | null;
  bytes: number;
  created_at: string;
};

const HISTORY_KEY = "structur-md:history";

function useReveal(enabled = true) {
  const [inView, setInView] = useState(false);
  const callbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!enabled || !node) return;
      const io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(node);
          }
        },
        { threshold: 0.12 }
      );
      io.observe(node);
    },
    [enabled]
  );
  return { callbackRef, inView };
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // initial mount signal — triggers hero entrance transition
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const scrollToId = useCallback((id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    const headerOffset = 64;
    const y = el.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
    window.history.replaceState(null, "", `#${id}`);
  }, []);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"markdown" | "design">("markdown");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const howReveal = useReveal(true);
  const histReveal = useReveal(true);

  // Auto-scroll terminal log.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  // Riwayat per sesi — hanya di browser ini, hilang saat tab/browser ditutup.
  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) {
        const items = JSON.parse(raw) as HistoryItem[];
        if (Array.isArray(items)) setHistory(items);
      }
    } catch {
      // abaikan jika storage tidak tersedia / rusak
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      sessionStorage.removeItem(HISTORY_KEY);
    } catch {}
  }, []);
  useEffect(() => {
    // Muat riwayat sesi saat mount; sessionStorage hilang saat tutup tab/browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;

    setBusy(true);
    setResult(null);
    setError(null);
    setLog([]);
    const cmd = mode === "design" ? "extract-design" : "scrape";
    pushLine(setLog, `> structur-md v1.0`, "muted");
    pushLine(setLog, `$ ${cmd} "${target}"`, "ok");

    try {
      const res = await fetch(mode === "design" ? "/api/design" : "/api/scrape", {
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

      if (mode === "design") {
        pushLine(setLog, `✓ DESIGN.md siap — ${(data.preview?.length ?? 0)}+ karakter`);
      } else {
        pushLine(setLog, `✓ markdown siap — ${(data.preview?.length ?? 0)}+ karakter`);
      }
      pushLine(setLog, `✓ upload sukses → ${data.downloadUrl}`);
      pushLine(setLog, "exited(0)", "ok");

      setResult(data);
      // Simpan ke riwayat sesi (private, hilang saat tutup web).
      const newItem: HistoryItem = {
        slug: data.slug ?? `tmp-${Date.now()}`,
        title: data.title ?? target,
        url: data.url ?? target,
        downloadUrl: data.downloadUrl ?? null,
        bytes: data.preview?.length ?? 0,
        created_at: new Date().toISOString(),
      };
      setHistory((prev) => {
        const next = [newItem, ...prev].slice(0, 20);
        try {
          sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
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
    a.download = `${result.slug ?? "output"}.md`;
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
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-signal-lime" />
            <span className="font-semibold tracking-wide text-sm sm:text-base">
              structur<span className="text-fog-text">_md</span>
            </span>
          </div>
          {/* Desktop nav */}
          <nav className="hidden gap-6 text-sm text-cloud-text sm:flex">
            <button type="button" onClick={() => scrollToId("how")} className="min-h-[44px] hover:text-bone-text">
              Cara kerja
            </button>
            <button type="button" onClick={() => scrollToId("tool")} className="min-h-[44px] hover:text-bone-text">
              Alat
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/khamimzarr/structur-md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-[4px] border border-graphite-hairline px-3 py-1.5 text-sm text-cloud-text hover:text-bone-text sm:inline-flex"
            >
              ★ GitHub
            </a>
            {/* Hamburger — mobile only */}
            <button
              type="button"
              aria-label={mobileOpen ? "Tutup menu" : "Buka menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-drawer"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-steel-border text-cloud-text sm:hidden active:scale-[0.97]"
            >
              <span className="relative block h-3.5 w-4" aria-hidden>
                <span
                  className={`absolute left-0 top-0 h-0.5 w-4 rounded bg-current transition-all duration-200 ${
                    mobileOpen ? "translate-y-[6px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-[6px] h-0.5 w-4 rounded bg-current transition-opacity duration-150 ${
                    mobileOpen ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 top-[12px] h-0.5 w-4 rounded bg-current transition-all duration-200 ${
                    mobileOpen ? "-translate-y-[6px] -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
        {/* Mobile drawer */}
        <div
          id="mobile-drawer"
          className={`grid overflow-hidden border-t border-steel-border bg-slate-canvas transition-all duration-220 ease-out sm:hidden ${
            mobileOpen ? "max-h-[50dvh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="flex flex-col px-4 py-2">
            <button
              type="button"
              onClick={() => scrollToId("how")}
              className="py-3 text-left text-sm text-cloud-text hover:text-bone-text"
            >
              Cara kerja
            </button>
            <button
              type="button"
              onClick={() => scrollToId("tool")}
              className="py-3 text-left text-sm text-cloud-text hover:text-bone-text"
            >
              Alat
            </button>
            <a
              href="https://github.com/khamimzarr/structur-md"
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 text-sm text-cloud-text hover:text-bone-text"
            >
              ★ GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="mx-auto max-w-[1200px] px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20 text-center">
        <p
          className={`hero-enter mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-steel-border px-3 py-1 text-sm text-bone-text ${mounted ? "mounted" : ""}`}
          style={{ transitionDelay: "0ms" }}
        >
          <span className="h-2 w-2 rounded-full bg-loop-green" />
          URL scraping → Markdown
        </p>

        <h1
          className={`hero-enter mx-auto max-w-4xl text-[30px] font-medium leading-[1.05] tracking-[0.02em] sm:text-5xl md:text-6xl ${mounted ? "mounted" : ""}`}
          style={{ transitionDelay: "80ms" }}
        >
          Ubah halaman web apa&nbsp;pun menjadi{" "}
          <span className="text-event-violet">Markdown</span> atau{}
          <span className="text-event-violet">DESIGN.md</span> instan
        </h1>

        <p
          className={`hero-enter mx-auto mt-5 max-w-[600px] text-[15px] leading-relaxed text-fog-text sm:mt-6 sm:text-lg ${mounted ? "mounted" : ""}`}
          style={{ transitionDelay: "160ms" }}
        >
          Ketik atau tempel URL. Ambil <span className="text-loop-green">konten</span> jadi Markdown,
          atau ekstrak <span className="text-syntax-pink">desain</span> halaman (warna, font, radius, padding)
          jadi <span className="text-key-lime">DESIGN.md</span> siap tiru.
        </p>

        {/* ---------- MODE TOGGLE ---------- */}
        <div
          className={`hero-enter toggle-track relative mx-auto mt-6 flex w-full max-w-[320px] items-center gap-1 rounded-full border border-steel-border bg-ink-well p-1 sm:w-fit sm:max-w-none ${mounted ? "mounted" : ""}`}
          style={{ transitionDelay: "220ms" }}
        >
          <div
            className="toggle-pill"
            aria-hidden
            style={{
              transform:
                mode === "markdown" ? "translateX(0)" : "translateX(calc(100% + 4px))",
            }}
          />
          {( ["markdown", "design"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={busy}
              className={`relative z-10 flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-colors sm:flex-none sm:px-4 sm:py-1.5 sm:text-sm ${
                mode === m ? "text-ink-well" : "text-cloud-text hover:text-bone-text"
              }`}
            >
              {m === "markdown" ? "Konten → .md" : "Desain → DESIGN.md"}
            </button>
          ))}
        </div>

        {/* ---------- FORM ---------- */}
        <form
          onSubmit={handleSubmit}
          className={`hero-enter mx-auto mt-6 flex w-full max-w-2xl flex-col gap-3 sm:flex-row ${mounted ? "mounted" : ""}`}
          style={{ transitionDelay: "300ms" }}
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={mode === "design" ? "https://contoh.com" : "https://contoh.com/artikel"}
            disabled={busy}
            required
            className="h-[48px] w-full flex-1 rounded-[4px] border border-steel-border bg-ink-well px-4 text-[16px] text-cloud-text placeholder:text-fog-text focus:border-graphite-hairline focus:outline-none disabled:opacity-60 sm:h-12 sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={busy}
            className={`h-[48px] w-full shrink-0 inline-flex items-center justify-center gap-2 rounded-[4px] px-6 text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] sm:h-12 sm:w-auto ${
              busy
                ? "btn-shimmer bg-signal-lime text-ink-well opacity-90"
                : "bg-signal-lime text-ink-well hover:opacity-90 hover:shadow-[0_0_20px_rgba(168,255,83,0.22)]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {busy && (
              <span className="h-4 w-4 rounded-full border-2 border-ink-well/30 border-t-ink-well animate-spin-slow" />
            )}
            {busy ? "Memproses..." : mode === "design" ? "Ekstrak Desain →" : "Convert →"}
          </button>
        </form>
      </section>

      {/* ---------- OUTPUT AREA ---------- */}
      <section id="tool" className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6 sm:pb-24">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Terminal log */}
          <div className="card-lift overflow-hidden rounded-[4px] border border-steel-border bg-ink-well animate-fadeInUp" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center gap-2 border-b border-steel-border px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-mute-red/70" />
              <span className="h-2 w-2 rounded-full bg-key-lime/70" />
              <span className="h-2 w-2 rounded-full bg-loop-green/70" />
              <span className="ml-2 font-mono text-xs text-fog-text">scraper.ts</span>
            </div>
            <div
              ref={logRef}
              className="h-[280px] overflow-y-auto p-3 font-mono text-[13px] leading-6 sm:h-[340px] sm:p-4 sm:text-sm"
            >
              {log.length === 0 ? (
                <span className="code-muted">
                  # tempel URL di atas, lalu tekan Convert.{" "}
                  <span className="cursor-blink" />
                </span>
              ) : (
                log.map((l, idx) => (
                  <div
                    key={l.id}
                    className={`log-line ${
                      l.tone === "err"
                        ? "code-str"
                        : l.tone === "ok"
                        ? "code-type"
                        : l.tone === "muted"
                        ? "code-muted"
                        : ""
                    }`}
                    style={{ animationDelay: `${Math.min(idx * 45, 240)}ms` }}
                  >
                    {l.text}
                  </div>
                ))
              )}
              {busy && <span className="text-signal-lime cursor-blink" />}
            </div>
          </div>

          {/* Preview + actions */}
          <div className="flex flex-col gap-4" style={{ animationDelay: "140ms" } as React.CSSProperties}>
            {error && (
              <div className="animate-scaleIn rounded-[4px] border border-mute-red/40 bg-ink-well p-4">
                <p className="text-sm font-medium text-mute-red">✕ {error}</p>
              </div>
            )}

            {result?.ok ? (
              <div className="animate-scaleIn flex-1 overflow-hidden rounded-[4px] border border-steel-border bg-ink-well">
                <div className="flex items-center justify-between gap-2 border-b border-steel-border px-4 py-2.5">
                  <span className="truncate font-mono text-xs text-fog-text">
                    {result.title}
                  </span>
                  <span className="shrink-0 rounded-full border border-steel-border px-2 py-0.5 text-xs text-loop-green">
                    {mode === "design" ? "DESIGN.md" : ".md"}
                  </span>
                </div>
                <pre className="md-preview h-[280px] overflow-auto p-3 text-cloud-text sm:h-[340px] sm:p-4">
                  {result.preview}
                </pre>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-steel-border bg-ink-well p-8 text-center text-fog-text">
                <p className="max-w-sm text-sm leading-relaxed">
                  Hasil {mode === "design" ? "DESIGN.md" : "Markdown"} akan tampil di sini
                  setelah kamu mengonversi satu URL.
                </p>
              </div>
            )}

            {result?.ok && (
              <div className="animate-fadeIn flex gap-3">
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
      <section
        id="how"
        ref={howReveal.callbackRef}
        className={`scroll-mt-20 border-t border-steel-border py-12 sm:py-20 reveal ${howReveal.inView ? "in" : ""}`}
      >
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <h2 className="text-center text-3xl font-medium tracking-wide">
            Bagaimana <span className="text-event-violet">caranya</span>?
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                icon: "→",
                title: "Ambil",
                body: (
                  <>
                    Fetch + Cheerio mengolah halaman{" "}
                    <span className="text-syntax-violet">statis</span> — ringan
                    &amp; cepat tanpa headless browser.{" "}
                    <span className="text-syntax-pink">Dinamis/SPA</span> butuh
                    Chromium (opsi upgrade).
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
            ].map((s, idx) => (
              <div
                key={s.title}
                className="card-lift rounded-[4px] border border-steel-border p-6"
                style={{ transitionDelay: `${idx * 90}ms` } as React.CSSProperties}
              >
                <div className="mb-4 text-2xl text-signal-lime">{s.icon}</div>
                <h3 className="mb-2 text-xl font-medium">{s.title}</h3>
                <p className="text-sm leading-relaxed text-fog-text">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- RIWAYAT ---------- */}
      <section
        ref={histReveal.callbackRef}
        className={`scroll-mt-20 border-t border-steel-border py-12 sm:py-16 reveal ${histReveal.inView ? "in" : ""}`}
      >
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-medium tracking-wide">
              Riwayat <span className="text-event-violet">hasil</span>
            </h2>
            <button
              onClick={clearHistory}
              className="rounded-[4px] border border-graphite-hairline px-3 py-1.5 text-sm text-cloud-text transition hover:text-bone-text active:scale-[0.98]"
            >
              Hapus riwayat
            </button>
          </div>

          {historyLoading ? (
            <ul className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-[4px] border border-steel-border p-3 sm:p-4">
                  <div className="skeleton mb-2 h-4 w-3/4 rounded" />
                  <div className="skeleton mb-4 h-3 w-full rounded" />
                  <div className="skeleton h-7 w-20 rounded" />
                </li>
              ))}
            </ul>
          ) : history.length === 0 ? (
            <p className="text-sm text-fog-text">
              Belum ada hasil. Konversikan URL pertama kamu di atas.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((h, idx) => (
                <li
                  key={h.slug}
                  className="card-lift animate-fadeInUp rounded-[4px] border border-steel-border p-3 sm:p-4"
                  style={{ animationDelay: `${idx * 70}ms` } as React.CSSProperties}
                >
                  <p className="mb-1 truncate font-mono text-sm text-bone-text">{h.title}</p>
                  <p className="mb-3 truncate text-xs text-fog-text">{h.url}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-fog-text">
                      {(h.bytes / 1024).toFixed(1)} KB
                    </span>
                    {h.downloadUrl ? (
                      <a
                        href={h.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[4px] bg-signal-lime px-3 py-1 text-xs font-semibold text-ink-well hover:opacity-90"
                      >
                        Buka .md
                      </a>
                    ) : (
                      <span className="text-xs text-fog-text">—</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t border-steel-border py-8 sm:py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:gap-4 sm:px-6">
          <p className="text-sm text-fog-text">
            structur<span className="text-cloud-text">_md</span> — Next.js ·
            Supabase Storage · Vercel
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