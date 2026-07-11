"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/auth";
import { homeForRole } from "@/lib/portal";

// The admin monitoring panel is a SEPARATE area from the learner app — its own
// dark shell, not linked from the learner nav. Access is enforced server-side
// (every data endpoint is role-gated to admins); this layout only guards auth.
const NAV = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/heatmap", label: "Click Heatmap", icon: "🔥" },
  { href: "/admin/engagement", label: "Engagement & Drop-off", icon: "📉" },
  { href: "/admin/moderation", label: "Content Moderation", icon: "🧾" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Not signed in → send to the ADMIN portal, not the learner login.
    if (!auth.isAuthenticated()) {
      router.replace("/staff/admin");
      return;
    }
    // Signed in but not an admin → bounce to that role's own home. The admin
    // panel is never shown to a non-admin (the server also 403s every endpoint,
    // but we shouldn't even render the shell). This closes the gap where any
    // authenticated user could see the admin chrome.
    const role = auth.getRole();
    if (role !== "admin") {
      router.replace(homeForRole(role));
      return;
    }
    setOk(true);
  }, [router]);

  // Same-browser dual login: cookies are shared per browser, so a login in
  // another tab silently swaps the real session under this one. Reload when
  // identity keys change in another tab or a stale page returns from bfcache.
  useEffect(() => {
    const IDENTITY_KEYS = ["user_role", "learner_id", "display_name", "is_authenticated"];
    let t: number | undefined;
    const onStorage = (e: StorageEvent) => {
      if ((e.key === null || IDENTITY_KEYS.includes(e.key)) && e.oldValue !== e.newValue) {
        window.clearTimeout(t);
        t = window.setTimeout(() => window.location.reload(), 400);
      }
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

  // Hold rendering until the admin check passes, so the shell never flashes for
  // a learner mid-redirect.
  if (!ok) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-white/10">
          <Link href="/admin" className="text-xl font-bold">РУССКИЙ</Link>
          <p className="text-slate-400 text-xs mt-1 tracking-wide">ADMIN · MONITORING</p>
        </div>
        <nav className="flex-1 py-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white transition-colors">
            ← Back to the app
          </Link>
        </div>
      </aside>
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
