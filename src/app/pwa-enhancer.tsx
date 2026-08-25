"use client";
import { useEffect, useState, useCallback } from "react";

export function PwaEnhancer({
  onIncomingUrl,
}: {
  onIncomingUrl?: (url: string) => void;
}) {
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [installable, setInstallable] = useState(false);
  const [offline, setOffline] = useState(false);

  // share target: ?url=... or ?mode=... or ?text=... (Web Share Target simulation)
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const shared =
        u.searchParams.get("url") ||
        u.searchParams.get("text") ||
        u.searchParams.get("q") ||
        "";
      // extract url from text
      const m = shared.match(/https?:\/\/[^\s]+/);
      const incoming = m ? m[0] : shared.startsWith("http") ? shared : "";
      if (incoming && onIncomingUrl) {
        onIncomingUrl(incoming);
        // clean query
        u.searchParams.delete("url");
        u.searchParams.delete("text");
        u.searchParams.delete("q");
        window.history.replaceState(null, "", u.pathname + (u.search ? `?${u.searchParams}` : "") + u.hash);
      }
      // mode param
      const mode = u.searchParams.get("mode");
      if (mode === "design" || mode === "scrape") {
        // handled by page via prop? we dispatch event
        window.dispatchEvent(new CustomEvent("pwa:mode", { detail: mode }));
      }
    } catch {}
  }, [onIncomingUrl]);

  // beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    window.addEventListener("appinstalled", () => {
      setInstallable(false);
      setDeferred(null);
    });
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  // offline
  useEffect(() => {
    const upd = () => setOffline(!navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, []);

  const install = useCallback(async () => {
    const ev = deferred as unknown as { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice?.catch(() => {});
    } finally {
      setInstallable(false);
      setDeferred(null);
    }
  }, [deferred]);

  if (!installable && !offline) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[57px] z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2">
        {offline && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 font-mono text-xs text-amber-200">
            ● Offline — riwayat &amp; shell tetap bisa
          </span>
        )}
        {installable && (
          <button
            type="button"
            onClick={install}
            className="inline-flex items-center gap-2 rounded-full bg-signal-lime px-3.5 py-1.5 font-mono text-xs font-semibold text-ink-well shadow-[0_4px_20px_rgba(168,255,83,0.25)] hover:opacity-90 active:scale-[0.98]"
          >
            ↓ Install App
          </button>
        )}
      </div>
    </div>
  );
}
