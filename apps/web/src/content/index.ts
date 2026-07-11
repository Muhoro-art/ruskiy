import { libraryModules } from "./modules.generated";
import type { LibraryModule, LibraryExercise, LibraryKind } from "./types";

export type {
  LibraryModule,
  LibraryExercise,
  LibraryLine,
  LibraryVocab,
  CEFR,
  LibraryKind,
} from "./types";

export { libraryModules };

export const literatureModules = libraryModules.filter((m) => m.kind === "literature");
export const historyModules = libraryModules.filter((m) => m.kind === "history");

export function getModule(id: string): LibraryModule | undefined {
  return libraryModules.find((m) => m.id === id);
}

/** Distinct eras, preserving first-seen order. */
export const ERAS: string[] = Array.from(new Set(libraryModules.map((m) => m.era)));

/** Shape consumed by the exercise components and the learn page. */
export interface LibraryExerciseData {
  type: string;
  role: string;
  data: Record<string, unknown>;
  source: { moduleId: string; titleEn: string; authorEn: string };
}

/** Map a library exercise to the prop shape the exercise components expect. */
export function exerciseToData(
  ex: LibraryExercise,
  module: LibraryModule,
  role = "core"
): LibraryExerciseData {
  return {
    type: ex.exerciseType,
    role,
    data: {
      promptRu: ex.promptRu,
      promptEn: ex.promptEn,
      correctAnswer: ex.correctAnswer ?? "",
      distractors: ex.distractors ?? [],
      explanationEn: ex.explanationEn,
      hintSequence: ex.hintSequence ?? [],
      matchPairs: ex.matchPairs ?? [],
    },
    source: { moduleId: module.id, titleEn: module.titleEn, authorEn: module.authorEn },
  };
}

/**
 * Build a local practice session from the curated library — used as an offline
 * fallback when the adaptive API is unavailable, so the learn flow still works
 * and surfaces real literary/historical content. Exercises are interleaved
 * across modules (round-robin) so a session spans several authors/eras.
 */
export function buildLocalSession(
  count = 8,
  opts?: { kind?: LibraryKind }
): LibraryExerciseData[] {
  const pool = opts?.kind ? libraryModules.filter((m) => m.kind === opts.kind) : libraryModules;

  // Round-robin: take the i-th exercise from each module in turn.
  const out: LibraryExerciseData[] = [];
  const maxLen = Math.max(0, ...pool.map((m) => m.exercises.length));
  for (let i = 0; i < maxLen && out.length < count; i++) {
    for (const m of pool) {
      if (out.length >= count) break;
      const ex = m.exercises[i];
      if (ex) out.push(exerciseToData(ex, m));
    }
  }
  return out;
}
