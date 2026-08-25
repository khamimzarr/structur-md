import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Structur-md — URL ke Markdown",
  description:
    "Scrape URL apa pun (statis & dinamis) dan ubah strukturnya menjadi file Markdown yang siap pakai.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}