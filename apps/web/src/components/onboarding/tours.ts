import type { TourStep } from "./GuidedTour";

// Progressive onboarding content. Each surface has its own short tour that starts the
// first time a new user reaches it (keyed by the ids below via tourSeen/markTourSeen).
// Steps target stable [data-tour="…"] anchors placed in the layout + pages.

export const LEARNER_WELCOME: TourStep[] = [
  {
    title: "Welcome to Russkiy! 🎉",
    body: "Let's take a 30-second tour so you know your way around. You can skip anytime and replay it later from the ‘?’ button.",
  },
  { target: '[data-tour="nav-/dashboard"]', title: "Home", body: "Your daily hub — streak, today's goal, and what to do next.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/path"]', title: "Your Learning Path", body: "The heart of Russkiy. A personalized, level-by-level path — tap here to start your next lesson.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/library"]', title: "Library", body: "Extra reading, culture, and stories to explore at your own pace.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/leaderboard"]', title: "Leaderboard", body: "Earn XP as you learn and see how you stack up. A little friendly motivation!", placement: "right" },
  { target: '[data-tour="nav-/dashboard/exams"]', title: "Exams", body: "If a teacher assigns you a level exam, it shows up here with its due date.", placement: "right" },
  { target: '[data-tour="settings-btn"]', title: "Settings", body: "Sound, larger text, grammar explanations, and sign-out live here.", placement: "top" },
  {
    title: "You're all set! 🚀",
    body: "Head to ‘Learn’ to start your first lesson. We'll point out new features as you reach them.",
  },
];

export const LEARNER_PATH: TourStep[] = [
  {
    title: "This is your path",
    body: "Lessons unlock in order as you master each one. Green = done, gold = ready, grey = locked until you're ready.",
  },
  { target: '[data-tour="path-first-lesson"]', title: "Start here", body: "Tap a lesson to open it. Each one teaches a little, then checks it with a few quick questions.", placement: "bottom" },
];

export const LEARNER_LESSON: TourStep[] = [
  {
    title: "Inside a lesson",
    body: "First you'll see short teaching cards, then interactive questions. Get most right to master the lesson and unlock the next.",
  },
];

export const STAFF_WELCOME: TourStep[] = [
  {
    title: "Welcome, teacher! 👋",
    body: "A quick tour of your tools. You can replay it anytime from the ‘?’ button.",
  },
  { target: '[data-tour="nav-/dashboard/teacher"]', title: "Command Center", body: "Your home base — an at-a-glance overview of your classes, students, and recent activity.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/cohorts"]', title: "Groups", body: "Create classes (cohorts), invite or add students, and see each group's progress.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/assignments"]', title: "Assignments", body: "Set work for a class, add a due date and timer, then track who's completed it — live.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/studio"]', title: "Studio", body: "Build your own exercises and lessons to assign to your classes.", placement: "right" },
  {
    title: "That's the core! 🎓",
    body: "Start by creating a group under ‘Groups’, then invite your students. We'll flag new features as you go.",
  },
];

export const DEAN_WELCOME: TourStep[] = [
  {
    title: "Welcome, dean! 🏛️",
    body: "You have everything a teacher does, plus institution oversight. Here's the quick tour.",
  },
  { target: '[data-tour="nav-/dashboard/teacher"]', title: "Command Center", body: "Your day-to-day teaching hub — classes, students, activity.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/dean"]', title: "Dean overview", body: "Institution-wide analytics: teacher performance, exam scores, and how active each teacher is.", placement: "right" },
  { target: '[data-tour="nav-/dashboard/dean/institution"]', title: "Institution management", body: "Invite teachers, manage cohorts and students, assign exams, and rotate your join code — all here.", placement: "right" },
  {
    title: "You're ready! ✨",
    body: "Head to ‘Institution’ to invite your first teacher, or ‘Dean’ to see the analytics.",
  },
];

/** The welcome tour + its id for a given role. */
export function welcomeTourFor(role: string): { id: string; steps: TourStep[] } {
  if (role === "dean") return { id: "dean-welcome", steps: DEAN_WELCOME };
  if (role === "teacher") return { id: "staff-welcome", steps: STAFF_WELCOME };
  return { id: "learner-welcome", steps: LEARNER_WELCOME };
}
