// Per-segment GOAL PROFILES.
//
// The curriculum is split into a SHARED CORE (grammar/phonetics — the same
// Russian for everyone) and SEGMENT modules (themed vocabulary, register, skills,
// capstones tagged with an `audience`). `buildTrack` composes a track per segment
// by keeping the core plus that segment's themed modules, governed by the profile
// below. This is what makes a teenager and a university applicant take genuinely
// different courses off the same grammar spine — not the identical lessons they
// got before.

import type { CEFR, Segment } from "./types";

export interface SegmentProfile {
  /** Display label for the track. */
  label: string;
  /** CEFR ceiling for this segment's track. */
  targetLevel: CEFR;
  /** One-line learner-facing description of what success looks like. */
  outcomeEn: string;
  /** Target exam / standard, or a plain-language goal when there is no exam. */
  examFocus: string;
  /** Dominant register the themed content + UI copy should adopt. */
  register: "playful" | "casual" | "neutral" | "formal";
  /**
   * Progression model. "exam" = the standard mastery + level-exam gating.
   * "soft" = milestone-based, no high-stakes TORFL-style exam (kids: a 6-year-old
   * can't sit a written exam; progression is celebratory, not pass/fail).
   */
  gating: "exam" | "soft";
  /**
   * Whether this segment learns from the shared adult grammar CORE. Most segments
   * do (core + their themed modules). Kids do NOT — they get their own pre-A1
   * spine, never the adult "nominative case" lessons. (buildTrack falls back to
   * core if a non-core segment has no themed content yet, so it never goes empty.)
   */
  usesCore: boolean;
  /** Signature themes that distinguish this segment's content. */
  signatureThemes: string[];
}

export const SEGMENT_PROFILE: Record<Segment, SegmentProfile> = {
  core: {
    label: "General",
    targetLevel: "C2",
    outcomeEn: "Full Russian mastery, A1 → C2, the complete academic path.",
    examFocus: "TORFL / ТРКИ, all levels",
    register: "neutral",
    gating: "exam",
    usesCore: true,
    signatureThemes: ["complete grammar", "literature", "all four skills"],
  },
  kid: {
    label: "Kids",
    targetLevel: "A2",
    outcomeEn: "Read Cyrillic, name first words, and say warm everyday phrases — through play.",
    examFocus: "Cyrillic literacy + first words (no exam — milestones & stickers)",
    register: "playful",
    gating: "soft",
    usesCore: false,
    signatureThemes: ["alphabet as characters", "animals & colors", "family & warmth", "songs & stories"],
  },
  teen: {
    label: "Teens",
    targetLevel: "B1",
    outcomeEn: "Communicate like a real teen — texting, opinions, friends, school — to a confident B1.",
    examFocus: "Communicative B1 (school & social, not a TORFL certificate)",
    register: "casual",
    gating: "exam",
    usesCore: true,
    signatureThemes: ["texting & chat", "school & friends", "gaming & music", "slang & identity"],
  },
  uni_prep: {
    label: "University Prep",
    targetLevel: "B2",
    outcomeEn: "Pass ТРКИ-2 / B2 for university admission — academic reading, writing, lectures, exam strategy.",
    examFocus: "ТРКИ-2 / B2 (university entrance)",
    register: "formal",
    gating: "exam",
    usesCore: true,
    signatureThemes: ["academic register & email", "essays & abstracts", "lecture notes", "exam strategy & mocks"],
  },
  daily_life: {
    label: "Daily Life",
    targetLevel: "B1",
    outcomeEn: "Handle real life in Russian — documents, doctor, landlord, work, your kid's school.",
    examFocus: "Functional survival (no certificate — get the task done)",
    register: "formal",
    gating: "exam",
    usesCore: true,
    signatureThemes: ["documents & bureaucracy", "healthcare", "housing & work", "school & services"],
  },
  senior: {
    label: "Senior",
    targetLevel: "A2",
    outcomeEn: "Enjoy Russian at your own pace — travel, family, culture, and a little poetry.",
    examFocus: "Joyful comfort (no exam — unhurried milestones)",
    register: "neutral",
    gating: "soft", // matches the "no exam pressure" promise — buildTrack strips exams
    usesCore: true,
    signatureThemes: ["travel & courtesy", "family & grandchildren", "culture & heritage", "first lines of literature"],
  },
};

export function segmentProfile(segment: Segment): SegmentProfile {
  return SEGMENT_PROFILE[segment];
}
