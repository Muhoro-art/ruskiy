"use client";

import PortalLoginForm from "@/components/auth/PortalLoginForm";
import { PORTALS } from "@/lib/portal";

// The learner portal — the public sign-in. Staff (teacher / dean / admin) each
// have their own portal under /staff; the server rejects a staff credential
// presented here (and a learner credential presented at a staff portal).
export default function LoginPage() {
  return <PortalLoginForm portal={PORTALS.learner} />;
}
