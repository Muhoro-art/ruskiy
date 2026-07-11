"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type InstitutionMe, type CohortInvite } from "@/lib/api";
import { auth } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/dashboard/ui";

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500";
const btnCls = "bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50";

// useSearchParams() must sit inside a Suspense boundary for the production build.
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  );
}

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<InstitutionMe | null>(null);
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [acceptMsg, setAcceptMsg] = useState("");
  const [needsRelogin, setNeedsRelogin] = useState(false);
  // Cohort (class) joining — invitations to accept + a class code to redeem.
  const [invites, setInvites] = useState<CohortInvite[]>([]);
  const [cohortCode, setCohortCode] = useState("");
  const [cohortMsg, setCohortMsg] = useState("");
  // Separate feedback for the invitations panel so accepting an invite doesn't
  // print its confirmation under the (unrelated) class-code form below.
  const [inviteMsg, setInviteMsg] = useState("");

  async function load() {
    try {
      setMe(await api.getInstitutionMe());
    } catch {
      /* ignore */
    }
    try {
      setInvites(await api.getMyCohortInvites());
    } catch {
      /* ignore */
    }
  }

  async function joinCohortByCode(e: React.FormEvent) {
    e.preventDefault();
    setCohortMsg("");
    try {
      const r = await api.joinCohort(cohortCode.trim());
      setCohortMsg(`✓ You joined ${r.cohortName}.`);
      setCohortCode("");
    } catch (err) {
      const m = (err as Error).message;
      setCohortMsg(m === "invalid_code" ? "That class code didn't match anything — double-check it." : m || "Couldn't join");
    }
  }

  async function respondInvite(id: string, accept: boolean) {
    try {
      const r = await api.respondCohortInvite(id, accept);
      setInvites((list) => list.filter((i) => i.id !== id));
      setInviteMsg(accept ? `✓ You joined ${r.cohortName || "the class"}.` : "Invitation declined.");
    } catch (err) {
      setInviteMsg((err as Error).message || "Couldn't respond to the invite");
    }
  }
  useEffect(() => {
    load();
    // Signup redirects here with ?code=… when the join code entered at registration
    // didn't work — prefill it and explain so the student can fix and retry.
    const c = params.get("code");
    if (c) {
      setCode(c.toUpperCase());
      setJoinMsg("That code didn't work at signup — double-check it and try again.");
    }
  }, [params]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoinMsg("");
    try {
      const inst = await api.joinInstitution(code.trim());
      setJoinMsg(`✓ You're enrolled at ${inst.name}.`);
      setCode("");
      load();
    } catch (err) {
      setJoinMsg((err as Error).message || "Couldn't join");
    }
  }

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setAcceptMsg("");
    try {
      const r = await api.acceptInvite(token.trim());
      setAcceptMsg(`✓ You're now a ${r.role} at ${r.institution.name}. Signing you out to activate your new role…`);
      setNeedsRelogin(true);
      setToken("");
      // The role change lives in the DB, but the current JWT still carries the old
      // "learner" claim — nav gating and page access stay stale until re-login. Force
      // a sign-out so they come back with a fresh token instead of a half-broken app.
      window.setTimeout(signOut, 2200);
    } catch (err) {
      setAcceptMsg((err as Error).message || "Couldn't accept invite");
    }
  }

  function signOut() {
    api.logout();
    auth.clear();
    router.push("/login");
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Join an institution" subtitle="Enrol with your university's code, or accept a teacher/dean invite." />

      {me?.institution && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg px-4 py-3 mb-6 text-sm">
          You&apos;re currently in <strong>{me.institution.name}</strong>{me.role ? ` as ${me.role}` : ""}.
        </div>
      )}

      <div className="space-y-6">
        {(invites.length > 0 || inviteMsg) && (
          <Panel title="Class invitations">
            <div className="space-y-2">
              {invites.map((iv) => (
                <div key={iv.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{iv.cohortName}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">Invited by {iv.teacherName}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => respondInvite(iv.id, true)} className="text-sm font-semibold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                      Accept
                    </button>
                    <button onClick={() => respondInvite(iv.id, false)} className="text-sm font-medium border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {inviteMsg && <p className={`text-sm mt-2 ${inviteMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{inviteMsg}</p>}
          </Panel>
        )}

        <Panel title="Join a class with a code from your teacher">
          <form onSubmit={joinCohortByCode} className="flex gap-2">
            <input
              value={cohortCode}
              onChange={(e) => setCohortCode(e.target.value.toUpperCase())}
              placeholder="e.g. C4SSAGEN"
              className={`${inputCls} font-mono tracking-widest`}
            />
            <button className={btnCls} disabled={!cohortCode.trim()}>Join class</button>
          </form>
          {cohortMsg && <p className={`text-sm mt-2 ${cohortMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{cohortMsg}</p>}
        </Panel>

        <Panel title="I'm a student — enrol with a join code">
          <form onSubmit={join} className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. VABR2NEN" className={`${inputCls} font-mono tracking-widest`} />
            <button className={btnCls} disabled={!code.trim()}>Join</button>
          </form>
          {joinMsg && <p className={`text-sm mt-2 ${joinMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{joinMsg}</p>}
        </Panel>

        <Panel title="I was invited as a teacher or dean">
          <form onSubmit={accept} className="flex gap-2">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your invite code" className={`${inputCls} font-mono text-xs`} />
            <button className={btnCls} disabled={!token.trim()}>Accept</button>
          </form>
          {acceptMsg && <p className={`text-sm mt-2 ${acceptMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{acceptMsg}</p>}
          {needsRelogin && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Activating your new role — you&apos;ll be signed out in a moment.
              <button onClick={signOut} className="ml-2 underline font-medium">Sign out now</button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
