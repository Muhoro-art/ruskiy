"use client";

// Lightweight in-app notifications: pages push messages, the stack renders
// bottom-right and each toast dismisses itself. Used for "new assignment" on
// the student's Home and "student finished a task" on the teacher's classroom.

import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: number;
  text: string;
}

export function useToasts(ttlMs = 7000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback(
    (text: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, text }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttlMs);
    },
    [ttlMs]
  );
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-slate-900 text-white text-sm rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 animate-[fadeIn_.2s_ease-out]"
          role="status"
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => onDismiss(t.id)} className="text-slate-400 hover:text-white shrink-0" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
