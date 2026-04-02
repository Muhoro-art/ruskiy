"use client";

import Link from "next/link";
import { useState } from "react";

const SKILL_OPTIONS = [
  { id: "grammar.cases.nominative", label: "Nominative Case", category: "Grammar" },
  { id: "grammar.cases.accusative", label: "Accusative Case", category: "Grammar" },
  { id: "grammar.cases.genitive", label: "Genitive Case", category: "Grammar" },
  { id: "grammar.cases.dative", label: "Dative Case", category: "Grammar" },
  { id: "grammar.cases.instrumental", label: "Instrumental Case", category: "Grammar" },
  { id: "grammar.verbs.aspect", label: "Verbal Aspect", category: "Grammar" },
  { id: "grammar.verbs.motion", label: "Verbs of Motion", category: "Grammar" },
  { id: "grammar.verbs.present", label: "Present Tense", category: "Grammar" },
  { id: "vocab.food", label: "Food & Drinks", category: "Vocabulary" },
  { id: "vocab.transport", label: "Transport", category: "Vocabulary" },
  { id: "vocab.medical", label: "Medical Terms", category: "Vocabulary" },
  { id: "phonetics.palatalization", label: "Palatalization", category: "Phonetics" },
  { id: "phonetics.stress", label: "Word Stress", category: "Phonetics" },
];

const COHORT_OPTIONS = [
  { id: "c1", name: "Russian 101 — Spring 2026" },
  { id: "c2", name: "Intensive Russian — Medical Track" },
  { id: "c3", name: "Russian for Engineers — Fall 2026" },
];

export default function NewAssignmentPage() {
  const [title, setTitle] = useState("");
  const [cohort, setCohort] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [minExercises, setMinExercises] = useState(10);
  const [deadline, setDeadline] = useState("");
  const [difficultyRange, setDifficultyRange] = useState([0.2, 0.8]);

  function toggleSkill(id: string) {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/assignments" className="hover:text-[var(--color-primary)]">
          Assignments
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">New Assignment</span>
      </div>

      <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-8">
        Create Assignment
      </h1>

      <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">Assignment Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Genitive Case Practice Week 3"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
          />
        </div>

        {/* Cohort */}
        <div>
          <label className="block text-sm font-medium mb-2">Cohort</label>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
          >
            <option value="">Select a cohort...</option>
            {COHORT_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Target Skills */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Target Skills{" "}
            <span className="text-[var(--color-text-muted)] font-normal">
              (AI will adapt exercises per student)
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SKILL_OPTIONS.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  selectedSkills.includes(skill.id)
                    ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="font-medium">{skill.label}</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
                  {skill.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Min Exercises */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Minimum Exercises
            </label>
            <input
              type="number"
              value={minExercises}
              onChange={(e) => setMinExercises(Number(e.target.value))}
              min={5}
              max={50}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
            />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium mb-2">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Difficulty Range */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Difficulty Range:{" "}
            <span className="text-[var(--color-text-muted)] font-normal">
              {Math.round(difficultyRange[0] * 100)}% – {Math.round(difficultyRange[1] * 100)}%
            </span>
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={difficultyRange[0] * 100}
              onChange={(e) => setDifficultyRange([Number(e.target.value) / 100, difficultyRange[1]])}
              className="flex-1"
            />
            <input
              type="range"
              min={0}
              max={100}
              value={difficultyRange[1] * 100}
              onChange={(e) => setDifficultyRange([difficultyRange[0], Number(e.target.value) / 100])}
              className="flex-1"
            />
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>How adaptive assignments work:</strong> You define the target
            skills and constraints. The AI generates a personalized exercise set
            for each student based on their current knowledge state. A student
            scoring 80% on genitive singular but 30% on plural will get
            mostly plural exercises.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <button className="flex-1 bg-[var(--color-primary)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors">
            Create Assignment
          </button>
          <Link
            href="/dashboard/assignments"
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors text-center"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
