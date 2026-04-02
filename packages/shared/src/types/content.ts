import type { CEFRLevel, LearnerSegment, DomainFocus } from "./learner";

export type ContentType =
  | "exercise"
  | "dialogue"
  | "story"
  | "media"
  | "scenario";

export type ExerciseType =
  | "multiple_choice"
  | "fill_blank"
  | "translation"
  | "dictation"
  | "speaking"
  | "matching"
  | "ordering"
  | "role_play"
  | "listening"
  | "reading_comp";

export interface ContentAtom {
  id: string;
  contentType: ContentType;
  exerciseType: ExerciseType | null;
  targetSkills: string[];
  cefrLevel: CEFRLevel;
  segmentTags: LearnerSegment[];
  domainTags: DomainFocus[];
  difficulty: number; // 0.00 - 1.00
  estimatedTime: number; // seconds
  contentData: ExercisePayload;
  mediaRefs: string[];
  qualityScore: number;
}

export interface ExercisePayload {
  promptRu?: string;
  promptEn?: string;
  correctAnswer?: string;
  distractors?: string[];
  explanationEn?: string;
  hintSequence?: string[];
  audioRef?: string;
  imageRef?: string;
  matchPairs?: Array<{ left: string; right: string }>;
  orderItems?: string[];
  dialogueLines?: Array<{ speaker: string; textRu: string; textEn: string }>;
}
