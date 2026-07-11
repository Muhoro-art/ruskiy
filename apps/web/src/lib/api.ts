import { auth } from "./auth";
import { loginPathForRole } from "./portal";

// Default to the same-origin proxy (/api → Go API via next.config rewrite) so the
// browser sends the httpOnly auth cookies. Override with NEXT_PUBLIC_API_URL only
// for non-proxied setups (e.g. mobile pointing straight at the API).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

// The API returns tokens nested under `tokens` for register/login, and at the
// top level for /auth/refresh. These types mirror the actual wire format.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  accountType?: string;
  locale?: string;
  displayName?: string;
  emailVerified?: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

// Registration result. With email verification on (block-until-verified), the server
// creates no session and returns { verificationRequired: true, email } instead of tokens.
export interface RegisterResult {
  verificationRequired?: boolean;
  email?: string;
  user?: AuthUser;
  tokens?: AuthTokens;
}

// Human-verification challenge (self-hosted bot check on the auth routes).
export interface ChallengeTile {
  key: string;
  emoji: string;
}
export interface Challenge {
  /** True when the server-side gate is turned off — the client then skips the check. */
  disabled: boolean;
  id?: string;
  prompt?: string;
  tiles?: ChallengeTile[];
}
export interface ChallengeResult {
  ok: boolean;
  /** Single-use pass token, present only when ok. */
  token?: string;
  error?: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  streakDays: number;
  level: string;
}

export interface LeaderboardResponse {
  scope: string;
  period: string;
  resetsIn: string;
  leaderboard: LeaderboardEntry[];
}

export interface Cohort {
  id: string;
  teacherId: string;
  name: string;
  studentCount: number;
  createdAt: string;
}

export interface Assignment {
  id: string;
  cohortId: string;
  cohortName?: string;
  teacherId: string;
  title: string;
  targetSkills: string[];
  minExercises: number;
  deadline: string | null;
  createdAt: string;
  /** 0 = the whole cohort; N = targeted at N specific students. */
  targetCount: number;
  /** Attached Студия materials (playable content items). */
  contentCount: number;
  /** > 0 = teacher-set countdown per question (seconds). */
  timePerQuestionSec: number;
}

// Student-facing view of an assignment (GET /me/assignments).
export interface LearnerAssignment {
  id: string;
  title: string;
  cohortName: string;
  teacherEmail: string;
  targetSkills: string[];
  minExercises: number;
  deadline: string | null;
  createdAt: string;
  /** > 0 means the teacher attached playable materials (start at /dashboard/tasks/{id}). */
  contentCount: number;
  /** > 0 = teacher-set countdown per question (seconds). */
  timePerQuestionSec: number;
  /** Set once this learner finished the assignment's materials. */
  completedAt: string | null;
  /** First-attempt score (teacher assignments are single-attempt). */
  scoreCorrect: number;
  scoreTotal: number;
  /** Per-step results of the recorded attempt. */
  results: CompletionItemResult[];
  /** Practice-skills assignments only: adaptive exercises answered since it
   *  was set — auto-completes at minExercises. */
  practiceDone: number;
}

// One answered (or timed-out) question inside one attached material.
export interface CompletionStepResult {
  i: number;
  type: string;
  /** correct | incorrect | timeout | viewed | "c/t" (matching partial). */
  result: string;
  /** What the question asked (so the teacher reviews real questions). */
  prompt?: string;
  /** The student's actual answer. */
  given?: string;
  /** The expected answer. */
  expected?: string;
}
export interface CompletionItemResult {
  contentId: string;
  title: string;
  steps: CompletionStepResult[];
}

// Full-page answer sheet: one student × one assignment, every question with
// the student's answer and verdict.
export interface PracticeAnswer {
  answeredAt: string;
  /** Adaptive answers: exercise type. Path answers: the lesson id. */
  type: string;
  prompt: string;
  response: string;
  correctAnswer: string;
  isCorrect: boolean;
  /** Path answers only — used to dedupe against the seen-question history. */
  questionId?: string;
}
export interface PathSeenLesson {
  lessonId: string;
  questionIds: string[];
  bestScore: number;
  attempts: number;
}
export interface AnswerSheet {
  assignmentId: string;
  title: string;
  learnerName: string;
  createdAt: string;
  completedAt: string | null;
  scoreCorrect: number;
  scoreTotal: number;
  contentCount: number;
  timePerQuestionSec: number;
  results: CompletionItemResult[];
  practice: PracticeAnswer[];
  /** Recorded Path answers in the assignment window (post answer-capture).
   *  `type` carries the lesson id for these. */
  pathAnswers: PracticeAnswer[];
  /** Blob reconstruction: questions the learner SAW in the Path (answers were
   *  not captured back then) with per-lesson aggregate scores. */
  pathSeen: PathSeenLesson[];
  pathQuestions: number;
}

