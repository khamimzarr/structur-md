"use client";

/* eslint-disable react-hooks/refs -- reveal uses callback refs intentionally */
import { useState, useRef, useEffect, useCallback } from "react";

// ---------- tipe respons dari /api/scrape ----------
interface ScrapeResponse {
  ok: boolean;
  title?: string;
  url?: string;
  requestedUrl?: string;
  finalUrl?: string;
  redirected?: boolean;
  warning?: string;
  slug?: string;
  downloadUrl?: string;
  preview?: string;
  truncated?: boolean;
  totalChars?: number;
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

// --- markdown minimal -> html (tanpa deps) ---
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mdToHtml(md: string): string {
  if (!md) return "";
  let html = esc(md);
  // code blocks ```...```
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${code}</code></pre>`);
  // inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headings
  html = html.replace(/^######\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^####\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // hr
  html = html.replace(/^\s*---\s*$/gm, "<hr/>");
  // blockquote
  html = html.replace(/^\s*>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
  // unordered list
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>");
  // wrap consecutive li
  html = html.replace(/(?:<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  // paragraphs — split by double newline, skip if already block
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h1|h2|h3|ul|pre|blockquote|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return html;
}

const EXAMPLES = [
  { label: "wikipedia.org", url: "https://en.wikipedia.org/wiki/Next.js" },
  { label: "example.com", url: "https://example.com" },
  { label: "tailwindcss.com", url: "https://tailwindcss.com" },
];

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setMounted(true);
  }, []);

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
  const [mode, setMode] = useState<"scrape" | "design">("scrape");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"raw" | "rendered">("raw");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const howReveal = useReveal(true);
  const histReveal = useReveal(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal log.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  // toast auto hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  // Riwayat per sesi
  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) {
        const items = JSON.parse(raw) as HistoryItem[];
        if (Array.isArray(items)) setHistory(items);
      }
    } catch {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  const runScrape = useCallback(
    async (targetRaw: string) => {
      const target = targetRaw.trim();
      if (!target) return;
      setUrl(target);
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
          setError(data.error ?? "Terjadi kesalahan.");
          setLog((p) => [...p, { id: ++seq, text: "exited(1)", tone: "err" }]);
          return;
        }

        if (mode === "design") {
          pushLine(setLog, `✓ DESIGN.md siap — ${(data.preview?.length ?? 0)}+ karakter`);
        } else {
          pushLine(setLog, `✓ markdown siap — ${(data.preview?.length ?? 0)}+ karakter`);
        }
        if (data.warning) {
          pushLine(setLog, `! ${data.warning}`, "err");
          setError(data.warning);
        }
        if (data.redirected && data.finalUrl && data.finalUrl !== data.requestedUrl) {
          pushLine(setLog, `→ redirect: ${data.requestedUrl} → ${data.finalUrl}`, "muted");
        }
        pushLine(setLog, `✓ upload sukses → ${data.downloadUrl}`);
        pushLine(setLog, "exited(0)", "ok");

        setResult(data);
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
        // scroll ke output di mobile
        if (window.innerWidth < 1024) {
          document.getElementById("tool")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch {
        pushLine(setLog, "! Gagal menghubungi server.", "err");
        setError("Gagal menghubungi server. Coba lagi.");
      } finally {
        setBusy(false);
      }
    },
    [mode]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runScrape(url);
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
    // kalau truncated, ambil full dari storage biar copy lengkap
    let text = result?.preview ?? "";
    if (result?.truncated && result?.downloadUrl) {
      try {
        const r = await fetch(result.downloadUrl);
        if (r.ok) text = await r.text();
      } catch {}
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(result?.truncated ? "Disalin (full) ✓" : "Disalin ✓");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      showToast("Gagal — salin manual");
    }
  };

  const [loadingFull, setLoadingFull] = useState(false);
  const loadFullPreview = async () => {
    if (!result?.downloadUrl) return;
    setLoadingFull(true);
    try {
      const r = await fetch(result.downloadUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const full = await r.text();
      setResult((prev) => (prev ? { ...prev, preview: full, truncated: false, totalChars: full.length } : prev));
      showToast("Full dimuat ✓");
      pushLine(setLog, `✓ full preview dimuat — ${full.length.toLocaleString("id-ID")} chr`, "ok");
    } catch {
      showToast("Gagal muat full");
    } finally {
      setLoadingFull(false);
    }
  };

  const isValidUrl = (() => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  const wordCount = result?.preview ? result.preview.split(/\s+/).filter(Boolean).length : 0;

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
          <nav className="hidden gap-6 text-sm text-cloud-text sm:flex">
            <button type="button" onClick={() => scrollToId("how")} className="min-h-[44px] hover:text-bone-text">
              Proses
            </button>
            <button type="button" onClick={() => scrollToId("tool")} className="min-h-[44px] hover:text-bone-text">
              Output
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
                  className={`absolute left-0 top-0 h-0.5 w-4 rounded bg-current transition-all duration-200 ${mobileOpen ? "translate-y-[6px] rotate-45" : ""}`}
                />
                <span
                  className={`absolute left-0 top-[6px] h-0.5 w-4 rounded bg-current transition-opacity duration-150 ${mobileOpen ? "opacity-0" : "opacity-100"}`}
                />
                <span
                  className={`absolute left-0 top-[12px] h-0.5 w-4 rounded bg-current transition-all duration-200 ${mobileOpen ? "-translate-y-[6px] -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
        <div
          id="mobile-drawer"
          className={`grid overflow-hidden border-t border-steel-border bg-slate-canvas transition-all duration-220 ease-out sm:hidden ${mobileOpen ? "max-h-[50dvh] opacity-100" : "max-h-0 opacity-0"}`}
        >
          <nav className="flex flex-col px-4 py-2">
            <button type="button" onClick={() => scrollToId("how")} className="py-3 text-left text-sm text-cloud-text hover:text-bone-text">
              Proses
            </button>
            <button type="button" onClick={() => scrollToId("tool")} className="py-3 text-left text-sm text-cloud-text hover:text-bone-text">
              Output
            </button>
            <a href="https://github.com/khamimzarr/structur-md" target="_blank" rel="noopener noreferrer" className="py-3 text-sm text-cloud-text hover:text-bone-text">
              ★ GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="relative mx-auto max-w-[1200px] overflow-hidden px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-16 text-center">
        <div className="hero-glow" aria-hidden />
        <div className="relative">
          <p
            className={`hero-enter mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-steel-border bg-ink-well/60 px-3 py-1 text-xs sm:text-sm text-bone-text ${mounted ? "mounted" : ""}`}
            style={{ transitionDelay: "0ms" }}
          >
            <span className="h-2 w-2 rounded-full bg-loop-green" />
            URL → Markdown
          </p>

          <h1
            className={`hero-enter mx-auto max-w-4xl text-[30px] font-medium leading-[1.05] tracking-[0.02em] sm:text-5xl md:text-[56px] ${mounted ? "mounted" : ""}`}
            style={{ transitionDelay: "80ms" }}
          >
            URL apapun → <span className="hl hl-violet">.md</span> instan
          </h1>

          <p
            className={`hero-enter mx-auto mt-3 max-w-[520px] text-sm leading-relaxed text-fog-text sm:text-[15px] ${mounted ? "mounted" : ""}`}
            style={{ transitionDelay: "140ms" }}
          >
            Tempel link. Pilih mode.{" "}
            <span className="hl hl-lime">Jadi file siap pakai</span>.
          </p>

          {/* mode — Scrape.md / DESIGN.md — anti ketimpa */}
          <div
            className={`hero-enter toggle-track mx-auto mt-5 w-full max-w-[320px] rounded-full border border-steel-border bg-ink-well p-1 sm:w-fit sm:max-w-none ${mounted ? "mounted" : ""}`}
            style={{ transitionDelay: "200ms" }}
          >
            <div
              className="toggle-pill"
              aria-hidden
              style={{
                transform: mode === "scrape" ? "translateX(0)" : "translateX(calc(100% + 4px))",
              }}
            />
            {(["scrape", "design"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={busy}
                className={`toggle-btn ${mode === m ? "text-ink-well" : "text-cloud-text hover:text-bone-text"}`}
              >
                {m === "scrape" ? "Scrape.md" : "DESIGN.md"}
              </button>
            ))}
          </div>

          {/* ---------- CLI FRAME — paste URL ---------- */}
          <div
            className={`hero-enter cli-shell mx-auto mt-6 w-full max-w-[880px] overflow-hidden rounded-[8px] border text-left shadow-[0_10px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(168,255,83,0.06)] ${mounted ? "mounted" : ""} ${isValidUrl && !busy ? "border-signal-lime/25" : "border-steel-border"} bg-ink-well`}
            style={{ transitionDelay: "260ms" }}
          >
            <div className="flex items-center justify-between border-b border-steel-border bg-[#0e0f11] px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-mute-red/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-key-lime/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-loop-green/80" />
                <span className="ml-2 hidden font-mono text-xs tracking-wide text-fog-text sm:inline">
                  structur-md — {mode === "design" ? "extract-design" : "scrape"}
                </span>
                <span className="ml-2 font-mono text-xs text-fog-text sm:hidden">structur-md</span>
              </div>
              <span className="font-mono text-[11px] text-fog-text">~/paste</span>
            </div>

            <div className="px-4 pt-3 font-mono text-xs text-fog-text sm:px-6 sm:pt-4">
              <span className="text-signal-lime">$</span> structur-md {mode === "design" ? "extract-design" : "scrape"}{" "}
              <span className="text-cloud-text">--url</span> <span className="text-fog-text/70">[tempel di bawah]</span>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:px-6 sm:pb-4 lg:gap-4">
              <div
                className={`flex flex-1 items-center gap-2 rounded-[6px] border bg-slate-canvas px-3 py-2 sm:px-4 sm:py-0 sm:h-[56px] lg:h-[64px] transition-colors ${isValidUrl ? "border-signal-lime/30 ring-1 ring-signal-lime/10" : "border-steel-border focus-within:border-graphite-hairline focus-within:ring-1 focus-within:ring-signal-lime/20"}`}
              >
                <span className="hidden shrink-0 font-mono text-sm text-signal-lime sm:inline">›</span>
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://contoh.com/artikel"
                  disabled={busy}
                  required
                  autoFocus
                  className="h-11 w-full bg-transparent font-mono text-[15px] text-bone-text placeholder:text-fog-text/60 focus:outline-none sm:h-full sm:text-[15px] lg:text-[16px]"
                />
                {url && !busy && (
                  <button
                    type="button"
                    onClick={() => setUrl("")}
                    className="shrink-0 rounded px-1.5 py-1 font-mono text-xs text-fog-text hover:text-bone-text"
                    aria-label="hapus"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={busy}
                className={`inline-flex h-[48px] shrink-0 items-center justify-center gap-2 rounded-[6px] px-7 font-mono text-sm font-semibold transition-all active:scale-[0.98] sm:h-[56px] lg:h-[64px] sm:px-8 lg:px-10 ${busy ? "btn-shimmer bg-signal-lime text-ink-well opacity-90" : "bg-signal-lime text-ink-well hover:opacity-90 hover:shadow-[0_0_22px_rgba(168,255,83,0.25)]"} disabled:opacity-50`}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-ink-well/30 border-t-ink-well animate-spin-slow" />
                    ...
                  </>
                ) : (
                  <>Convert →</>
                )}
              </button>
            </form>
            <div className="border-t border-steel-border/60 bg-[#0e0f11]/60 px-4 py-2 sm:px-6">
              <p className="font-mono text-[11px] leading-none text-fog-text">
                <span className="text-cloud-text">↵ Enter</span> untuk convert ·<span className="hidden sm:inline"> paste &amp; jalan — hasil di bawah</span>
                <span className="sm:hidden"> hasil di bawah</span>
              </p>
            </div>
          </div>

          {/* Example chips */}
          <div
            className={`hero-enter mx-auto mt-4 flex flex-wrap items-center justify-center gap-2 ${mounted ? "mounted" : ""}`}
            style={{ transitionDelay: "320ms" }}
          >
            <span className="font-mono text-[11px] text-fog-text">Coba:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.url}
                type="button"
                disabled={busy}
                onClick={() => runScrape(ex.url)}
                className="chip active:scale-[0.98] disabled:opacity-50"
                title={ex.url}
              >
                <span className="chip-dot" /> {ex.label}
              </button>
            ))}
          </div>
        </div>
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
            <div ref={logRef} className="h-[280px] overflow-y-auto p-3 font-mono text-[13px] leading-6 sm:h-[340px] sm:p-4 sm:text-sm">
              {log.length === 0 ? (
                <span className="code-muted">
                  # paste URL → Convert <span className="cursor-blink" />
                </span>
              ) : (
                log.map((l, idx) => (
                  <div
                    key={l.id}
                    className={`log-line ${l.tone === "err" ? "code-str" : l.tone === "ok" ? "code-type" : l.tone === "muted" ? "code-muted" : ""}`}
                    style={{ animationDelay: `${Math.min(idx * 45, 240)}ms` }}
                  >
                    {l.text}
                  </div>
                ))
              )}
              {busy && <span className="text-signal-lime cursor-blink" />}
            </div>
          </div>

          {/* Preview + actions — with tabs */}
          <div className="flex flex-col gap-4" style={{ animationDelay: "140ms" } as React.CSSProperties}>
            {error && (
              <div className="animate-scaleIn rounded-[4px] border border-mute-red/40 bg-ink-well p-4">
                <p className="text-sm font-medium text-mute-red">✕ {error}</p>
                {result?.warning && result.warning !== error && (
                  <p className="mt-1 font-mono text-xs text-fog-text">{result.warning}</p>
                )}
                {result?.redirected && result.finalUrl && (
                  <p className="mt-1 font-mono text-[11px] text-fog-text break-all">
                    → {result.requestedUrl} → {result.finalUrl}
                  </p>
                )}
              </div>
            )}

            {result?.warning && !error && (
              <div className="animate-scaleIn rounded-[4px] border border-amber-400/25 bg-amber-400/10 p-3">
                <p className="font-mono text-xs font-medium text-amber-300">⚠ {result.warning}</p>
                {result.finalUrl && (
                  <p className="mt-1 font-mono text-[11px] text-fog-text break-all">
                    {result.requestedUrl} → {result.finalUrl}
                  </p>
                )}
              </div>
            )}

            {result?.ok ? (
              <div className="animate-scaleIn flex flex-1 flex-col overflow-hidden rounded-[4px] border border-steel-border bg-ink-well">
                {/* header + tabs + stats */}
                <div className="flex flex-col gap-2 border-b border-steel-border px-3 py-2.5 sm:px-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-fog-text">{result.title}</span>
                    <span className="hl hl-lime text-[11px]">Done ✓</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-full bg-slate-canvas p-1">
                      <button
                        type="button"
                        onClick={() => setTab("raw")}
                        className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition-colors ${tab === "raw" ? "bg-signal-lime text-ink-well" : "text-fog-text hover:text-bone-text"}`}
                      >
                        Raw
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("rendered")}
                        className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition-colors ${tab === "rendered" ? "bg-signal-lime text-ink-well" : "text-fog-text hover:text-bone-text"}`}
                      >
                        Preview
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-fog-text">
                        {(result.preview?.length ?? 0).toLocaleString("id-ID")} chr · {wordCount.toLocaleString("id-ID")} words ·{" "}
                        <span className="hl hl-ink text-[11px]">{mode === "design" ? "DESIGN.md" : "Scrape.md"}</span>
                      </span>
                      {result.truncated && (
                        <button
                          type="button"
                          onClick={loadFullPreview}
                          disabled={loadingFull}
                          className="rounded-full border border-signal-lime/30 bg-signal-lime/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-signal-lime hover:bg-signal-lime/15 disabled:opacity-50"
                        >
                          {loadingFull ? "..." : "Muat full"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* body */}
                {tab === "raw" ? (
                  <pre className="md-preview h-[280px] overflow-auto p-3 font-mono text-[13px] leading-relaxed text-cloud-text sm:h-[340px] sm:p-4">
                    {result.preview}
                    {result.truncated && (
                      <span className="code-muted">\n\n— terpotong {result.totalChars?.toLocaleString("id-ID")} total, klik “Muat full” atau Download —</span>
                    )}
                  </pre>
                ) : (
                  <div className="rendered-md h-[280px] overflow-auto p-4 sm:h-[340px] sm:p-5">
                    <div dangerouslySetInnerHTML={{ __html: mdToHtml(result.preview ?? "") }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-steel-border bg-ink-well p-8 text-center text-fog-text">
                <p className="max-w-sm font-mono text-sm">
                  Hasil <span className="hl hl-ink">{mode === "design" ? "DESIGN.md" : "Scrape.md"}</span> muncul di sini.
                </p>
              </div>
            )}

            {result?.ok && (
              <div className="animate-fadeIn flex gap-3">
                <button onClick={download} className="flex-1 rounded-[4px] bg-signal-lime px-4 py-2.5 font-mono text-sm font-semibold text-ink-well transition-opacity hover:opacity-90">
                  Download
                </button>
                <button
                  onClick={copyMarkdown}
                  className={`flex-1 rounded-[4px] border px-4 py-2.5 font-mono text-sm transition-colors ${copied ? "border-signal-lime/40 bg-signal-lime/10 text-signal-lime" : "border-graphite-hairline text-cloud-text hover:text-bone-text"}`}
                >
                  {copied ? "✓ Disalin" : "Copy"}
                </button>
                <a
                  href={result.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-[4px] border border-graphite-hairline px-4 py-2.5 text-center font-mono text-sm text-cloud-text transition-colors hover:text-bone-text"
                >
                  Buka
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
          <h2 className="text-center font-mono text-2xl font-medium tracking-wide">
            3 <span className="hl hl-violet">langkah</span>
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                icon: "→",
                title: "Ambil",
                body: (
                  <>
                    <span className="hl hl-ink">Fetch</span> statis — cepat & ringan.
                  </>
                ),
              },
              {
                icon: "#",
                title: "Ubah",
                body: (
                  <>
                    DOM → <span className="hl hl-lime">.md</span> bersih.
                  </>
                ),
              },
              {
                icon: "↓",
                title: "Export",
                body: (
                  <>
                    <span className="hl hl-pink">.md</span> → link publik.
                  </>
                ),
              },
            ].map((s, idx) => (
              <div key={s.title} className="card-lift rounded-[4px] border border-steel-border bg-ink-well p-6" style={{ transitionDelay: `${idx * 90}ms` } as React.CSSProperties}>
                <div className="mb-4 text-2xl text-signal-lime">{s.icon}</div>
                <h3 className="mb-2 text-xl font-medium">{s.title}</h3>
                <p className="text-sm leading-relaxed text-fog-text">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- RIWAYAT ---------- */}
      <section ref={histReveal.callbackRef} className={`scroll-mt-20 border-t border-steel-border py-12 sm:py-16 reveal ${histReveal.inView ? "in" : ""}`}>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-mono text-xl font-medium tracking-wide">Riwayat</h2>
            <button
              onClick={clearHistory}
              className="rounded-[4px] border border-graphite-hairline px-3 py-1.5 font-mono text-xs text-cloud-text transition hover:text-bone-text active:scale-[0.98]"
            >
              Hapus
            </button>
          </div>

          {historyLoading ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-[4px] border border-steel-border p-3 sm:p-4">
                  <div className="skeleton mb-2 h-4 w-3/4 rounded" />
                  <div className="skeleton mb-4 h-3 w-full rounded" />
                  <div className="skeleton h-7 w-20 rounded" />
                </li>
              ))}
            </ul>
          ) : history.length === 0 ? (
            <p className="font-mono text-sm text-fog-text">Belum ada. Paste URL di atas → Convert.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {history.map((h, idx) => (
                <li
                  key={h.slug}
                  className="card-lift animate-fadeInUp rounded-[4px] border border-steel-border p-3 sm:p-4"
                  style={{ animationDelay: `${idx * 70}ms` } as React.CSSProperties}
                >
                  <p className="mb-1 truncate font-mono text-sm text-bone-text">{h.title}</p>
                  <p className="mb-3 truncate text-xs text-fog-text">{h.url}</p>
                  <div className="flex items-center justify-between">
                    <span className="hl hl-muted font-mono text-[11px]">{(h.bytes / 1024).toFixed(1)} KB</span>
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
            structur<span className="text-cloud-text">_md</span> — <span className="hl hl-lime text-xs">.md instan</span>
          </p>
          <div className="flex gap-3">
            <span className="rounded-full border border-steel-border bg-ink-well px-3 py-1 text-xs text-bone-text">
              <span className="text-syntax-violet">●</span> Node.js
            </span>
            <span className="rounded-full border border-steel-border bg-ink-well px-3 py-1 text-xs text-bone-text">
              <span className="text-syntax-pink">●</span> Vercel
            </span>
            <span className="rounded-full border border-steel-border bg-ink-well px-3 py-1 text-xs text-bone-text">
              <span className="text-loop-green">●</span> Supabase
            </span>
          </div>
        </div>
      </footer>

      {/* Toast — ganti alert */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="h-2 w-2 rounded-full bg-signal-lime" /> {toast}
        </div>
      )}
    </div>
  );
}
