export type LearnerSegment =
  | "toddler"
  | "kid"
  | "teen"
  | "uni_prep"
  | "migrant"
  | "senior";

export type DomainFocus =
  | "general"
  | "medical"
  | "engineering"
  | "humanities"
  | "business"
  | "law";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface LearnerProfile {
  id: string;
  userId: string;
  displayName: string;
  segment: LearnerSegment;
  nativeLanguage: string;
  domain: DomainFocus;
  currentLevel: CEFRLevel;
  targetLevel: CEFRLevel;
  targetDate: string | null;
  weeklyHours: number;
  createdAt: string;
  onboardingData: OnboardingData | null;
}

export interface OnboardingData {
  placementScore: number;
  assignedLevel: CEFRLevel;
  identifiedWeaknesses: string[];
  recommendedSegment: LearnerSegment;
  estimatedTimeToTarget: number; // weeks
}

export interface CreateProfileRequest {
  displayName: string;
  segment: LearnerSegment;
  domain?: DomainFocus;
  targetLevel: CEFRLevel;
  targetDate?: string;
  weeklyHours: number;
}
