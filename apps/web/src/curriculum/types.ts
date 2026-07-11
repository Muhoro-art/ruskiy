// Types for the leveled, exam-gated curriculum.
//
// Structure: LEVEL (A1..C2) → MODULE → LESSON. Each lesson TEACHES first, then
// tests from a QUESTION BANK — each attempt SAMPLES a subset, excluding questions
// the learner has already seen, so retries show fresh questions (real
// understanding, not memorized ticks). Each level ends with an EXAM that must be
// PASSED to unlock the next level.

export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type Segment = "core" | "kid" | "teen" | "uni_prep" | "daily_life" | "senior";

// Teach blocks are one-idea-per-screen cards. Beyond the four classic text
// kinds, the richer kinds encode learning-science moves directly:
//   table     — dual coding: paradigms (endings, conjugations) as color-coded grids
//   compare   — contrast pairs (ты vs вы) side by side; differences pop visually
//   breakdown — morphology made visible: stem/ending/prefix segments in color
//   tryit     — generation effect: think first, then flip to reveal the answer
//   why       — elaborative interrogation: WHY the rule works, not just what it is
//   mnemonic  — a vivid memory hook (image-in-words + icon)
// A single case's row in a caseTable — one grammatical case shown as a stem
// with its colour-coded ending, its question words, and a usage example.
export interface CaseRow {
  /** Short case label, e.g. "Nom.", "Gen." */
  label: string;
  /** Semantic colour key: nom|gen|dat|acc|instr|prep (drives the highlight map). */
  role: "nom" | "gen" | "dat" | "acc" | "instr" | "prep";
  /** The Russian question words this case answers, e.g. "Кто? Что?" */
  question?: string;
  /** The unchanging stem, e.g. "брат". */
  stem: string;
  /** The case ending (may be "∅"/"" for a zero ending). */
  ending: string;
  /** A short example sentence using the form. */
  exampleRu?: string;
  /** English gloss of the example, e.g. "this is my brother (subject)". */
  gloss?: string;
}

export interface TeachBlock {
  kind:
    | "concept"
    | "letter"
    | "example"
    | "tip"
    | "table"
    | "compare"
    | "breakdown"
    | "tryit"
    | "why"
    | "mnemonic"
    | "warning"
    | "keyRule"
    | "caseTable";
  headingEn?: string;
  ru?: string;
  translit?: string;
  en?: string;
  noteEn?: string;

  // --- table ---
  headers?: string[];
  rows?: string[][];
  /** Optional per-column tints: "m" (blue) | "f" (rose) | "n" (amber) | "pl" (green) | "accent" | "" */
  colTints?: string[];

  // --- compare ---
  leftTitle?: string;
  rightTitle?: string;
  leftItems?: string[];
  rightItems?: string[];

  // --- breakdown ---
  segments?: Array<{ text: string; role: "prefix" | "stem" | "ending" | "suffix" | "stress" }>;

  // --- tryit ---
  promptEn?: string;
  answerRu?: string;
  answerNote?: string;

  // --- mnemonic ---
  icon?: string;

  // --- caseTable (declension / paradigm map) ---
  caseRows?: CaseRow[];
}

export interface Question {
  /** Stable id within its bank/pool: `${ownerId}#${n}`. */
  id: string;
  exerciseType:
    | "multiple_choice"
    | "fill_blank"
    | "matching"
    | "drag_endings"
    | "word_scramble"
    | "sentence_builder"
    | "listening"
    | "memory_match"
    | "free_response";
  promptRu?: string;
  promptEn: string;
  correctAnswer?: string;
  distractors?: string[];
  matchPairs?: Array<{ left: string; right: string }>;
  explanationEn: string;
  hintSequence?: string[];

  // --- drag_endings: drag case endings onto noun stems ---
  /** Sentence with {0},{1}… markers where each stem+slot goes, e.g. "Я живу в {0}." */
  templateRu?: string;
  /** One per marker: the noun stem (no ending) and the correct ending. */
  slots?: Array<{ stem: string; correct: string }>;
  /** Draggable ending tiles (correct ones + distractors). */
  endingBank?: string[];

  // --- word_scramble: arrange scrambled Russian letters to spell a word ---
  /** The target Russian word to spell. */
  answer?: string;
  /** Short hint (often the English meaning). */
  hintEn?: string;

  // --- sentence_builder: arrange word tiles into the correct sentence ---
  /** The words of the correct sentence, in order. */
  correctOrder?: string[];
  /** Optional extra wrong word tiles to mix in. */
  distractorTokens?: string[];
  /** English translation of the sentence. */
  translationEn?: string;

  // --- listening: spoken via TTS, then answer ---
  /** Russian word/phrase to speak aloud. */
  textRu?: string;

  // --- memory_match: concentration game of ru↔en pairs ---
  pairs?: Array<{ ru: string; en: string }>;

  // --- free_response: productive writing/speaking, self-assessed vs a model ---
  /** "writing" = type a response; "speaking" = say it aloud then self-check. */
  responseMode?: "writing" | "speaking";
  /** A strong model answer the learner compares their own response against. */
  modelAnswerRu?: string;
  /** Self-assessment checklist; the learner ticks the points they met. */
  rubricEn?: string[];
}

export interface Lesson {
  id: string; // `${moduleId}:${index}`
  moduleId: string;
  index: number;
  titleEn: string;
  objectiveEn: string;
  teach: TeachBlock[];
  /** The full pool of questions for this lesson (larger than one attempt). */
  questionBank: Question[];
  /** How many to sample per attempt. */
  questionsPerAttempt: number;
}

export interface Module {
  id: string;
  levelId: CEFR;
  order: number;
  topic: string;
  cefr: CEFR;
  title: string;
  lessons: Lesson[];

  // --- segment composition (optional; absent ⇒ shared CORE shown to everyone) ---
  /** "core" = shared grammar/phonetics for all segments; "segment" = themed. */
  track?: "core" | "segment";
  /** Which segments a "segment" module belongs to. Omitted/`["*"]` ⇒ everyone. */
  audience?: Array<Segment | "*">;
  /** Theme-slot key (e.g. "texting", "documents") for ordering + UI. */
  theme?: string;
}

export interface ExamSection {
  name: string;
  descriptionEn: string;
  /** Large pool; the exam samples from it each attempt. */
  pool: Question[];
}

export interface Exam {
  id: string; // `exam-${levelId}`
  levelId: CEFR;
  title: string;
  /** Fraction correct required to pass (TORFL-style). */
  passThreshold: number;
  /** Questions sampled per section per attempt. */
  questionsPerSection: number;
  sections: ExamSection[];
}

export interface Level {
  id: CEFR;
  order: number;
  /** Official Russian name, e.g. "Базовый уровень". */
  name: string;
  description: string;
  modules: Module[];
  exam: Exam | null;
}

/** Default fraction correct to master a lesson and unlock the next step. */
export const MASTERY_THRESHOLD = 0.8;

/** Default TORFL-style exam pass threshold. */
export const EXAM_PASS_THRESHOLD = 0.66;
