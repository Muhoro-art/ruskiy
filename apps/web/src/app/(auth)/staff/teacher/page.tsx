"use client";

import PortalLoginForm from "@/components/auth/PortalLoginForm";
import { PORTALS } from "@/lib/portal";

export default function TeacherLoginPage() {
  return <PortalLoginForm portal={PORTALS.teacher} />;
}
