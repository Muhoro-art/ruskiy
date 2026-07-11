"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type TeacherC2 } from "@/lib/api";
import { PageHeader, Denied } from "@/components/dashboard/ui";
import { TeacherC2View } from "@/components/dashboard/TeacherC2View";
import { T } from "@/lib/ru";

export default function DeanTeacherDetail() {
  const params = useParams();
  const id = String(params.id);
  const [data, setData] = useState<TeacherC2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getDeanTeacher(id)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => {
        if (e.message === "insufficient_permissions") setDenied(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (denied) return <Denied role="dean" />;

  return (
    <div className="max-w-5xl">
      <div className="mb-2">
        <Link href="/dashboard/dean" className="text-sm text-gray-400 hover:text-slate-700">{T.allTeachers}</Link>
      </div>
      <PageHeader title={data?.teacherName || T.teacherFallback} subtitle={T.deanOversight} />
      <TeacherC2View data={data} loading={loading} />
    </div>
  );
}
