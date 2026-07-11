// Russian text-to-speech via the browser SpeechSynthesis API. Used for
// tap-to-hear on teach blocks and prompts (audio support, esp. for the kid and
// senior tracks). SSR-safe and degrades silently when no voice is available.

export function isTTSAvailable(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

/** Speak Russian text aloud. `rate` < 1 slows it down (kids). No-op if unsupported. */
export function speak(text: string, rate = 0.9): void {
  if (!isTTSAvailable() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = rate;
    const ru = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ru"));
    if (ru) u.voice = ru;
    window.speechSynthesis.speak(u);
  } catch {
    /* never let audio break the UI */
  }
}
