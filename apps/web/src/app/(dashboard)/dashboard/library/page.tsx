"use client";

import { useMemo, useState } from "react";
import { MultipleChoice, FillBlank, Matching } from "@/components/exercises";
import {
  literatureModules,
  historyModules,
  exerciseToData,
  type LibraryModule,
} from "@/content";
import { Chip, Tabs, Callout, cefrColor, buttonClasses } from "@/components/ui";

type Filter = "all" | "literature" | "history";

export default function LibraryPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const selected = useMemo(
    () => [...literatureModules, ...historyModules].find((m) => m.id === selectedId) || null,
    [selectedId]
  );

  if (selected) {
    return <ModuleDetail module={selected} onBack={() => setSelectedId(null)} />;
  }

  const showLit = filter === "all" || filter === "literature";
  const showHist = filter === "all" || filter === "history";

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-primary)] display">Library</h1>
        <p className="text-[var(--color-text-muted)] mt-1">
          Russian literature &amp; history — read classic passages with translation, learn the
          vocabulary, and practice. <span className="ru-text">Кто знает культуру, тот знает язык.</span>
        </p>
      </div>

      {/* Filter */}
      <div className="mb-8">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "literature", label: `Literature (${literatureModules.length})` },
            { value: "history", label: `History & Culture (${historyModules.length})` },
          ]}
        />
      </div>

      {showLit && (
        <Section
          title="Literature"
          subtitle="From the Golden and Silver Ages — Pushkin to Blok"
          modules={literatureModules}
          onSelect={setSelectedId}
        />
      )}
      {showHist && (
        <Section
          title="History & Culture"
          subtitle="The Russian story, from Kievan Rus to the cosmos"
          modules={historyModules}
          onSelect={setSelectedId}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  modules,
  onSelect,
}: {
  title: string;
  subtitle: string;
  modules: LibraryModule[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold text-[var(--color-primary)]">{title}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">{subtitle}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="text-left bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-5 hover:shadow-md hover:border-[var(--color-primary)] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <Chip tone="neutral">{m.era}</Chip>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: cefrColor(m.cefr), backgroundColor: `color-mix(in srgb, ${cefrColor(m.cefr)} 14%, white)` }}>
                {m.cefr}
              </span>
            </div>
            <h3 className="text-lg font-bold text-[var(--color-primary)] leading-tight ru-text">{m.titleRu}</h3>
            <p className="text-sm font-medium text-[var(--color-text)]">{m.titleEn}</p>
            {m.authorEn && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {m.authorEn} · {m.period}
              </p>
            )}
            <p className="text-sm text-[var(--color-text-muted)] mt-3 line-clamp-3">{m.blurbEn}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ModuleDetail({ module, onBack }: { module: LibraryModule; onBack: () => void }) {
  const [showTranslit, setShowTranslit] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [practicing, setPracticing] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-4"
      >
        ← Back to library
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Chip tone="brand">{module.era}</Chip>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: cefrColor(module.cefr), backgroundColor: `color-mix(in srgb, ${cefrColor(module.cefr)} 14%, white)` }}>
            {module.cefr}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-primary)] ru-text">{module.titleRu}</h1>
        <p className="text-lg text-[var(--color-text)]">{module.titleEn}</p>
        {module.authorRu && (
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {module.authorRu} ({module.authorEn}) · {module.period}
          </p>
        )}
      </div>

      {/* Cultural context */}
      <Callout tone="info" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide mb-1">Why it matters</p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">{module.culturalContextEn}</p>
      </Callout>

      {/* Reading */}
      <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">Read</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTranslit((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                showTranslit
                  ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                  : "border-[var(--color-border-strong)] text-[var(--color-text-muted)]"
              }`}
            >
              Pronunciation
            </button>
            <button
              onClick={() => setShowEnglish((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                showEnglish
                  ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                  : "border-[var(--color-border-strong)] text-[var(--color-text-muted)]"
              }`}
            >
              Translation
            </button>
          </div>
        </div>

        <div className="space-y-3 reading">
          {module.passageLines.map((line, i) => (
            <div key={i} className="border-l-2 border-[var(--color-border)] pl-4">
              <p className="text-lg font-medium text-[var(--color-primary)] ru-text">{line.ru}</p>
              {showTranslit && <p className="text-sm text-[var(--color-accent)] italic">{line.translit}</p>}
              {showEnglish && <p className="text-sm text-[var(--color-text-muted)]">{line.en}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-4 italic">{module.passageSourceEn}</p>
      </div>

      {/* Vocabulary */}
      <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-4">Vocabulary</h2>
        <div className="divide-y divide-[var(--color-border)]">
          {module.vocabulary.map((v, i) => (
            <div key={i} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-bold text-[var(--color-primary)] ru-text">{v.ru}</span>
                <span className="text-sm text-[var(--color-text)]">{v.en}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{v.noteEn}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Practice */}
      <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">Practice</h2>
          <span className="text-sm text-[var(--color-text-muted)]">
            {module.exercises.length} exercise{module.exercises.length === 1 ? "" : "s"}
          </span>
        </div>
        {practicing ? (
          <ModulePractice module={module} onDone={() => setPracticing(false)} />
        ) : (
          <button onClick={() => setPracticing(true)} className={`${buttonClasses("primary", "md")} w-full`}>
            Start practice
          </button>
        )}
      </div>
    </div>
  );
}

function ModulePractice({ module, onDone }: { module: LibraryModule; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const ex = module.exercises[index];
  const data = ex ? exerciseToData(ex, module).data : null;

  function handleSubmit(isCorrect: boolean) {
    if (isCorrect) setCorrect((c) => c + 1);
  }

  function handleContinue() {
    if (index + 1 >= module.exercises.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-lg font-bold text-[var(--color-primary)]">
          {correct}/{module.exercises.length} correct
        </p>
        <button onClick={onDone} className={`${buttonClasses("navy", "md")} mt-4`}>
          Done
        </button>
      </div>
    );
  }

  if (!ex || !data) return null;

  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Exercise {index + 1} of {module.exercises.length}
      </p>
      {(ex.exerciseType === "multiple_choice") && (
        <MultipleChoice
          key={index}
          promptRu={data.promptRu as string}
          promptEn={data.promptEn as string}
          correctAnswer={data.correctAnswer as string}
          distractors={data.distractors as string[]}
          explanationEn={data.explanationEn as string}
          hintSequence={data.hintSequence as string[]}
          onSubmit={(_r, isCorrect) => handleSubmit(isCorrect)}
          onContinue={handleContinue}
        />
      )}
      {ex.exerciseType === "fill_blank" && (
        <FillBlank
          key={index}
          promptRu={data.promptRu as string}
          promptEn={data.promptEn as string}
          correctAnswer={data.correctAnswer as string}
          distractors={data.distractors as string[]}
          explanationEn={data.explanationEn as string}
          hintSequence={data.hintSequence as string[]}
          onSubmit={(_r, isCorrect) => handleSubmit(isCorrect)}
          onContinue={handleContinue}
        />
      )}
      {ex.exerciseType === "matching" && (
        <Matching
          key={index}
          promptEn={data.promptEn as string}
          matchPairs={data.matchPairs as Array<{ left: string; right: string }>}
          explanationEn={data.explanationEn as string}
          onSubmit={(c, total) => handleSubmit(c === total)}
          onContinue={handleContinue}
        />
      )}
    </div>
  );
}
