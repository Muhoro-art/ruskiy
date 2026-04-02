import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getToken(): Promise<string | null> {
    return AsyncStorage.getItem("access_token");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    if (res.status === 401) {
      await AsyncStorage.multiRemove(["access_token", "refresh_token", "learner_id"]);
      throw new Error("Unauthorized");
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data as T;
  }

  // Auth
  async register(email: string, password: string) {
    const data = await this.request<{ accessToken: string; refreshToken: string; userId: string }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await AsyncStorage.setItem("access_token", data.accessToken);
    await AsyncStorage.setItem("refresh_token", data.refreshToken);
    await AsyncStorage.setItem("user_id", data.userId);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<{ accessToken: string; refreshToken: string; userId: string }>("/v1/auth/token", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await AsyncStorage.setItem("access_token", data.accessToken);
    await AsyncStorage.setItem("refresh_token", data.refreshToken);
    await AsyncStorage.setItem("user_id", data.userId);
    return data;
  }

  async logout() {
    await AsyncStorage.multiRemove(["access_token", "refresh_token", "user_id", "learner_id"]);
  }

  // Profiles
  async createProfile(data: {
    displayName: string;
    segment: string;
    targetLevel: string;
    weeklyHours: number;
    domain?: string;
  }) {
    const profile = await this.request<{ id: string }>("/v1/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    });
    await AsyncStorage.setItem("learner_id", profile.id);
    return profile;
  }

  async getProfiles() {
    return this.request<Array<{ id: string; displayName: string; segment: string; currentLevel: string }>>("/v1/profiles");
  }

  // Stats
  async getStats() {
    return this.request<{
      streakDays: number;
      totalXp: number;
      level: number;
      totalSessions: number;
      skillsMastered: number;
      skillsLearning: number;
      totalSkills: number;
      currentLevel: string;
      learnerId: string;
    }>("/v1/stats");
  }

  // Skills
  async getWeakSkills() {
    return this.request<Array<{ skillId: string; confidence: number; status: string }>>("/v1/skills/weak");
  }

  async getLearnerSkills() {
    return this.request<Array<{ skillId: string; confidence: number; status: string; totalAttempts: number }>>("/v1/skills/me");
  }

  // Sessions
  async generateSession(learnerId: string, timeBudgetMinutes: number) {
    return this.request<{
      id: string;
      learnerId: string;
      status: string;
      items: Array<{
        id: string;
        contentId: string;
        skillId: string;
        role: string;
        content?: { exerciseType: string; contentType: string; contentData: Record<string, unknown> };
      }>;
    }>("/v1/sessions/generate", {
      method: "POST",
      body: JSON.stringify({ learnerId, timeBudgetMinutes }),
    });
  }

  async submitAnswer(sessionId: string, data: {
    contentId: string;
    learnerId: string;
    response: string;
    correctAnswer: string;
    isCorrect: boolean;
    responseTimeMs: number;
    hintLevelUsed: number;
  }) {
    return this.request(`/v1/sessions/${sessionId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async completeSession(sessionId: string) {
    return this.request(`/v1/sessions/${sessionId}/complete`, { method: "POST" });
  }

  async getSessionHistory() {
    return this.request<Array<{
      id: string;
      totalXp: number;
      startedAt: string;
      duration: number;
      accuracyRate: number;
      status: string;
    }>>("/v1/sessions/history");
  }
}

export const api = new ApiClient(API_BASE);
