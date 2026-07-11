"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type TeacherC2, type Assignment } from "@/lib/api";
import { PageHeader, Denied } from "@/components/dashboard/ui";
import { TeacherC2View } from "@/components/dashboard/TeacherC2View";
import { T } from "@/lib/ru";

export default function TeacherCommandCenter() {
  const [data, setData] = useState<TeacherC2 | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getTeacherOverview(), api.getAssignments()])
      .then(([ov, asg]) => {
        if (cancelled) return;
        if (ov.status === "fulfilled") setData(ov.value);
        else if ((ov.reason as Error)?.message === "insufficient_permissions") setDenied(true);
        if (asg.status === "fulfilled") setAssignments(asg.value);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) return <Denied role="teacher" />;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={T.c2Title}
        subtitle={T.c2Subtitle}
        right={
          <div className="flex gap-2">
            <Link href="/dashboard/cohorts" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 text-slate-700">
              {T.navCohorts}
            </Link>
            <Link href="/dashboard/assignments/new" className="text-sm bg-[var(--color-primary)] text-white rounded-lg px-3 py-1.5 hover:bg-[var(--color-primary-light)]">
              {T.newAssignment}
            </Link>
          </div>
        }
      />
      <TeacherC2View data={data} loading={loading} assignments={assignments} />
    </div>
  );
}
