"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/auth";
import { api } from "@/lib/api";
import { sound } from "@/lib/sound";
import { analytics } from "@/lib/analytics";
import { buttonClasses } from "@/components/ui";
import { homeForRole } from "@/lib/portal";
import IdleLogout from "@/components/auth/IdleLogout";
import OnboardingTours, { startTour } from "@/components/onboarding/OnboardingTours";
import { welcomeTourFor } from "@/components/onboarding/tours";

// Staff areas hosted inside the learner shell and the roles that may enter them.
// Mirrors the server gates (RequireAnyRole('teacher','dean') for teacher tools,
// RequireRole('dean') for the dean panel). Returns null for learner areas.
function requiredRolesForPath(path: string): string[] | null {
  if (path === "/dashboard/dean" || path.startsWith("/dashboard/dean/")) return ["dean"];
  if (
    path === "/dashboard/teacher" ||
    path.startsWith("/dashboard/teacher/") ||
    path.startsWith("/dashboard/cohorts") ||
    path.startsWith("/dashboard/assignments") ||
    path.startsWith("/dashboard/students") ||
    path.startsWith("/dashboard/studio")
  ) {
    return ["teacher", "dean"];
  }
  return null;
}

// Which sign-in page to bounce an UNAUTHENTICATED visitor to, inferred from the
// area they were trying to reach, so staff land on their portal — not the
// learner login. We can't know an unauthenticated visitor's role, so a
// teacher+dean shared area goes to the neutral staff chooser rather than
// pre-committing a dean to the teacher door (which would refuse their login).
function loginPathForPath(path: string): string {
  const roles = requiredRolesForPath(path);
  if (!roles) return "/login";
  if (roles.length === 1 && roles[0] === "dean") return "/staff/dean";
  return "/staff";
}

// `kidSafe` items are shown to the kid segment. `staff:true` marks a staff-only
// surface (never shown to learners); `roles` further narrows a staff item to
// specific staff roles. Learners see only learner surfaces and staff see only
// staff surfaces — no cross-over. The server still enforces authz on every call.
type NavItem = { href: string; label: string; icon: string; kidSafe: boolean; roles?: string[]; staff?: boolean };
const NAV_ITEMS: NavItem[] = [
  // Learner surfaces
  { href: "/dashboard", label: "Home", icon: "🏠", kidSafe: true },
  { href: "/dashboard/path", label: "Learn", icon: "📖", kidSafe: true },
  { href: "/dashboard/library", label: "Library", icon: "📚", kidSafe: true },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "🏆", kidSafe: false },
  { href: "/dashboard/exams", label: "Экзамены", icon: "📝", kidSafe: false, roles: ["learner"] },
  { href: "/dashboard/join", label: "Join", icon: "🎟️", kidSafe: false, roles: ["learner"] },
  // Staff surfaces — Command Center is the staff "home". Staff UI is RUSSIAN
  // (teachers of Russian are Russian speakers); learner UI stays English.
  { href: "/dashboard/teacher", label: "Командный центр", icon: "🧭", kidSafe: false, staff: true, roles: ["teacher", "dean"] },
  { href: "/dashboard/cohorts", label: "Группы", icon: "👥", kidSafe: false, staff: true, roles: ["teacher", "dean"] },
  { href: "/dashboard/assignments", label: "Задания", icon: "📋", kidSafe: false, staff: true, roles: ["teacher", "dean"] },
  { href: "/dashboard/studio", label: "Студия", icon: "🛠️", kidSafe: false, staff: true, roles: ["teacher", "dean"] },
  { href: "/dashboard/dean", label: "Декан", icon: "🏛️", kidSafe: false, staff: true, roles: ["dean"] },
  { href: "/dashboard/dean/institution", label: "Учреждение", icon: "🏫", kidSafe: false, staff: true, roles: ["dean"] },
];

const STAFF_ROLES = ["teacher", "dean", "admin"];
const ROLE_LABELS: Record<string, string> = { teacher: "Преподаватель", dean: "Декан", admin: "Администратор" };

