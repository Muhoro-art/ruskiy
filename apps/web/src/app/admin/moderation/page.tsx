"use client";

// Студия Phase C — the content moderation queue. Admin reviews teacher-authored
// materials before they join the platform-wide pool: the preview renders the
// SAME components learners see (via the shared ContentPlayer), so the moderator
// judges exactly what would ship.

import { useEffect, useState } from "react";
import { api, type PendingReview } from "@/lib/api";
import { Panel, AdminDenied, PageHeader } from "../_ui";
import { ContentPlayer } from "@/components/content/ContentPlayer";

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Multiple choice",
  fill_blank: "Fill in the blank",
  word_scramble: "Word scramble",
  matching: "Matching",
  composite: "Composite (multi-step)",
};

export default function ModerationPage() {
  const [queue, setQueue] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      setQueue(await api.getContentReviews());
    } catch (e) {
      if ((e as Error).message === "insufficient_permissions") setDenied(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function resolve(contentId: string, approve: boolean) {
    setMsg("");
    if (!approve && !feedback.trim()) {
      setMsg("A rejection needs feedback for the author.");
      return;
    }
    try {
      await api.resolveContentReview(contentId, approve, feedback.trim());
      setMsg(approve ? "✓ Approved — now in the global pool." : "✓ Rejected with feedback.");
      setOpenId(null);
      setFeedback("");
      load();
    } catch (e) {
      setMsg((e as Error).message || "Failed to resolve");
    }
  }

  if (denied) return <AdminDenied />;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Content Moderation"
        subtitle="Teacher-authored materials awaiting review — approved items become available platform-wide."
      />

      {msg && (
        <div className={`rounded-lg px-4 py-3 mb-6 text-sm border ${msg.startsWith("✓") ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg}
        </div>
      )}

      <Panel title={`Pending review (${queue.length})`}>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="text-sm text-gray-400">Queue is empty — nothing awaiting review. 🎉</p>
        ) : (
          <div className="space-y-4">
            {queue.map((r) => {
              const open = openId === r.content.id;
              return (
                <div key={r.reviewId} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.content.title}</p>
                      <p className="text-xs text-gray-400">
                        {TYPE_LABEL[r.content.exerciseType] || r.content.exerciseType} · {r.content.cefrLevel} · by {r.authorEmail}
                        {r.content.submittedAt ? ` · submitted ${new Date(r.content.submittedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setOpenId(open ? null : r.content.id);
                        setFeedback("");
                        setMsg("");
                      }}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 shrink-0"
                    >
                      {open ? "Close" : "Review"}
                    </button>
                  </div>

                  {open && (
                    <div className="mt-4 space-y-4">
                      <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-slate-50">
                        <ContentPlayer
                          key={r.content.id}
                          item={{ exerciseType: r.content.exerciseType, contentData: r.content.contentData }}
                          doneLabel="End of preview"
                          againLabel="Preview again"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Feedback to the author (required for rejection)
                        </label>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={2}
                          maxLength={2000}
                          placeholder="e.g. Distractor #2 is also a correct answer — please fix and resubmit."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolve(r.content.id, true)}
                          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700"
                        >
                          Approve → global pool
                        </button>
                        <button
                          onClick={() => resolve(r.content.id, false)}
                          className="border border-red-200 bg-red-50 text-red-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-100"
                        >
                          Reject with feedback
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
