import Link from "next/link";

const FEATURES = [
  {
    title: "Purpose-Built for English Speakers",
    description:
      "Every lesson targets the specific ways English speakers struggle with Russian: case system confusion, aspect pairs, palatalization, and Cyrillic false friends.",
    icon: "🎯",
  },
  {
    title: "Invisible Adaptive Engine",
    description:
      "Our AI builds a real-time model of your strengths and weaknesses, then quietly reconfigures every session to target exactly what you need — without you noticing.",
    icon: "🧠",
  },
  {
    title: "Science-Backed Pedagogy",
    description:
      "Spaced repetition (FSRS), Krashen's i+1 input hypothesis, desirable difficulty, and Vygotsky's ZPD — all working together in every session.",
    icon: "🔬",
  },
  {
    title: "Pronunciation Coaching",
    description:
      "Speech recognition trained on English-accented Russian provides phoneme-level feedback on palatalization, stress, and intonation.",
    icon: "🗣️",
  },
  {
    title: "Domain-Specific Tracks",
    description:
      "Medical, engineering, humanities, business, and law vocabulary modules layered on top of daily-life Russian for university-bound learners.",
    icon: "📚",
  },
  {
    title: "Teacher Integration",
    description:
      "Full LMS support with cohort analytics, weakness heat maps, adaptive assignments, and SCORM/xAPI/LTI compatibility.",
    icon: "👩‍🏫",
  },
];

