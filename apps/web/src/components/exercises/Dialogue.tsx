"use client";

import { useState } from "react";

interface DialogueProps {
  dialogueLines: Array<{ speaker: string; textRu: string; textEn: string }>;
  explanationEn?: string;
  onComplete: () => void;
}

export function Dialogue({
  dialogueLines,
  explanationEn,
  onComplete,
}: DialogueProps) {
  const [visibleLines, setVisibleLines] = useState(1);
  const [showTranslation, setShowTranslation] = useState<Record<number, boolean>>({});
  const allVisible = visibleLines >= dialogueLines.length;

  function revealNext() {
    if (visibleLines < dialogueLines.length) {
      setVisibleLines(visibleLines + 1);
    }
  }

  function toggleTranslation(index: number) {
    setShowTranslation((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-sm text-[var(--color-text-muted)] text-center mb-6">
        Read the dialogue. Tap each line to see the translation.
      </p>

      <div className="space-y-3 mb-8">
        {dialogueLines.slice(0, visibleLines).map((line, i) => {
          const isUser = line.speaker === "Вы";
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <button
                onClick={() => toggleTranslation(i)}
                className={`max-w-[80%] rounded-2xl px-5 py-3 transition-all ${
                  isUser
                    ? "bg-[var(--color-primary)] text-white rounded-br-md"
                    : "bg-white border border-gray-200 rounded-bl-md"
                }`}
              >
                <p className="text-xs font-medium mb-1 opacity-70">
                  {line.speaker}
                </p>
                <p className={`text-base font-medium ${isUser ? "text-white" : "text-[var(--color-text)]"}`}>
                  {line.textRu}
                </p>
                {showTranslation[i] && (
                  <p
                    className={`text-sm mt-2 pt-2 border-t ${
                      isUser
                        ? "border-white/20 text-blue-100"
                        : "border-gray-200 text-[var(--color-text-muted)]"
                    }`}
                  >
                    {line.textEn}
                  </p>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Explanation */}
      {allVisible && explanationEn && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> {explanationEn}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        {!allVisible ? (
          <button
            onClick={revealNext}
            className="bg-[var(--color-primary)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors"
          >
            Next Line →
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="bg-[var(--color-primary)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
