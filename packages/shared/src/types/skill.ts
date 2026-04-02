import type { CEFRLevel } from "./learner";

export type SkillCategory = "grammar" | "vocabulary" | "phonetics" | "pragmatics";

export type SkillStatus =
  | "new"
  | "learning"
  | "review"
  | "mastered"
  | "fossilized";

export type ErrorType =
  | "transfer"
  | "overgeneralization"
  | "avoidance"
  | "fossilization"
  | "general";

export interface Skill {
  skillId: string; // e.g. 'grammar.cases.genitive.plural'
  category: SkillCategory;
  subcategory: string;
  cefrLevel: CEFRLevel;
  displayNameEn: string;
  displayNameRu: string;
}

export interface LearnerSkillState {
  learnerId: string;
  skillId: string;
  confidence: number; // 0.0 to 1.0
  stability: number; // days until recall drops
  difficulty: number; // 0.0 to 1.0
  lastReviewed: string | null;
  nextReviewDue: string | null;
  totalAttempts: number;
  correctStreak: number;
  errorCount: number;
  errorTypes: ErrorType[];
  interferenceWith: string[];
  status: SkillStatus;
}

export interface KnowledgeGraph {
  learnerId: string;
  skills: LearnerSkillState[];
  totalSkills: number;
  masteredCount: number;
  learningCount: number;
  averageConfidence: number;
}