const TEXT_SIZES = ["normal", "large", "xlarge"] as const;
type TextSize = (typeof TEXT_SIZES)[number];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [segment, setSegment] = useState("");
  const [role, setRole] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [glossOn, setGlossOn] = useState(true);
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [gate, setGate] = useState<{ a: number; b: number } | null>(null);
  const [gateInput, setGateInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const isKid = segment === "kid";

  useEffect(() => {
    // Auth + staff-area role redirects are handled by the guard effect below
    // (keyed on pathname so they re-run on every navigation).
    if (!auth.isAuthenticated()) return;
    const seg = auth.getSegment() || "";
    setDisplayName(auth.getDisplayName() || "Learner");
    setSegment(seg);
    setRole(auth.getRole());
    setSoundOn(sound.isEnabled());
    setGlossOn(auth.isGlossOn());
    // Text size: stored preference, else default larger for seniors.
    const stored = (typeof window !== "undefined" && localStorage.getItem("text_size")) as TextSize | null;
    const initial: TextSize = stored && TEXT_SIZES.includes(stored) ? stored : seg === "senior" ? "large" : "normal";
    applyTextSize(initial);
    setTextSize(initial);
    // Start usage analytics (no-op for minors / offline / signed-out sessions).
    analytics.init();
  }, [router]);

  // Route guard — runs on first paint and on every navigation:
  //  • not signed in            → bounce to the portal for this area
  //  • signed in, wrong role for a staff area → bounce to that role's own home
  // The server still authorizes every endpoint; this keeps a learner from ever
  // sitting on staff chrome (and vice-versa) rather than only failing on fetch.
  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace(loginPathForPath(pathname));
      return;
    }
    const r = auth.getRole();
    // Staff never use the learner Home — send them to their own console so they
    // are never "treated as a learner".
    if (STAFF_ROLES.includes(r) && (pathname === "/dashboard" || pathname === "/dashboard/path")) {
      router.replace(homeForRole(r));
      return;
    }
    const need = requiredRolesForPath(pathname);
    if (need && r && !need.includes(r)) router.replace(homeForRole(r));
  }, [pathname, router]);

  // Same-browser dual login (teacher + student in two tabs): the API's httpOnly
  // cookies are shared per browser, so the LAST login owns the real session while
  // older tabs keep stale chrome — "suddenly I'm on the teacher's side with the
  // student's content". When another tab signs in/out (identity keys change in
  // localStorage) or a stale page returns from the back/forward cache, reload so
  // this tab re-reads the current identity and lands on the right portal.
  useEffect(() => {
    const IDENTITY_KEYS = ["user_role", "learner_id", "display_name", "is_authenticated"];
    let t: number | undefined;
    const scheduleReload = () => {
      // Login writes several keys in a burst — coalesce into one reload after
      // the writes settle so we don't reload mid-signin and see a half state.
      window.clearTimeout(t);
      t = window.setTimeout(() => window.location.reload(), 400);
    };
    const onStorage = (e: StorageEvent) => {
      if ((e.key === null || IDENTITY_KEYS.includes(e.key)) && e.oldValue !== e.newValue) scheduleReload();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // Track route views (+ dwell on the previous route) as the learner navigates.
  useEffect(() => {
    analytics.page(pathname);
  }, [pathname]);

  function applyTextSize(size: TextSize) {
    if (typeof document === "undefined") return;
    if (size === "normal") delete document.documentElement.dataset.textSize;
    else document.documentElement.dataset.textSize = size;
    localStorage.setItem("text_size", size);
  }
  function cycleTextSize() {
    const next = TEXT_SIZES[(TEXT_SIZES.indexOf(textSize) + 1) % TEXT_SIZES.length];
    applyTextSize(next);
    setTextSize(next);
  }

  const segmentLabels: Record<string, string> = {
    kid: "Kid", teen: "Teen", uni_prep: "University Prep",
    migrant: "Daily Life", daily_life: "Daily Life", senior: "Senior", core: "General",
  };

  function doLogout() {
    analytics.stop();
    api.logout(); // revoke refresh token + clear auth cookies server-side (best-effort)
    auth.clear();
    router.push("/login");
  }
  function onSignOutClick() {
    if (isKid) {
      // Simple parent gate so a child can't sign themselves out by accident.
      setGate({ a: 2 + Math.floor(Math.random() * 7), b: 2 + Math.floor(Math.random() * 7) });
      setGateInput("");
    } else {
      doLogout();
    }
  }

  const isStaff = STAFF_ROLES.includes(role);
  const navItems = NAV_ITEMS.filter((i) => {
    if (isStaff) return i.staff === true && (!i.roles || i.roles.includes(role));
    if (i.staff) return false; // learners never see staff tools
    if (isKid) return i.kidSafe;
    if (i.roles && !i.roles.includes(role)) return false;
    return true;
  });
  // Sidebar footer identity: staff see their ROLE, learners see their segment.
  const identitySub = isStaff ? (ROLE_LABELS[role] || "Staff") : (segmentLabels[segment] || segment);
  const identityName = displayName && displayName !== "Learner" ? displayName : isStaff ? (ROLE_LABELS[role] || "Staff") : displayName;
  const homeHref = isStaff ? homeForRole(role) : "/dashboard";
  const initials = identityName ? identityName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";
  // Exactly one item is active: the longest href that matches the current path
  // (exact, or a path-segment prefix). Prevents a parent item ("/dashboard/dean")
  // from also highlighting on a child route ("/dashboard/dean/institution").
  const activeHref = navItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const textSizeLabel = textSize === "normal" ? "A" : textSize === "large" ? "A⁺" : "A⁺⁺";

  return (
    <div className="min-h-screen bg-[var(--color-surface)] flex">
      <aside className="w-64 bg-[var(--color-primary)] text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-white/10">
          <Link href={homeHref} className="text-xl font-bold display tracking-wide">РУССКИЙ</Link>
          <p className="text-[var(--color-primary-fg-muted)] text-xs mt-1">{isStaff ? (ROLE_LABELS[role] || "Staff").toUpperCase() : "RUSSKIY"}</p>
        </div>

        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={`nav-${item.href}`}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? "bg-white/15 text-white border-[var(--color-gold)]"
                    : "border-transparent text-[var(--color-primary-fg-muted)] hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{identityName || (isStaff ? "Staff" : "Learner")}</p>
              {/* Don't print "Преподаватель / Преподаватель" when a staff account
                  has no display name — the role already IS the headline then. */}
              {identitySub !== identityName && (
                <p className="text-xs text-[var(--color-primary-fg-muted)]">{identitySub}</p>
              )}
            </div>
          </div>
          {/* Settings live in a labeled, collapsible panel — not a row of cryptic
              emoji squeezed next to Sign out. */}
          {showSettings && (
            <div className="mt-3 bg-white/10 rounded-lg p-3 space-y-2.5">
              {!isStaff && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/80">Explain grammar terms</span>
                  <button
                    onClick={() => { const n = !glossOn; auth.setGloss(n); setGlossOn(n); }}
                    aria-pressed={glossOn}
                    className={`w-9 h-5 rounded-full transition-colors relative ${glossOn ? "bg-[var(--color-gold)]" : "bg-white/20"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${glossOn ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/80">{isStaff ? "Размер текста" : "Text size"}</span>
                <button onClick={cycleTextSize} className="text-xs font-semibold bg-white/15 hover:bg-white/25 rounded px-2.5 py-1 transition-colors">
                  {textSizeLabel}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/80">{isStaff ? "Звук" : "Sound"}</span>
                <button
                  onClick={() => setSoundOn(sound.toggle())}
                  aria-pressed={soundOn}
                  className={`w-9 h-5 rounded-full transition-colors relative ${soundOn ? "bg-[var(--color-gold)]" : "bg-white/20"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${soundOn ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              data-tour="settings-btn"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
              className={`text-xs font-medium rounded-lg px-2 py-2 transition-colors ${
                showSettings ? "bg-white/20 text-white" : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
              }`}
            >
              ⚙ {isStaff ? "Настройки" : "Settings"}
            </button>
            <button
              onClick={onSignOutClick}
              className="text-xs font-medium rounded-lg px-2 py-2 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors"
            >
              {isStaff ? "Выйти" : "Sign out"}
            </button>
          </div>

          {/* Replay the guided tour anytime. */}
          {!isKid && (
            <button
              onClick={() => { const { id, steps } = welcomeTourFor(role); startTour(id, steps); }}
              className="mt-2 w-full text-xs font-medium rounded-lg px-2 py-2 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors"
            >
              ❓ {isStaff ? "Обзор платформы" : "Take a tour"}
            </button>
          )}

          <a
            href="https://www.codesila.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-center text-[10px] tracking-wide text-white/40 hover:text-white/70 transition-colors"
          >
            Powered by CodeSila Academy
          </a>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8">{children}</main>

      {/* Parent gate (kid sign-out) */}
      {gate && (
        <div className="fixed inset-0 bg-[var(--color-scrim)] flex items-center justify-center z-50 p-4" onClick={() => setGate(null)}>
          <div className="bg-white rounded-[var(--radius-card)] p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2">🧑‍🦰</div>
            <h2 className="text-lg font-bold text-[var(--color-primary)]">Ask a grown-up</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 mb-4">
              To sign out, please solve: <strong>{gate.a} + {gate.b} = ?</strong>
            </p>
            <input
              autoFocus
              inputMode="numeric"
              value={gateInput}
              onChange={(e) => setGateInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && Number(gateInput) === gate.a + gate.b && doLogout()}
              className="w-full px-4 py-2 border border-[var(--color-border-strong)] rounded-[var(--radius-control)] text-center text-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-3"
              placeholder="?"
            />
            <div className="flex gap-2">
              <button onClick={() => setGate(null)} className={`${buttonClasses("secondary", "md")} flex-1`}>Cancel</button>
              <button
                onClick={() => Number(gateInput) === gate.a + gate.b && doLogout()}
                disabled={Number(gateInput) !== gate.a + gate.b}
                className={`${buttonClasses("navy", "md")} flex-1`}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Idle auto-logout (shared-computer safety). Uses doLogout directly so an
          auto-timeout bypasses the kid parent-gate — it's a security timeout, not the
          child choosing to leave. Cross-tab via a shared last_activity timestamp. */}
      <IdleLogout onLogout={doLogout} staff={isStaff} />

      {/* Progressive onboarding: welcome tour on first visit (role-aware), replayable
          from the ‘?’ button. Skipped for kids (they have a simplified, gated dashboard). */}
      <OnboardingTours role={role} enabled={!isKid && !!role} />
    </div>
  );
}
