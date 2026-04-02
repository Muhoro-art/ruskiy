import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-[var(--color-surface)] text-[var(--color-text)] antialiased">
        {children}
      </body>
    </html>
  );
}
