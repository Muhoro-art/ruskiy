const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
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

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
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
    });

    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data as T;
  }

  // Auth
  async register(email: string, password: string): Promise<AuthTokens> {
    return this.request("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    return this.request("/v1/auth/token", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // Profiles
  async createProfile(data: {
    displayName: string;
    segment: string;
    targetLevel: string;
    weeklyHours: number;
    domain?: string;
    targetDate?: string;
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
}

export const api = new ApiClient(API_BASE);
