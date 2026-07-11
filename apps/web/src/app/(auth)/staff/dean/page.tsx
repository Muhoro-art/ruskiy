"use client";

import PortalLoginForm from "@/components/auth/PortalLoginForm";
import { PORTALS } from "@/lib/portal";

export default function DeanLoginPage() {
  return <PortalLoginForm portal={PORTALS.dean} />;
}
