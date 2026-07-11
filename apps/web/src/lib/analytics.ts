// In-house product analytics: batches lightweight behavioral events (page views,
// clicks, dwell, task start/complete/abandon, session boundaries) to the API for
// the admin monitoring panel.
//
// PRIVACY: analytics runs ONLY for segments known to be adults (an allowlist), so
// every minor segment (kid/toddler/teen) AND any unknown/empty segment fail closed
// — nothing is captured or sent (the server drops them too as a backstop). No
// keystrokes, form values, or PII are collected — only routes, viewport-normalized
// click coordinates, timings, and element labels that carry an explicit
// data-analytics tag (arbitrary DOM text is never read).

import { auth } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const FLUSH_MS = 10_000;
const MAX_QUEUE = 40;
// Adult-only allowlist mirrors the server (handler/analytics.go adultSegments).
const ADULT_SEGMENTS = new Set(["uni_prep", "daily_life", "migrant", "senior", "professional", "core"]);

// sendBeacon can't set an Authorization header, and a SameSite=Lax auth cookie
// isn't sent on cross-site requests — so only beacon when the API is same-origin;
// otherwise fall back to a keepalive fetch that carries the Bearer token.
const SAME_ORIGIN = (() => {
  try {
    return typeof window === "undefined" || new URL(BASE, window.location.origin).origin === window.location.origin;
  } catch {
    return true;
  }
})();

interface Ev {
  type: string;
  route?: string;
  element?: string;
  x?: number;
  y?: number;
  vw?: number;
  vh?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
  clientTs?: string;
}

let started = false;
let ended = false;
let sessionId = "";
let queue: Ev[] = [];
let lastRoute = "";
let sessionStart = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!auth.isAuthenticated() || auth.isLocalOnly()) return false;
  // Cookie consent: analytics only runs if the user accepted optional (non-essential)
  // cookies. Anything other than an explicit "all" (declined, or not yet chosen) → off.
  try {
    if (localStorage.getItem("cookie_consent") !== "all") return false;
  } catch {
    return false;
  }
  return ADULT_SEGMENTS.has(auth.getSegment() || ""); // fail closed for minors/unknown
}

function newSessionId(): string {
  try {
    const existing = sessionStorage.getItem("an_sid");
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem("an_sid", id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function push(ev: Ev) {
  if (!enabled()) return;
  ev.clientTs = new Date().toISOString();
  queue.push(ev);
  if (queue.length >= MAX_QUEUE) flush();
}

function flush(beacon = false) {
  if (!queue.length || !sessionId) return;
  const events = queue;
  queue = [];
  send({ sessionId, events }, beacon);
}

function send(payload: unknown, beacon: boolean) {
  const url = `${BASE}/v1/analytics/events`;
  const body = JSON.stringify(payload);
  // On unload, sendBeacon is the only reliable transport (relies on same-origin
  // cookies for auth, since beacons can't set an Authorization header).
  if (beacon && SAME_ORIGIN && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    } catch {
      /* fall through to fetch */
    }
  }
  const token = auth.getAccessToken();
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
    keepalive: true,
    credentials: "include",
  }).catch(() => {});
}

// Derive a short, non-PII label for a clicked element. ONLY an explicit
// data-analytics attribute is recorded — we never read aria-label or textContent,
// because those can contain other people's names / free text (a student roster row,
// the signed-in user's own name, search results). Untagged elements fall back to the
// bare tag name, which carries no PII.
function labelFor(el: Element): string {
  let n: Element | null = el;
  for (let i = 0; i < 4 && n; i++) {
    const d = (n as HTMLElement).dataset;
    if (d && d.analytics) return d.analytics.slice(0, 60);
    n = n.parentElement;
  }
  return el.tagName.toLowerCase();
}

function onClick(e: MouseEvent) {
  const t = e.target as Element | null;
  if (!t || typeof window === "undefined") return;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  push({ type: "click", route: location.pathname, element: labelFor(t), x: e.clientX / vw, y: e.clientY / vh, vw, vh });
}

// Tab hidden/backgrounded: flush queued events so nothing is lost if the tab is
// later killed. We do NOT end the session here (a tab switch isn't a session end).
// Named (not an inline arrow) so stop() can removeEventListener it.
function onVisibility() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") flush(true);
}

// End the session exactly once (guarded), emitting a session_end marker. Session
// duration is derived server-side from the event stream, so no dwell is sent here.
function endSession() {
  if (!started || ended) return;
  ended = true;
  push({ type: "session_end", route: lastRoute || (typeof location !== "undefined" ? location.pathname : ""), durationMs: Date.now() - sessionStart });
  flush(true);
}

export const analytics = {
  /** Start capturing (idempotent). No-op for signed-out / offline / minor sessions. */
  init() {
    if (started || !enabled()) return;
    started = true;
    ended = false;
    sessionId = newSessionId();
    sessionStart = Date.now();
    push({ type: "session_start", route: location.pathname });
    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", endSession);
    timer = setInterval(() => flush(), FLUSH_MS);
    this.page(location.pathname);
  },

  /** Record a route view. Safe to call repeatedly (deduped on the current route). */
  page(route: string) {
    if (!enabled() || route === lastRoute) return;
    push({ type: "page_view", route, meta: lastRoute ? { from: lastRoute } : undefined });
    lastRoute = route;
  },

  /** Record a task lifecycle event (start / complete / abandon) for funnels. */
  task(name: string, phase: "start" | "complete" | "abandon", meta?: Record<string, unknown>) {
    push({ type: `task_${phase}`, route: typeof location !== "undefined" ? location.pathname : "", meta: { task: name, ...(meta || {}) } });
  },

  /** Stop capturing (used on sign-out): flush the queue + emit a clean session_end,
   *  detach listeners, and reset so the next user in this tab starts fresh. */
  stop() {
    if (started) {
      endSession(); // final session_end + flush the pending queue before detaching
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", endSession);
    }
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
    ended = false;
    lastRoute = "";
    sessionId = "";
    sessionStart = 0;
    try {
      sessionStorage.removeItem("an_sid"); // next user gets a new session id
    } catch {
      /* ignore */
    }
  },
};
