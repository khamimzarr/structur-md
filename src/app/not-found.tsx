import Link from "next/link";

export const metadata = { title: "404 — halaman tidak ada" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-canvas px-5 text-center">
      <p className="font-mono text-xs text-fog-text">
        <span className="text-signal-lime">$</span> structur-md open /halaman-ini
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-bone-text sm:text-5xl">
        404 — <span className="hl hl-lime">tidak ada</span>
      </h1>
      <p className="max-w-sm font-mono text-sm text-cloud-text">
        Path-nya tidak ketemu. Yang ada cuma convert URL jadi .md.
      </p>
      <Link
        href="/"
        className="rounded-[4px] bg-signal-lime px-5 py-3 font-mono text-sm font-semibold text-ink-well transition hover:brightness-95"
      >
        Balik ke beranda →
      </Link>
    </main>
  );
}
