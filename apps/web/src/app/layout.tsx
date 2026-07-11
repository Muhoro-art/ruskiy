import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/legal/CookieBanner";

// Typography is a deliberate, research-backed choice (replaces the unset OS
// default). Inter — a humanist screen sans with a large x-height, open apertures
// and disambiguated glyphs — carries the UI and all Latin/Cyrillic interface
// text; its Cyrillic is professionally drawn (not auto-extended). Lora — a
// readable, slightly calligraphic serif with real Cyrillic — is used only for
// long-form reading passages and the literary Library, where serifs are
// comfortable for sustained reading and suit the heritage tone. Both ship the
// `cyrillic` subset so Russian renders identically on every device, and load
// self-hosted via next/font (no layout shift, no Google round-trip at runtime).
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});
const lora = Lora({
  subsets: ["latin", "cyrillic"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Russkiy — Learn Russian, the Right Way",
  description:
    "An adaptive Russian language learning platform built exclusively for English speakers. Science-backed pedagogy, real-time adaptation, and purpose-built curriculum.",
  keywords: [
    "learn Russian",
    "Russian language",
    "language learning",
    "adaptive learning",
    "Russian for English speakers",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body className="bg-[var(--color-surface)] text-[var(--color-text)] antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
