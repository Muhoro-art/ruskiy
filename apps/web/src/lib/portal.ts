// Portal model — one sign-in surface per account role.
//
// Each role has its OWN login page, and the server binds every login to exactly
// one portal (see services/api/internal/handler/auth.go): a staff account cannot
// authenticate through the learner portal and vice-versa, even with valid
// credentials. This file is the single client-side source of truth for which
// portal a role uses, where its login lives, and where it lands after sign-in —
// consumed by the login pages, the route guards, and the post-login redirects so
// they can never drift apart.

export type PortalId = "learner" | "teacher" | "dean" | "admin";

export interface PortalConfig {
  id: PortalId;
  /** Account role this portal accepts (always equal to id). */
  role: PortalId;
  /** Short human label, e.g. "Teacher". */
  label: string;
  /** Heading shown on the login card. */
  title: string;
  /** One-line description under the heading. */
  subtitle: string;
  /** URL of this portal's login page. */
  loginPath: string;
  /** Where a successful sign-in lands. */
  home: string;
  /** Learner is the public portal; the rest are staff. */
  staff: boolean;
}

export const PORTALS: Record<PortalId, PortalConfig> = {
  learner: {
    id: "learner",
    role: "learner",
    label: "Learner",
    title: "Welcome back",
    subtitle: "Continue learning Russian.",
    loginPath: "/login",
    home: "/dashboard",
    staff: false,
  },
  teacher: {
    id: "teacher",
    role: "teacher",
    label: "Teacher",
    title: "Teacher sign-in",
    subtitle: "Your cohorts, assignments and class insights.",
    loginPath: "/staff/teacher",
    home: "/dashboard/teacher",
    staff: true,
  },
  dean: {
    id: "dean",
    role: "dean",
    label: "Dean",
    title: "Dean sign-in",
    subtitle: "Institution-wide oversight and reporting.",
    loginPath: "/staff/dean",
    home: "/dashboard/dean",
    staff: true,
  },
  admin: {
    id: "admin",
    role: "admin",
    label: "Admin",
    title: "Admin sign-in",
    subtitle: "Platform monitoring & operations.",
    loginPath: "/staff/admin",
    home: "/admin",
    staff: true,
  },
};

/** The staff portals, in the order shown on the chooser. */
export const STAFF_PORTALS: PortalConfig[] = [PORTALS.teacher, PORTALS.dean, PORTALS.admin];

/** The home page a signed-in account of this role should land on. */
export function homeForRole(role: string | null | undefined): string {
  const p = role ? PORTALS[role as PortalId] : undefined;
  return p ? p.home : "/dashboard";
}

/** The login page an account of this role must use. */
export function loginPathForRole(role: string | null | undefined): string {
  const p = role ? PORTALS[role as PortalId] : undefined;
  return p ? p.loginPath : "/login";
}