// Period report (day/week/month): one student's activity summary for a range.
export interface ReportComment {
  id: string;
  learnerId: string;
  teacherEmail: string;
  comment: string;
  createdAt: string;
}
export interface ReportRow {
  learnerId: string;
  name: string;
  completed: number;
  assignedTotal: number;
  scoreCorrect: number;
  scoreTotal: number;
  exercises: number;
  exercisesOk: number;
  pathQuestions: number;
  xpEarned: number;
  totalXp: number;
  lastActive: string | null;
  comments: ReportComment[];
}
export interface CohortReport {
  from: string;
  to: string;
  rows: ReportRow[];
}

// Teacher drill-down: one assignment's status for one specific student.
export interface StudentAssignmentStatus {
  id: string;
  title: string;
  deadline: string | null;
  createdAt: string;
  contentCount: number;
  timePerQuestionSec: number;
  completedAt: string | null;
  scoreCorrect: number;
  scoreTotal: number;
  results: CompletionItemResult[];
}

// A pending cohort invitation (teacher proposes, student accepts/declines).
export interface CohortInvite {
  id: string;
  cohortId: string;
  cohortName: string;
  learnerId: string;
  learnerName?: string;
  teacherName?: string;
  status: string;
  createdAt: string;
}

export interface HeatmapRow {
  id: string;
  name: string;
  scores: number[];
  /** attempted[i] distinguishes "measured" from "never tried" (render a dash). */
  attempted: boolean[];
}
export interface Heatmap {
  cohortId: string;
  /** The cohort's CURRENT join code ("" if none generated yet). */
  joinCode: string;
  skills: Array<{ id: string; name: string }>;
  students: HeatmapRow[];
  /** Curriculum-Path topic accuracy — the truth for Path-only learners. */
  topics: Array<{ id: string; name: string }>;
  topicRows: HeatmapRow[];
}

// Студия — teacher-authored content (Phase A).
export interface TeacherContent {
  id: string;
  authorId: string;
  title: string;
  exerciseType: string;
  contentData: Record<string, unknown>;
  cefrLevel: string;
  topic: string;
  targetSkills: string[];
  status: "draft" | "submitted" | "approved" | "rejected" | string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Moderator's note from the latest resolved review (why rejected/approved). */
  reviewFeedback?: string;
  /** Creator attribution (staff email) on learner-facing/global surfaces. */
  authorName?: string;
}

// One pending item in the admin moderation queue.
export interface PendingReview {
  reviewId: string;
  authorEmail: string;
  content: TeacherContent;
}

// One desk in the classroom view — per-student honest stats.
export interface RosterStudent {
  id: string;
  name: string;
  level: string;
  effMastery: number;
  hasWork: boolean;
  lastActive: string | null;
  curriculumLessons: number;
  totalXp: number;
  /** Assignments in this cohort visible to the student / completed / last date. */
  assignedCount: number;
  completedCount: number;
  lastCompletedAt: string | null;
}

export interface LearnerBrief {
  id: string;
  name: string;
  segment: string;
  level: string;
}

export interface StudentReport {
  studentId: string;
  name: string;
  level: string;
  avgConfidence: number;
  skillsTracked: number;
  masteredCount: number;
  totalSessions: number;
  totalXp: number;
  /** Path lessons/exams actually attempted (earned work — tested-out excluded). */
  curriculumLessons: number;
  weakSkills: Array<{ name: string; confidence: number }>;
}

export interface LearnerProfile {
  id: string;
  userId: string;
  displayName: string;
  segment: string;
  nativeLanguage: string;
  domain: string;
  currentLevel: string;
  targetLevel: string;
  weeklyHours: number;
  createdAt: string;
}

export interface LearnerStats {
  streakDays: number;
  longestStreak: number;
  totalXp: number;
  level: number;
  totalSessions: number;
  skillsMastered: number;
  skillsLearning: number;
  totalSkills: number;
  currentLevel: string;
  learnerId: string;
}

export interface LearnerSkillState {
  skillId: string;
  confidence: number;
  status: string;
  totalAttempts: number;
  correctStreak: number;
  errorCount: number;
}

export interface Skill {
  skillId: string;
  category: string;
  subcategory: string;
  cefrLevel: string;
  displayNameEn: string;
  displayNameRu: string;
}

