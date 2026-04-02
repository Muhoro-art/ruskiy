import type { ContentAtom } from "./content";
import type { ErrorType } from "./skill";

export type SessionStatus =
  | "generating"
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

export interface Session {
  id: string;
  learnerId: string;
  status: SessionStatus;
  items: SessionItem[];
  currentIndex: number;
  totalXp: number;
  startedAt: string;
  completedAt: string | null;
  duration: number; // seconds
  accuracyRate: number;
}

export interface SessionItem {
  position: number;
  contentAtom: ContentAtom;
  role: SessionItemRole;
  completed: boolean;
  result: ExerciseResult | null;
}

export type SessionItemRole =
  | "warmup"
  | "ramp"
  | "core"
  | "relief"
  | "challenge"
  | "cooldown";

export interface ExerciseResult {
  contentId: string;
  response: string;
  correctAnswer: string;
  isCorrect: boolean;
  errorType: ErrorType | null;
  responseTimeMs: number;
  hintLevelUsed: number;
  pronunciationScore: number | null;
  xpEarned: number;
  timestamp: string;
}

export interface SessionSummary {
  sessionId: string;
  totalExercises: number;
  correctCount: number;
  accuracyRate: number;
  totalXp: number;
  skillsPracticed: string[];
  duration: number;
  streakDays: number;
  newAchievements: string[];
}

export interface GenerateSessionRequest {
  learnerId: string;
  timeBudgetMinutes: number;
  assignmentId?: string;
}
