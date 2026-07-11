// Live updates: subscribe to the server's SSE stream (/v1/events). Events are
// treated as "refresh now" pokes — pages re-run the same diff-based refresh
// they use for polling, so toasts/dedupe work identically for both paths and
// a dropped stream degrades to the slow poll instead of missing anything.

export interface LiveEvent {
  type: string;
  [key: string]: unknown;
}

export function subscribeEvents(onEvent: (e: LiveEvent) => void): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  // Same-origin via the Next.js /api proxy — the httpOnly auth cookie rides
  // along automatically. EventSource reconnects on its own after drops.
  const es = new EventSource("/api/v1/events");
  es.onmessage = (m) => {
    try {
      const parsed = JSON.parse(m.data) as LiveEvent;
      if (parsed && typeof parsed.type === "string") onEvent(parsed);
    } catch {
      /* malformed frame — ignore */
    }
  };
  return () => es.close();
}
