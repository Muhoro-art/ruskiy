// Lightweight UI sound engine.
//
// Sounds are *synthesized* with the Web Audio API rather than shipped as audio
// files — zero network/asset weight, nothing to license, and easy to keep
// subtle. Everything is short, quiet, and gentle on purpose: the "incorrect"
// cue is a soft low tone, never a harsh buzzer, so wrong answers don't feel
// punishing (which research on learner motivation cautions against).
//
// The AudioContext is created lazily on the first sound (browsers block audio
// until a user gesture), and a mute toggle is persisted in localStorage. All of
// this is SSR-safe: nothing touches `window` at module load.

type SoundName = "click" | "select" | "correct" | "incorrect" | "complete" | "reward";

const STORAGE_KEY = "sound_enabled";
const MASTER_GAIN = 0.14; // keep everything understated

let ctx: AudioContext | null = null;
let enabled: boolean | null = null; // lazily read from storage

function isBrowser() {
  return typeof window !== "undefined";
}

function getEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (!isBrowser()) return true;
  enabled = window.localStorage.getItem(STORAGE_KEY) !== "0"; // default on
  return enabled;
}

function getCtx(): AudioContext | null {
  if (!isBrowser()) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

// Play one shaped tone: an oscillator through a gain envelope (quick attack,
// smooth exponential release) so there are no clicks/pops at the edges.
function tone(
  c: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType,
  peak: number
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak * MASTER_GAIN, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

// A short noise-free "tick" for clicks, made from a very fast high tone.
function tick(c: AudioContext, t: number) {
  tone(c, 660, t, 0.05, "triangle", 0.5);
}

const RECIPES: Record<SoundName, (c: AudioContext, t: number) => void> = {
  // Crisp, quiet tick for button presses.
  click: (c, t) => tick(c, t),
  // Soft pop when picking an option.
  select: (c, t) => tone(c, 520, t, 0.08, "sine", 0.6),
  // Bright, satisfying two-note rise (E5 → A5) for a correct answer.
  correct: (c, t) => {
    tone(c, 659.25, t, 0.12, "sine", 0.9);
    tone(c, 880.0, t + 0.09, 0.18, "sine", 0.9);
  },
  // Gentle low two-note dip (G3 → E3), warm not harsh, for a wrong answer.
  incorrect: (c, t) => {
    tone(c, 196.0, t, 0.16, "sine", 0.8);
    tone(c, 164.81, t + 0.12, 0.2, "sine", 0.7);
  },
  // Ascending major arpeggio (A4–C#5–E5–A5) when a lesson/exam finishes.
  complete: (c, t) => {
    [440, 554.37, 659.25, 880].forEach((f, i) => tone(c, f, t + i * 0.1, 0.22, "sine", 0.8));
  },
  // Bigger shimmering arpeggio for level-ups / achievements.
  reward: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.08, 0.3, "triangle", 0.7));
    tone(c, 1567.98, t + 0.34, 0.4, "sine", 0.4); // sparkle
  },
};

export const sound = {
  isEnabled: getEnabled,

  setEnabled(on: boolean) {
    enabled = on;
    if (isBrowser()) window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    if (on) sound.play("click"); // give immediate feedback when turning on
  },

  toggle(): boolean {
    const next = !getEnabled();
    sound.setEnabled(next);
    return next;
  },

  play(name: SoundName) {
    if (!getEnabled()) return;
    const c = getCtx();
    if (!c) return;
    // Schedule a hair into the future so the event never lands in the past
    // (browsers silently drop notes scheduled at/just-before currentTime).
    const fire = () => {
      try {
        RECIPES[name](c, c.currentTime + 0.03);
      } catch {
        /* never let a sound break the UI */
      }
    };
    // The context auto-suspends after inactivity / tab blur. While suspended the
    // audio clock is frozen, so we MUST wait for resume() to resolve before
    // reading currentTime and scheduling — otherwise the note is dropped. This
    // race was the cause of sounds firing only "sometimes".
    if (c.state === "suspended") c.resume().then(fire).catch(fire);
    else fire();
  },

  // Force-create + resume the context (e.g. on the first user gesture) so it is
  // already running by the time the first answer is graded.
  unlock() {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
};

// Keep the AudioContext warm: resume it on every user gesture. Browsers require
// a gesture to start audio and may re-suspend it later, so we re-arm on each
// interaction rather than once. Passive + capture so it never blocks the UI.
if (isBrowser()) {
  const warm = () => sound.unlock();
  window.addEventListener("pointerdown", warm, { capture: true, passive: true });
  window.addEventListener("keydown", warm, { capture: true, passive: true });
}