export interface ContentAtom {
  id: string;
  contentType: string;
  exerciseType: string | null;
  targetSkills: string[];
  cefrLevel: string;
  difficulty: number;
  estimatedTime: number;
  contentData: Record<string, unknown>;
}

export interface SessionItem {
  id: string;
  sessionId: string;
  position: number;
  contentId: string;
  skillId: string;
  role: string;
  completed: boolean;
  content?: ContentAtom;
}

export interface SessionWithItems {
  id: string;
  learnerId: string;
  status: string;
  currentIndex: number;
  totalXp: number;
  startedAt: string;
  accuracyRate: number;
  items: SessionItem[];
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
}

export interface SubmitResult {
  result: {
    id: string;
    isCorrect: boolean;
    errorType?: string;
    xpEarned: number;
  };
  xpEarned: number;
  errorType?: string;
}

export interface SessionHistory {
  id: string;
  status: string;
  totalXp: number;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  accuracyRate: number;
}

// ---- Admin analytics ----
export interface AnalyticsOverview {
  days: number;
  daily: Array<{ day: string; users: number; sessions: number; events: number }>;
  eventsByType: Array<{ type: string; count: number }>;
  totalEvents: number;
  totalSessions: number;
  totalUsers: number;
  avgSessionMs: number;
}
export interface RouteUsage {
  route: string;
  views: number;
  users: number;
  avgTimeMs: number;
}
export interface HeatCell {
  gx: number;
  gy: number;
  w: number;
}
export interface HeatmapGrid {
  route: string;
  gridW: number;
  gridH: number;
  maxW: number;
  cells: HeatCell[];
}
export interface AnalyticsEngagement {
  days: number;
  exitRoutes: Array<{ route: string; count: number }>;
  taskFunnel: Array<{ task: string; starts: number; completes: number; abandons: number }>;
  avgSessionMs: number;
}

// ---- Command & control (teacher + dean) ----
export interface C2Cohort {
  id: string;
  name: string;
  students: number;
  active: number;
  /** Members with ANY earned work (attempted lessons/exercises). */
  started: number;
  avgConfidence: number;
  joinCode?: string;
}
export interface RiskStudent {
  id: string;
  name: string;
  cohort: string;
  avgConfidence: number;
  lastActive: string | null;
  reason: string;
}
export interface TeacherC2 {
  teacherId: string;
  teacherName: string;
  students: number;
  activeStudents: number;
  /** Students with any earned work — avgConfidence averages over exactly these. */
  startedStudents: number;
  cohorts: number;
  assignments: number;
  avgConfidence: number;
  atRisk: number;
  cohortRows: C2Cohort[];
  riskStudents: RiskStudent[];
}
export interface TeacherPerf {
  teacherId: string;
  name: string;
  cohorts: number;
  students: number;
  activeStudents: number;
  /** Members with any earned work — avgConfidence averages over exactly these. */
  started: number;
  avgConfidence: number;
  assignments: number;
}
export interface DeanOverview {
  teachers: number;
  students: number;
  cohorts: number;
  activeStudents: number;
  startedStudents: number;
  avgConfidence: number;
  teacherRows: TeacherPerf[];
}

// ---- Institutions (multi-tenant) ----
export interface Institution {
  id: string;
  name: string;
  slug: string;
  joinCode: string;
  status: string;
  createdAt: string;
}
export interface InstTeacher {
  id: string;
  email: string;
  role: string;
}
export interface InstCohort {
  id: string;
  name: string;
  teacherId: string;
  teacherEmail: string;
  students: number;
}
export interface InstInvite {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

// Dean-assigned exams (a CEFR-level assessment scheduled for a cohort).
export interface AssignedExam {
  id: string;
  cohortId: string;
  cohortName?: string;
  teacherEmail?: string;
  level: string;
  title: string;
  passThreshold: number;
  dueAt: string | null;
  createdAt: string;
  assigned: number;
  completed: number;
  passed: number;
  avgScore: number;
}
export interface ExamResultRow {
  learnerId: string;
  name: string;
  correct: number | null;
  total: number | null;
  passed: boolean | null;
  completedAt: string | null;
}
export interface TeacherExamPerf {
  teacherId: string;
  exams: number;
  results: number;
  passed: number;
  avgScore: number;
  passRate: number;
}
export interface LearnerExam {
  id: string;
  title: string;
  level: string;
  cohortName: string;
  passThreshold: number;
  dueAt: string | null;
  completedAt: string | null;
  correct: number | null;
  total: number | null;
  passed: boolean | null;
}

// Staff activity log (dean's proactive-vs-passive panel).
export interface ActivityEvent {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  detail: string;
  createdAt: string;
}
export interface ActivityCount {
  actorId: string;
  count: number;
  lastAt: string;
}
export interface InstitutionMe {
  institution: Institution | null;
  role: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Tries to exchange the stored refresh token for a fresh access token.
  // Returns the new access token on success, or null. De-duplicated so that a
  // burst of parallel 401s triggers only one refresh round-trip.
  private refreshInFlight: Promise<string | null> | null = null;

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    // The refresh token rides in an httpOnly cookie (same-origin), so we send no
    // body — the server reads it from the cookie. It is never in JS-readable storage.
    this.refreshInFlight = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as AuthTokens;
        if (!data.accessToken) return null;
        auth.setTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  /** Force a token refresh so a just-changed role (e.g. after accepting an
   *  institution invite that made the caller a dean) is reflected in the access
   *  token before we route them to their dashboard. */
  async refreshSession(): Promise<boolean> {
    return (await this.refreshAccessToken()) !== null;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true
  ): Promise<T> {
    const token = auth.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include", // send httpOnly auth cookies (same-origin proxy)
    });

