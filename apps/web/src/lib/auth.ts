// Centralized client-side auth/session storage.
//
// SECURITY: the access token is NEVER written to localStorage (XSS-exfiltratable).
// It lives only in an in-memory module variable for the Bearer fallback; same-origin
// requests authenticate via the httpOnly `access_token` cookie set by the API (see
// api.ts credentials:"include"). Only NON-sensitive signals are persisted: an
// is_authenticated flag (so nav survives reload) and the display-only role. The
// refresh token likewise lives only in an httpOnly cookie. An XSS foothold therefore
// cannot read a usable long-lived credential out of storage.

// In-memory only — cleared on reload (the cookie re-authenticates same-origin calls).
let memAccessToken: string | null = null;

const AUTH_FLAG = "is_authenticated"; // non-sensitive: "true" once signed in
const USER_ROLE = "user_role"; // non-sensitive, display-only (server enforces authz)
const LEARNER_ID = "learner_id";
const DISPLAY_NAME = "display_name";
const LEARNER_SEGMENT = "learner_segment";
const PLACEMENT_COMPLETED = "placement_completed";
const CURRENT_LEVEL = "current_level"; // the ENTRY level (KYC / placement) — feeds seeding
const WORKING_LEVEL = "working_level"; // the LIVE level derived from curriculum progress
const LOCAL_ONLY = "local_only";
const ENGLISH_LEVEL = "english_level";
const GLOSS_GRAMMAR = "gloss_grammar"; // "0" = off (fluent), else on

// Every per-user key — used to wipe state on logout / before a new sign-in so
// nothing (e.g. a previous user's placement_completed flag) leaks across sessions
// on a shared browser. (The access/refresh tokens are not here — they're not in
// localStorage; clear() also nulls the in-memory access token and legacy keys.)
const ALL_KEYS = [
  AUTH_FLAG,
  USER_ROLE,
  LEARNER_ID,
  DISPLAY_NAME,
  LEARNER_SEGMENT,
  PLACEMENT_COMPLETED,
  CURRENT_LEVEL,
  WORKING_LEVEL,
  LOCAL_ONLY,
  ENGLISH_LEVEL,
  GLOSS_GRAMMAR,
  // legacy keys wiped for back-compat with sessions from before this change:
  "access_token",
  "refresh_token",
];

function decodeRole(token: string): string {
  if (!token || token.indexOf(".") < 0) return "";
  try {
    let b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const obj = JSON.parse(atob(b));
    return typeof obj.role === "string" ? obj.role : "";
  } catch {
    return "";
  }
}

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function set(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export const auth = {
  // In-memory access token (null after a reload — same-origin calls use the cookie).
  getAccessToken: () => memAccessToken,

  setTokens(accessToken: string, _refreshToken?: string) {
    // Access token → memory only (not localStorage). Refresh token → httpOnly cookie
    // set by the API. Persist just the non-sensitive auth flag + display-only role.
    if (accessToken) {
      memAccessToken = accessToken;
      set(AUTH_FLAG, "true");
      const role = decodeRole(accessToken);
      if (role) set(USER_ROLE, role);
    }
  },

  getLearnerId: () => get(LEARNER_ID),
  getDisplayName: () => get(DISPLAY_NAME),
  getSegment: () => get(LEARNER_SEGMENT),
  getCurrentLevel: () => get(CURRENT_LEVEL),

  // Display-only role for showing/hiding staff nav — read from the non-sensitive
  // stored value (survives reload) or the in-memory token. The server enforces the
  // real authorization on every endpoint regardless of this.
  getRole(): string {
    return get(USER_ROLE) || (memAccessToken ? decodeRole(memAccessToken) : "");
  },
  getEnglishLevel: () => get(ENGLISH_LEVEL),

  // The level the learner is actually working at right now, derived from
  // curriculum progress by the Path page. This is the single value every page
  // (Home, Leaderboard) should show so "Level" never disagrees across the app.
  // Kept separate from CURRENT_LEVEL, which is the fixed entry point that seeds
  // placement — overwriting that as the learner advances would re-trigger seeding.
  getWorkingLevel: () => get(WORKING_LEVEL),
  setWorkingLevel(level: string) {
    if (level) set(WORKING_LEVEL, level);
  },

  // Grammar-term glossing: on unless explicitly disabled (fluent learners).
  isGlossOn: () => get(GLOSS_GRAMMAR) !== "0",
  setGloss(on: boolean) {
    set(GLOSS_GRAMMAR, on ? "1" : "0");
  },

  isPlacementCompleted: () => get(PLACEMENT_COMPLETED) === "true",
  setPlacementCompleted(done: boolean) {
    set(PLACEMENT_COMPLETED, done ? "true" : "false");
  },

  setProfile(p: { id?: string; displayName?: string; segment?: string; currentLevel?: string; englishLevel?: string }) {
    if (p.id) set(LEARNER_ID, p.id);
    if (p.displayName) set(DISPLAY_NAME, p.displayName);
    if (p.segment) set(LEARNER_SEGMENT, p.segment);
    if (p.currentLevel) set(CURRENT_LEVEL, p.currentLevel);
    if (p.englishLevel) {
      set(ENGLISH_LEVEL, p.englishLevel);
      // "fluent" = comfortable with grammar terms → no glossing. Otherwise on.
      set(GLOSS_GRAMMAR, p.englishLevel === "fluent" ? "0" : "1");
    }
  },

  // Authenticated if the non-sensitive flag is set (survives reload) or we hold an
  // in-memory token. The httpOnly cookie is what actually authorizes requests.
  isAuthenticated: () => get(AUTH_FLAG) === "true" || !!memAccessToken,

  isLocalOnly: () => get(LOCAL_ONLY) === "true",

  // Start an offline-only session when the API is unreachable. The curriculum is
  // fully client-side, so the learner can keep going; data syncs once a real
  // backend account is created. Returns the generated local learner id.
  startLocalSession(p: { displayName?: string; segment?: string }): string {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `local-${crypto.randomUUID()}`
        : `local-${Date.now()}`;
    memAccessToken = "local-session";
    set(AUTH_FLAG, "true");
    set(LEARNER_ID, id);
    set(LOCAL_ONLY, "true");
    if (p.displayName) set(DISPLAY_NAME, p.displayName);
    if (p.segment) set(LEARNER_SEGMENT, p.segment);
    return id;
  },

  // Wipe ALL per-user state. Used on logout and before a fresh sign-up so that a
  // shared browser never inherits the previous user's session or placement flag.
  clear() {
    memAccessToken = null;
    if (typeof window === "undefined") return;
    for (const key of ALL_KEYS) window.localStorage.removeItem(key);
  },
};
