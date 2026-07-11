"use client";

// The admin panel uses the shared dashboard design system (see
// components/dashboard/ui.tsx) so admin, teacher, and dean surfaces stay consistent.
export * from "@/components/dashboard/ui";

// ---------------------------------------------------------------------------
// Human-readable route labels for analytics screens.
//
// Raw analytics store the actual pathname a learner visited, e.g.
// "/dashboard/path" or "/dashboard/dean/teachers/d7a0a9bd-...". Those are noise
// to an admin reading a heatmap dropdown or an exit-route chart, so we map the
// known screens to plain names and collapse dynamic id segments.
// ---------------------------------------------------------------------------

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Exact pathname → friendly name. Keep in sync with the app router.
const EXACT_ROUTES: Record<string, string> = {
  "/": "Landing page",
  "/login": "Sign in",
  "/signup": "Sign up",
  "/dashboard": "Home",
  "/dashboard/path": "Learning Path",
  "/dashboard/learn": "Practice Session",
  "/dashboard/library": "Content Library",
  "/dashboard/leaderboard": "Leaderboard",
  "/dashboard/placement": "Placement Test",
  "/dashboard/level-check": "Level Check",
  "/dashboard/join": "Join Institution",
  // Teacher surfaces
  "/dashboard/teacher": "Teacher · Command Center",
  "/dashboard/cohorts": "Teacher · Cohorts",
  "/dashboard/cohorts/new": "Teacher · New Cohort",
  "/dashboard/assignments": "Teacher · Assignments",
  "/dashboard/assignments/new": "Teacher · New Assignment",
  // Dean surfaces
  "/dashboard/dean": "Dean · Overview",
  "/dashboard/dean/institution": "Dean · Institution Admin",
  // Admin surfaces
  "/admin": "Admin · Overview",
  "/admin/heatmap": "Admin · Click Heatmap",
  "/admin/engagement": "Admin · Engagement",
};

// Dynamic routes: a prefix that ends in a dynamic id segment → friendly name.
const DYNAMIC_ROUTES: Array<[string, string]> = [
  ["/dashboard/dean/teachers/", "Dean · Teacher detail"],
  ["/dashboard/cohorts/", "Teacher · Cohort detail"],
  ["/dashboard/assignments/", "Teacher · Assignment detail"],
  ["/dashboard/students/", "Student report"],
];

/**
 * routeLabel turns a raw analytics pathname into a human-readable screen name.
 * Unknown routes fall back to the path itself with any id segments collapsed,
 * so nothing is ever hidden — it just reads more clearly.
 */
export function routeLabel(path: string): string {
  if (!path) return "—";
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";

  const exact = EXACT_ROUTES[clean];
  if (exact) return exact;

  if (UUID_RE.test(clean) || /\/\d+$/.test(clean)) {
    for (const [prefix, label] of DYNAMIC_ROUTES) {
      if (clean.startsWith(prefix)) return label;
    }
    // Unknown dynamic route: keep the shape but hide the raw id.
    return clean.replace(UUID_RE, ":id").replace(/\/\d+$/, "/:id");
  }

  return clean;
}
