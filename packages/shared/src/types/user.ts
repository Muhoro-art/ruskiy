export type AccountType = "free" | "premium" | "institutional" | "family";

export interface User {
  id: string;
  email: string;
  createdAt: string;
  lastLogin: string | null;
  accountType: AccountType;
  subscriptionId: string | null;
  locale: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  locale?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
