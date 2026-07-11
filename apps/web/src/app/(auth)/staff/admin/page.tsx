"use client";

import PortalLoginForm from "@/components/auth/PortalLoginForm";
import { PORTALS } from "@/lib/portal";

export default function AdminLoginPage() {
  return <PortalLoginForm portal={PORTALS.admin} />;
}
