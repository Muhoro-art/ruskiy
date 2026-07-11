"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { LEGAL_DOCS } from "@/lib/legalContent";

// Public legal document viewer for /legal/consent, /legal/privacy, /legal/terms,
// /legal/cookies. Russian is the legally-operative version for users in the Russian
// Federation and is shown by default; an English translation is available via the toggle.
export default function LegalDocPage() {
  const params = useParams();
  const slug = String((params as { doc?: string }).doc || "");
  const doc = LEGAL_DOCS[slug];
  const [lang, setLang] = useState<"ru" | "en">("ru");

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] p-8 text-center">
        <div>
          <p className="text-[var(--color-text-muted)]">Document not found.</p>
          <Link href="/" className="text-[var(--color-primary)] font-medium hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const v = doc[lang];
  const NAV = [
    { slug: "consent", label: lang === "ru" ? "Согласие" : "Consent" },
    { slug: "privacy", label: lang === "ru" ? "Конфиденциальность" : "Privacy" },
    { slug: "terms", label: lang === "ru" ? "Соглашение" : "Terms" },
    { slug: "cookies", label: "Cookie" },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-surface)] py-10 px-6">
      <article className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/" className="text-2xl font-bold text-[var(--color-primary)] display">РУССКИЙ</Link>
          <div className="flex items-center gap-3">
            <div className="text-xs text-[var(--color-text-muted)] flex gap-3">
              {NAV.map((n) => (
                <Link key={n.slug} href={`/legal/${n.slug}`} className={slug === n.slug ? "font-semibold text-[var(--color-primary)]" : "hover:underline"}>{n.label}</Link>
              ))}
            </div>
            {/* RU is authoritative; EN is a courtesy translation. */}
            <div className="inline-flex rounded-full border border-[var(--color-border-strong)] overflow-hidden text-xs">
              <button onClick={() => setLang("ru")} className={`px-2.5 py-1 ${lang === "ru" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}>RU</button>
              <button onClick={() => setLang("en")} className={`px-2.5 py-1 ${lang === "en" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}>EN</button>
            </div>
          </div>
        </div>

        {/* Draft / pending-completion notice. */}
        <div className="mb-6 rounded-[var(--radius-control)] border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {lang === "ru" ? (
            <><strong>Проект — заполните данные оператора.</strong> Документ подготовлен по требованиям 152-ФЗ; перед запуском заполните сведения в [квадратных скобках] (наименование, ИНН/ОГРН, адрес, контакты) и подайте уведомление в Роскомнадзор.</>
          ) : (
            <><strong>Draft — complete the operator details.</strong> Prepared to the requirements of 152-FZ; before launch, fill the [bracketed] facts (name, ИНН/ОГРН, address, contacts) and file the Roskomnadzor notification.</>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] bg-white border border-[var(--color-border)] p-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{v.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {lang === "ru" ? "Версия" : "Version"} {doc.version} · {lang === "ru" ? "Действует с" : "Effective"} {v.effectiveDate}
          </p>
          <p className="mt-4 text-sm text-[var(--color-text-muted)] leading-relaxed">{v.intro}</p>

          {v.sections.map((s) => (
            <section key={s.heading} className="mt-6">
              <h2 className="text-base font-semibold text-[var(--color-primary)]">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">{p}</p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/signup" className="text-[var(--color-primary)] font-medium hover:underline">← {lang === "ru" ? "К регистрации" : "Back to sign up"}</Link>
        </p>
      </article>
    </div>
  );
}
