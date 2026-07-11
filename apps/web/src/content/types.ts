// Types for the Russian literature & history content library.
//
// This is a curated, self-contained knowledge base bundled with the web app:
// classic public-domain literary excerpts and cultural-history modules, each
// with an interlinear passage, vocabulary, and self-consistent exercises. It
// powers the /dashboard/library experience and serves as an offline fallback
// for the adaptive learn flow when the API is unavailable.

export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type LibraryKind = "literature" | "history";

export interface LibraryLine {
  /** Original Russian (modern orthography). */
  ru: string;
  /** Romanized pronunciation. */
  translit: string;
  /** Faithful English translation of this line. */
  en: string;
}

export interface LibraryVocab {
  ru: string;
  en: string;
  /** Grammar / usage / cultural note. */
  noteEn: string;
}

export interface LibraryExercise {
  exerciseType: "multiple_choice" | "fill_blank" | "matching";
  promptRu?: string;
  promptEn: string;
  correctAnswer?: string;
  distractors?: string[];
  matchPairs?: Array<{ left: string; right: string }>;
  explanationEn: string;
  hintSequence?: string[];
}

export interface LibraryModule {
  id: string;
  kind: LibraryKind;
  /** Cultural/historical era, e.g. "Golden Age", "Kievan Rus", "Soviet Era". */
  era: string;
  titleRu: string;
  titleEn: string;
  /** Empty string for history modules. */
  authorRu: string;
  authorEn: string;
  /** e.g. "1799–1837", "988", "1941–1945". */
  period: string;
  cefr: CEFR;
  blurbEn: string;
  /** Significance as Russian culture narrates it (heritage framing). */
  culturalContextEn: string;
  passageLines: LibraryLine[];
  passageSourceEn: string;
  vocabulary: LibraryVocab[];
  exercises: LibraryExercise[];
}
