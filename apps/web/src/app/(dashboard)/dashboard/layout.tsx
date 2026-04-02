"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/dashboard/learn", label: "Learn", icon: "📖" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/dashboard/cohorts", label: "Cohorts", icon: "👥" },
  { href: "/dashboard/assignments", label: "Assignments", icon: "📋" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [segment, setSegment] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setDisplayName(localStorage.getItem("display_name") || "Learner");
    setSegment(localStorage.getItem("learner_segment") || "");
  }, [router]);

  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const segmentLabels: Record<string, string> = {
    kid: "Kid", teen: "Teen", uni_prep: "University Prep",
    migrant: "Daily Life", senior: "Senior", toddler: "Toddler",
  };

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("display_name");
    localStorage.removeItem("learner_id");
    localStorage.removeItem("learner_segment");
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--color-primary)] text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-white/10">
          <Link href="/dashboard" className="text-xl font-bold">
            РУССКИЙ
          </Link>
          <p className="text-blue-200 text-xs mt-1">RUSSKIY</p>
        </div>

        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-blue-200">{segmentLabels[segment] || segment}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs text-blue-200 hover:text-white transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