const SEGMENTS = [
  { name: "Toddlers (2–5)", desc: "Play-first phonetic absorption", color: "bg-pink-100 text-pink-800" },
  { name: "Kids (6–12)", desc: "Story world learning adventures", color: "bg-blue-100 text-blue-800" },
  { name: "Teens (13–17)", desc: "Social hooks & identity-driven", color: "bg-purple-100 text-purple-800" },
  { name: "University (17–25)", desc: "Deadline-driven intensive prep", color: "bg-green-100 text-green-800" },
  { name: "Migrants (25–65)", desc: "Survival-first utility", color: "bg-orange-100 text-orange-800" },
  { name: "Seniors (65+)", desc: "Travel, family & cognitive exercise", color: "bg-teal-100 text-teal-800" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--color-primary)]">
              РУССКИЙ
            </span>
            <span className="text-sm text-[var(--color-text-muted)] font-medium">
              RUSSKIY
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--color-text-muted)]">
            <a href="#features" className="hover:text-[var(--color-primary)] transition-colors">Features</a>
            <a href="#segments" className="hover:text-[var(--color-primary)] transition-colors">Who It's For</a>
            <a href="#pricing" className="hover:text-[var(--color-primary)] transition-colors">Pricing</a>
            <Link href="/login" className="hover:text-[var(--color-primary)] transition-colors">Log In</Link>
            <Link
              href="/signup"
              className="bg-[var(--color-accent)] text-white px-4 py-2 rounded-lg hover:bg-[var(--color-accent-light)] transition-colors"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[var(--color-primary)] mb-6">
            Learn Russian.
            <br />
            <span className="text-[var(--color-accent)]">The Right Way.</span>
          </h1>
          <p className="text-xl md:text-2xl text-[var(--color-text-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
            The only language platform architecturally designed around how
            English speakers actually struggle with Russian. Not another
            generic app. A purpose-built system.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-[var(--color-accent)] text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-[var(--color-accent-light)] transition-colors shadow-lg"
            >
              Start Learning Free
            </Link>
            <a
              href="#features"
              className="border-2 border-[var(--color-primary)] text-[var(--color-primary)] text-lg font-semibold px-8 py-4 rounded-xl hover:bg-[var(--color-primary)] hover:text-white transition-colors"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">
            Free tier includes Cyrillic course, 100 survival phrases & basic grammar. No credit card required.
          </p>
        </div>
      </section>

      {/* Differentiator Banner */}
      <section className="bg-[var(--color-primary)] text-white py-16 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Duolingo treats Russian as just another language.
          </h2>
          <p className="text-xl text-blue-200 max-w-3xl mx-auto">
            Russkiy understands the specific phonological, morphological, and
            syntactic challenges that English speakers face — and adapts in
            real time to fix them.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">
            Built Different
          </h2>
          <p className="text-[var(--color-text-muted)] text-center text-lg mb-16 max-w-2xl mx-auto">
            Every feature serves one mission: making English speakers genuinely
            competent in Russian.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-[var(--color-text-muted)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Segments */}
      <section id="segments" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">
            For Every Learner
          </h2>
          <p className="text-[var(--color-text-muted)] text-center text-lg mb-16 max-w-2xl mx-auto">
            Six distinct experiences, one adaptive engine. Each segment gets
            tailored UX, content, pacing, and engagement mechanics.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SEGMENTS.map((segment) => (
              <div
                key={segment.name}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
              >
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 ${segment.color}`}>
                  {segment.name}
                </span>
                <p className="text-[var(--color-text-muted)]">{segment.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Simple Pricing</h2>
          <p className="text-[var(--color-text-muted)] text-center text-lg mb-16 max-w-2xl mx-auto">
            Start free. Upgrade when the adaptive engine proves its value.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
              <h3 className="text-xl font-bold mb-2">Free</h3>
              <p className="text-4xl font-bold mb-1">$0</p>
              <p className="text-[var(--color-text-muted)] text-sm mb-6">Forever</p>
              <ul className="space-y-3 text-sm text-[var(--color-text-muted)] mb-8">
                <li>Cyrillic course</li>
                <li>100 survival phrases</li>
                <li>Basic grammar lessons</li>
                <li>1 lesson per day</li>
              </ul>
              <Link href="/signup" className="block text-center border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-semibold py-3 rounded-xl hover:bg-[var(--color-primary)] hover:text-white transition-colors">
                Get Started
              </Link>
            </div>
            {/* Core */}
            <div className="bg-[var(--color-primary)] text-white rounded-2xl p-8 shadow-lg border-2 border-[var(--color-primary)] relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--color-accent)] text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-bold mb-2">Core</h3>
              <p className="text-4xl font-bold mb-1">$9.99</p>
              <p className="text-blue-200 text-sm mb-6">per month</p>
              <ul className="space-y-3 text-sm text-blue-100 mb-8">
                <li>Full adaptive engine</li>
                <li>Unlimited lessons</li>
                <li>Speech recognition</li>
                <li>Offline mode</li>
                <li>Progress analytics</li>
              </ul>
              <Link href="/signup?plan=core" className="block text-center bg-white text-[var(--color-primary)] font-semibold py-3 rounded-xl hover:bg-blue-50 transition-colors">
                Start Free Trial
              </Link>
            </div>
            {/* Premium */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
              <h3 className="text-xl font-bold mb-2">Premium</h3>
              <p className="text-4xl font-bold mb-1">$19.99</p>
              <p className="text-[var(--color-text-muted)] text-sm mb-6">per month</p>
              <ul className="space-y-3 text-sm text-[var(--color-text-muted)] mb-8">
                <li>Everything in Core</li>
                <li>Domain modules (2 included)</li>
                <li>Cultural Passport content</li>
                <li>Family sharing (3 profiles)</li>
                <li>Human tutor discounts</li>
              </ul>
              <Link href="/signup?plan=premium" className="block text-center border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-semibold py-3 rounded-xl hover:bg-[var(--color-primary)] hover:text-white transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
          <p className="text-center text-[var(--color-text-muted)] text-sm mt-8">
            Institutional pricing available for universities and language schools.{" "}
            <a href="mailto:institutions@russkiy.app" className="text-[var(--color-primary)] underline">Contact us</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--color-primary)] text-blue-200 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div>
            <span className="text-2xl font-bold text-white">РУССКИЙ</span>
            <p className="mt-2 text-sm max-w-xs">
              The adaptive Russian language learning platform built exclusively
              for English speakers.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <h4 className="text-white font-semibold mb-3">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#segments" className="hover:text-white transition-colors">For Teachers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Company</h4>
              <ul className="space-y-2">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-blue-800 text-sm text-center">
          &copy; {new Date().getFullYear()} Russkiy. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