    if (res.status === 401) {
      // Offline / local-only sessions have no server identity to refresh against.
      // Surface the error so callers (Home, Leaderboard, …) degrade gracefully
      // instead of force-logging-out an offline learner and wiping their session.
      if (typeof window !== "undefined" && auth.isLocalOnly()) {
        throw new Error("Unauthorized");
      }
      // Access token likely expired — try a single silent refresh before
      // giving up and bouncing the user to /login.
      if (retry) {
        const newToken = await this.refreshAccessToken();
        if (newToken) {
          return this.request<T>(path, options, false);
        }
      }
      if (typeof window !== "undefined") {
        // Send the user back to THEIR portal (read the role before clearing it),
        // so an expired staff session lands on the staff sign-in, not /login.
        const dest = loginPathForRole(auth.getRole());
        auth.clear();
        window.location.href = dest;
      }
      throw new Error("Unauthorized");
    }

    // Read the body ONCE as text, then try to parse JSON. When the API backend is
    // down, the Next.js dev proxy returns a plain-text "Internal Server Error" (and
    // other error pages can be HTML) — calling res.json() on those throws a cryptic
    // "Unexpected token 'I', \"Internal S\"... is not valid JSON". Parse defensively.
    const raw = await res.text();
    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        /* non-JSON body (proxy/error page) — handled below */
      }
    }

    if (!res.ok) {
      const errMsg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : // 5xx / unparseable body ≈ the backend or proxy is unavailable. Use a
            // message the offline detector recognises so callers degrade gracefully
            // instead of dead-ending on a JSON parse crash.
            res.status >= 500
            ? "server_unavailable"
            : `request failed (${res.status})`;
      throw new Error(errMsg);
    }

    return data as T;
  }

  // Human-verification challenge (bot deterrence). getChallenge returns a puzzle
  // (or {disabled:true} when the gate is off); verifyChallenge exchanges a correct
  // selection for a single-use pass token that register/login then carry.
  async getChallenge(): Promise<Challenge> {
    return this.request("/v1/auth/challenge");
  }
  async verifyChallenge(id: string, selected: string[]): Promise<ChallengeResult> {
    return this.request("/v1/auth/challenge", { method: "POST", body: JSON.stringify({ id, selected }) });
  }

  // Auth — both endpoints return { user, tokens }, NOT a flat token object. A solved
  // `humanToken` (from verifyChallenge) is sent as X-Human-Token when the gate is on.
  // `name` is the account's display name — required and globally unique (case-insensitive).
  // 152-FZ (amended 1 Sept 2025) requires SEPARATE acceptances: `acceptedTerms` (Terms of
  // Service) and `acceptedDataProcessing` (standalone consent to processing of personal
  // data) — both required; the server records an auditable consent event. With email
  // verification on, this returns { verificationRequired, email } and NO tokens.
  async register(
    email: string,
    password: string,
    name: string,
    acceptedTerms: boolean,
    acceptedDataProcessing: boolean,
    // dateOfBirth is an ISO "YYYY-MM-DD" string — required; the authoritative age signal.
    dateOfBirth: string,
    humanToken?: string,
    role?: "teacher",
  ): Promise<RegisterResult> {
    return this.request("/v1/auth/register", {
      method: "POST",
      headers: humanToken ? { "X-Human-Token": humanToken } : undefined,
      body: JSON.stringify({ email, password, name, acceptedTerms, acceptedDataProcessing, dateOfBirth, ...(role ? { role } : {}) }),
    });
  }

  // Current legal document versions (for linking + display).
  async legalVersions(): Promise<{ terms: string; privacy: string; cookie: string; consent: string }> {
    return this.request("/v1/legal/versions");
  }

  // Inline signup check: is this email / display name still free? Only the fields passed
  // (and well-formed) are checked; returns the availability of each that was checked.
  async checkAvailability(fields: { email?: string; name?: string }): Promise<{ emailAvailable?: boolean; nameAvailable?: boolean }> {
    return this.request("/v1/auth/check-availability", { method: "POST", body: JSON.stringify(fields) });
  }

  // Confirm an emailed verification link.
  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    return this.request("/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  }

  // Ask the server to re-send a verification link. Always resolves (never reveals whether
  // the email exists); mail only goes out if the account exists and is unverified.
  async resendVerification(email: string): Promise<{ ok: boolean }> {
    return this.request("/v1/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
  }

  // `portal` names the sign-in surface ("learner" | "teacher" | "dean" | "admin").
  // The server binds each portal to one role and rejects a mismatch, so an admin
  // credential presented at the learner portal is refused (error: "wrong_portal").
  async login(email: string, password: string, portal?: string, humanToken?: string): Promise<AuthResponse> {
    return this.request("/v1/auth/token", {
      method: "POST",
      headers: humanToken ? { "X-Human-Token": humanToken } : undefined,
      body: JSON.stringify(portal ? { email, password, portal } : { email, password }),
    });
  }

  // Revoke the refresh token server-side and clear the auth cookies.
  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
    } catch {
      /* best-effort */
    }
  }

  // Profiles
  async createProfile(data: {
    displayName: string;
    segment: string;
    targetLevel: string;
    weeklyHours: number;
    domain?: string;
    targetDate?: string;
    consent?: { method: string; consenterEmail: string };
  }): Promise<LearnerProfile> {
    return this.request("/v1/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getProfiles(): Promise<LearnerProfile[]> {
    return this.request("/v1/profiles");
  }

  async getProfile(id: string): Promise<LearnerProfile> {
    return this.request(`/v1/profiles/${id}`);
  }

  // Stats
  async getStats(): Promise<LearnerStats> {
    return this.request("/v1/stats");
  }

  // Skills
  async getAllSkills(): Promise<Skill[]> {
    return this.request("/v1/skills");
  }

  async getLearnerSkills(): Promise<LearnerSkillState[]> {
    return this.request("/v1/skills/me");
  }

  async getWeakSkills(): Promise<LearnerSkillState[]> {
    return this.request("/v1/skills/weak");
  }

  // Sessions
  async generateSession(learnerId: string, timeBudgetMinutes: number): Promise<SessionWithItems> {
    return this.request("/v1/sessions/generate", {
      method: "POST",
      body: JSON.stringify({ learnerId, timeBudgetMinutes }),
    });
  }

  async getSessionState(sessionId: string): Promise<SessionWithItems> {
    return this.request(`/v1/sessions/${sessionId}/state`);
  }

  async submitAnswer(
    sessionId: string,
    data: {
      contentId: string;
      learnerId: string;
      response: string;
      correctAnswer: string;
      isCorrect: boolean;
      responseTimeMs: number;
      hintLevelUsed: number;
    }
  ): Promise<SubmitResult> {
    return this.request(`/v1/sessions/${sessionId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async completeSession(sessionId: string): Promise<SessionSummary> {
    return this.request(`/v1/sessions/${sessionId}/complete`, {
      method: "POST",
    });
  }

  async getSessionHistory(): Promise<SessionHistory[]> {
    return this.request("/v1/sessions/history");
  }

  // Leaderboard
  async getLeaderboard(scope: "friends" | "cohort" | "global" = "global"): Promise<LeaderboardResponse> {
    return this.request(`/v1/leaderboard?scope=${encodeURIComponent(scope)}`);
  }

  // Curriculum progress sync (cross-device)
  async getCurriculumProgress<T = unknown>(): Promise<T> {
    return this.request("/v1/curriculum/progress");
  }
  async putCurriculumProgress(data: unknown): Promise<{ ok: boolean }> {
    return this.request("/v1/curriculum/progress", { method: "PUT", body: JSON.stringify(data) });
  }

  // Teacher dashboard
  async getCohorts(): Promise<Cohort[]> {
    return this.request("/v1/teacher/cohorts");
  }
  async createCohort(name: string): Promise<Cohort> {
    return this.request("/v1/teacher/cohorts", { method: "POST", body: JSON.stringify({ name }) });
  }
  async getCohortHeatmap(id: string): Promise<Heatmap> {
    return this.request(`/v1/teacher/cohorts/${id}/heatmap`);
  }
  // Cohort joining is CONSENT-based: the teacher can only INVITE (the student
  // accepts/declines) or share a join code (the student redeems it).
  async inviteCohortMember(id: string, learnerId: string): Promise<{ ok: boolean }> {
    return this.request(`/v1/teacher/cohorts/${id}/invites`, { method: "POST", body: JSON.stringify({ learnerId }) });
  }
  async getCohortInvites(id: string): Promise<CohortInvite[]> {
    return this.request(`/v1/teacher/cohorts/${id}/invites`);
  }
  async rotateCohortCode(id: string): Promise<{ joinCode: string }> {
    return this.request(`/v1/teacher/cohorts/${id}/code`, { method: "POST", body: "{}" });
  }
  /** Remove a student from the teacher's cohort (drops membership + invite + targeting). */
  async removeCohortMember(id: string, learnerId: string): Promise<{ removed: boolean }> {
    return this.request(`/v1/teacher/cohorts/${id}/members/${learnerId}`, { method: "DELETE" });
  }
  /** Per-student desk stats for the classroom view. */
  async getCohortRoster(id: string): Promise<RosterStudent[]> {
    return this.request(`/v1/teacher/cohorts/${id}/roster`);
  }
  // Learner side of joining:
  async getMyCohortInvites(): Promise<CohortInvite[]> {
    return this.request("/v1/me/cohort-invites");
  }
  async respondCohortInvite(id: string, accept: boolean): Promise<{ status: string; cohortName?: string }> {
    return this.request(`/v1/me/cohort-invites/${id}/respond`, { method: "POST", body: JSON.stringify({ accept }) });
  }
  async joinCohort(code: string): Promise<{ status: string; cohortName: string }> {
    return this.request("/v1/cohorts/join", { method: "POST", body: JSON.stringify({ code }) });
  }
  async getMyAssignments(): Promise<LearnerAssignment[]> {
    return this.request("/v1/me/assignments");
  }
  async searchLearners(q: string): Promise<LearnerBrief[]> {
    return this.request(`/v1/teacher/learners?q=${encodeURIComponent(q)}`);
  }
  async getAssignments(): Promise<Assignment[]> {
    return this.request("/v1/teacher/assignments");
  }
  async createAssignment(data: {
    cohortId: string;
    title: string;
    targetSkills: string[];
    minExercises: number;
    deadline?: string;
    /** Narrow to specific cohort members; omit for the whole cohort. */
    learnerIds?: string[];
    /** Attach the teacher's own Студия materials. */
    contentIds?: string[];
    /** Countdown per question in seconds (0/omit = no timer). */
    timePerQuestionSec?: number;
  }): Promise<Assignment> {
    return this.request("/v1/teacher/assignments", { method: "POST", body: JSON.stringify(data) });
  }
  /** Learner marks an assignment's materials finished. Single attempt: the
   *  server keeps only the FIRST completion's results and score, and awards
   *  XP once (+10 per correct, −5 per miss). */
  async completeAssignment(id: string, results: CompletionItemResult[] = []): Promise<{ completed: boolean; xpAwarded: number }> {
    return this.request(`/v1/me/assignments/${id}/complete`, { method: "POST", body: JSON.stringify({ results }) });
  }
  /** Teacher drill-down: which assignments one student did/didn't do, with the
   *  per-question results of their single recorded attempt. */
  async getStudentAssignments(cohortId: string, learnerId: string): Promise<StudentAssignmentStatus[]> {
    return this.request(`/v1/teacher/cohorts/${cohortId}/students/${learnerId}/assignments`);
  }
  /** Path lesson runner: report answered questions (batched, fire-and-forget). */
  async recordPathAnswers(answers: Array<{ questionId: string; lessonId: string; prompt: string; response: string; correctAnswer: string; isCorrect: boolean }>): Promise<{ ok: boolean }> {
    return this.request("/v1/curriculum/answers", { method: "POST", body: JSON.stringify({ answers }) });
  }
  /** Full answer sheet for one student × one assignment («Ответы ↗»). */
  async getAssignmentAnswers(cohortId: string, learnerId: string, assignmentId: string): Promise<AnswerSheet> {
    return this.request(`/v1/teacher/cohorts/${cohortId}/students/${learnerId}/assignments/${assignmentId}/answers`);
  }
  /** Period report: per-student activity between two dates (inclusive). */
  async getCohortReport(cohortId: string, from: string, to: string): Promise<CohortReport> {
    return this.request(`/v1/teacher/cohorts/${cohortId}/report?from=${from}&to=${to}`);
  }
  /** Attach a teacher note to one student's report for the given period. */
  async addReportComment(cohortId: string, learnerId: string, from: string, to: string, comment: string): Promise<{ ok: boolean }> {
    return this.request(`/v1/teacher/cohorts/${cohortId}/report/comment`, {
      method: "POST",
      body: JSON.stringify({ learnerId, from, to, comment }),
    });
  }
  /** Learner delivery: the materials attached to an assignment the caller can see. */
  async getAssignmentContent(id: string): Promise<TeacherContent[]> {
    return this.request(`/v1/me/assignments/${id}/content`);
  }
  /** Approved platform-wide pool (Phase C). */
  async getGlobalContent(level?: string): Promise<TeacherContent[]> {
    return this.request(`/v1/content/global${level ? `?level=${encodeURIComponent(level)}` : ""}`);
  }
  // Admin moderation queue:
  async getContentReviews(): Promise<PendingReview[]> {
    return this.request("/v1/admin/content/reviews");
  }
  async resolveContentReview(contentId: string, approve: boolean, feedback: string): Promise<{ ok: boolean }> {
    return this.request(`/v1/admin/content/${contentId}/review`, { method: "POST", body: JSON.stringify({ approve, feedback }) });
  }
  async getStudentReport(id: string): Promise<StudentReport> {
    return this.request(`/v1/teacher/students/${id}/report`);
  }

  // Студия Phase A — authored content (author-scoped on the server).
  async createContent(data: {
    title: string;
    exerciseType: string;
    contentData: Record<string, unknown>;
    cefrLevel?: string;
    topic?: string;
    targetSkills?: string[];
  }): Promise<TeacherContent> {
    return this.request("/v1/teacher/content", { method: "POST", body: JSON.stringify(data) });
  }
  async listContent(): Promise<TeacherContent[]> {
    return this.request("/v1/teacher/content");
  }
  async updateContent(id: string, data: {
    title: string;
    exerciseType: string;
    contentData: Record<string, unknown>;
    cefrLevel?: string;
    topic?: string;
    targetSkills?: string[];
  }): Promise<TeacherContent> {
    return this.request(`/v1/teacher/content/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  async deleteContent(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/teacher/content/${id}`, { method: "DELETE" });
  }
  async submitContent(id: string): Promise<TeacherContent> {
    return this.request(`/v1/teacher/content/${id}/submit`, { method: "POST", body: "{}" });
  }

  // Admin analytics (role-gated to admins server-side)
  async getAnalyticsOverview(days = 14): Promise<AnalyticsOverview> {
    return this.request(`/v1/admin/analytics/overview?days=${days}`);
  }
  async getAnalyticsRoutes(days = 14): Promise<RouteUsage[]> {
    return this.request(`/v1/admin/analytics/routes?days=${days}`);
  }
  async getAnalyticsHeatmap(route: string, days = 14): Promise<HeatmapGrid> {
    return this.request(`/v1/admin/analytics/heatmap?route=${encodeURIComponent(route)}&days=${days}`);
  }
  async getAnalyticsEngagement(days = 14): Promise<AnalyticsEngagement> {
    return this.request(`/v1/admin/analytics/engagement?days=${days}`);
  }

  // Teacher command center + Dean command & control
  async getTeacherOverview(): Promise<TeacherC2> {
    return this.request("/v1/teacher/overview");
  }
  async getDeanOverview(): Promise<DeanOverview> {
    return this.request("/v1/dean/overview");
  }
  async getDeanTeacher(id: string): Promise<TeacherC2> {
    return this.request(`/v1/dean/teachers/${id}`);
  }

  // Institutions (multi-tenant)
  async getInstitutionMe(): Promise<InstitutionMe> {
    return this.request("/v1/institution/me");
  }
  async joinInstitution(code: string): Promise<Institution> {
    return this.request("/v1/institution/join", { method: "POST", body: JSON.stringify({ code }) });
  }
  async acceptInvite(token: string): Promise<{ institution: Institution; role: string }> {
    return this.request("/v1/institution/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
  }
  async inviteTeacher(email: string, role = "teacher"): Promise<{ token: string; email: string; role: string }> {
    return this.request("/v1/institution/invites", { method: "POST", body: JSON.stringify({ email, role }) });
  }
  async getInstitutionStudents(q = ""): Promise<LearnerBrief[]> {
    return this.request(`/v1/institution/students?q=${encodeURIComponent(q)}`);
  }
  async getInstitutionTeachers(): Promise<InstTeacher[]> {
    return this.request("/v1/institution/teachers");
  }
  async assignCohort(name: string, teacherId: string): Promise<Cohort> {
    return this.request("/v1/institution/cohorts", { method: "POST", body: JSON.stringify({ name, teacherId }) });
  }
  async enrolStudent(cohortId: string, learnerId: string): Promise<{ ok: boolean }> {
    return this.request(`/v1/institution/cohorts/${cohortId}/members`, { method: "POST", body: JSON.stringify({ learnerId }) });
  }

  // ---- Dean management (institution-scoped) ----
  async getInstitutionCohorts(): Promise<InstCohort[]> {
    return this.request("/v1/institution/cohorts");
  }
  async updateInstitutionCohort(id: string, data: { name?: string; teacherId?: string }): Promise<{ ok: boolean }> {
    return this.request(`/v1/institution/cohorts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  async deleteInstitutionCohort(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/institution/cohorts/${id}`, { method: "DELETE" });
  }
  async removeInstitutionCohortStudent(cohortId: string, learnerId: string): Promise<{ removed: boolean }> {
    return this.request(`/v1/institution/cohorts/${cohortId}/members/${learnerId}`, { method: "DELETE" });
  }
  async removeInstitutionTeacher(userId: string): Promise<{ removed: boolean }> {
    return this.request(`/v1/institution/teachers/${userId}`, { method: "DELETE" });
  }
  async setInstitutionTeacherRole(userId: string, role: "teacher" | "dean"): Promise<{ ok: boolean }> {
    return this.request(`/v1/institution/teachers/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
  }
  async unenrolInstitutionStudent(learnerId: string): Promise<{ removed: boolean }> {
    return this.request(`/v1/institution/students/${learnerId}`, { method: "DELETE" });
  }
  async getInstitutionInvites(): Promise<InstInvite[]> {
    return this.request("/v1/institution/invites");
  }
  async revokeInstitutionInvite(id: string): Promise<{ revoked: boolean }> {
    return this.request(`/v1/institution/invites/${id}`, { method: "DELETE" });
  }
  async renameInstitution(name: string): Promise<Institution> {
    return this.request("/v1/institution", { method: "PATCH", body: JSON.stringify({ name }) });
  }
  async rotateInstitutionCode(): Promise<{ joinCode: string }> {
    return this.request("/v1/institution/code", { method: "POST", body: "{}" });
  }

  // ---- Dean-assigned exams ----
  async getInstitutionExams(): Promise<AssignedExam[]> {
    return this.request("/v1/institution/exams");
  }
  async createInstitutionExam(data: { cohortId: string; level: string; title: string; dueAt?: string; passThreshold?: number }): Promise<AssignedExam> {
    return this.request("/v1/institution/exams", { method: "POST", body: JSON.stringify(data) });
  }
  async deleteInstitutionExam(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/institution/exams/${id}`, { method: "DELETE" });
  }
  async getInstitutionExamResults(id: string): Promise<ExamResultRow[]> {
    return this.request(`/v1/institution/exams/${id}/results`);
  }
  async getInstitutionExamPerformance(): Promise<TeacherExamPerf[]> {
    return this.request("/v1/institution/exam-performance");
  }
  async getInstitutionActivity(): Promise<ActivityEvent[]> {
    return this.request("/v1/institution/activity");
  }
  async getInstitutionActivityCounts(): Promise<ActivityCount[]> {
    return this.request("/v1/institution/activity/counts");
  }

  // ---- Learner: dean-assigned exams ----
  async getMyExams(): Promise<LearnerExam[]> {
    return this.request("/v1/me/exams");
  }
  async getMyExam(id: string): Promise<LearnerExam> {
    return this.request(`/v1/me/exams/${id}`);
  }
  // The learner's raw per-question answers are sent; the server re-grades them against
  // its own answer key and derives correct/total/passed (a client-asserted score would
  // be trivially forgeable). Returns the server's authoritative correct/total.
  async submitMyExam(
    id: string,
    answers: Array<{ id: string; response: string; correct: boolean }>,
  ): Promise<{ recorded: boolean; correct: number; total: number }> {
    return this.request(`/v1/me/exams/${id}/submit`, { method: "POST", body: JSON.stringify({ answers }) });
  }
}

export const api = new ApiClient(API_BASE);
