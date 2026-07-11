// Plain-English glossary of grammar terms used across the course.
//
// Many learners speak/read English fluently but never learned the *jargon*
// ("genitive case", "preposition", "aspect"). Rather than rewrite every lesson,
// we surface a tap-to-explain definition wherever a term appears — so the
// explanations stay as-is for those who know the terms, and become accessible to
// those who don't. Keep definitions short, friendly, and example-led.

export interface GlossEntry {
  /** Canonical term (lower-case). Matched case-insensitively, with optional plural. */
  term: string;
  /** Extra surface forms that map to the same definition. */
  aliases?: string[];
  /** Plain-English, jargon-free meaning. */
  plain: string;
  /** A tiny example (often Russian) to anchor it. */
  example?: string;
}

export const GLOSSARY: GlossEntry[] = [
  // Parts of speech
  { term: "noun", plain: "a person, place, thing, or idea.", example: "dog, Moscow, love → собака, любовь" },
  { term: "verb", plain: "an action or being word.", example: "run, is, think → бежать, думать" },
  { term: "adjective", plain: "a word that describes a noun.", example: "big, red, Russian → большой, красный" },
  { term: "adverb", plain: "a word for how / when / where something happens.", example: "quickly, often → быстро, часто" },
  { term: "pronoun", plain: "a stand-in for a noun.", example: "I, you, it → я, ты, оно" },
  { term: "preposition", plain: "a little linking word like 'in / on / to / with'. In Russian it often changes the next word's ending.", example: "в, на, с, к" },
  { term: "conjunction", plain: "a joining word.", example: "and, but, because → и, но, потому что" },
  { term: "article", plain: "the words 'a / an / the'. Good news: Russian has NO articles at all." },
  { term: "particle", plain: "a tiny word that adds flavour or emphasis, not easily translated.", example: "же, ли, бы" },
  { term: "interjection", plain: "a short exclamation.", example: "oh! ouch! → ой! ах!" },

  // Sentence roles
  { term: "subject", plain: "who or what does the action.", example: "SHE reads." },
  { term: "object", plain: "who or what receives the action.", example: "she reads A BOOK." },
  { term: "predicate", plain: "the part of the sentence that says what the subject does or is." },

  // Cases
  { term: "case", plain: "Russian changes the END of a word depending on its job in the sentence. Each job is one 'case'.", example: "стол → стола → столу" },
  { term: "nominative", aliases: ["nominative case"], plain: "the basic dictionary form — the word DOING the action.", example: "стол (table) — the subject" },
  { term: "genitive", aliases: ["genitive case"], plain: "the 'of / belongs to / there isn't any' form.", example: "нет столА — 'no table'" },
  { term: "dative", aliases: ["dative case"], plain: "the 'to / for someone' form — the receiver.", example: "дать другУ — 'give to a friend'" },
  { term: "accusative", aliases: ["accusative case"], plain: "the form for the direct object — the thing acted on.", example: "вижу столА / книгУ" },
  { term: "instrumental", aliases: ["instrumental case"], plain: "the 'with / by means of' form.", example: "пишу ручкОЙ — 'write with a pen'" },
  { term: "prepositional", aliases: ["prepositional case"], plain: "the form used after certain prepositions, often for location.", example: "на столЕ — 'on the table'" },

  // Gender & number
  { term: "gender", aliases: ["grammatical gender"], plain: "Russian nouns are 'masculine', 'feminine', or 'neuter' — it changes their endings." },
  { term: "masculine", plain: "one of the three genders (think 'he'-type words).", example: "стол, дом" },
  { term: "feminine", plain: "one of the three genders (think 'she'-type words).", example: "книга, мама" },
  { term: "neuter", plain: "one of the three genders (neither he nor she).", example: "окно, море" },
  { term: "singular", plain: "just one of something." },
  { term: "plural", plain: "more than one." },
  { term: "declension", plain: "the pattern of how a noun's endings change across the cases." },
  { term: "animacy", plain: "whether a noun is alive (people/animals) or not — it changes some endings." },
  { term: "agreement", plain: "making words match each other in gender, number, and case." },

  // Verbs
  { term: "conjugation", plain: "changing a verb to match who's doing it.", example: "я идУ, он идЁТ — I go, he goes" },
  { term: "tense", plain: "WHEN something happens — past, present, or future." },
  { term: "aspect", plain: "whether an action is FINISHED (perfective) or ongoing/repeated (imperfective)." },
  { term: "perfective", plain: "a verb form for a completed, one-time action.", example: "прочитать — read it all the way through" },
  { term: "imperfective", plain: "a verb form for an ongoing, repeated, or unfinished action.", example: "читать — to be reading" },
  { term: "infinitive", plain: "the base 'to ___' form of a verb.", example: "читать — 'to read'" },
  { term: "imperative", plain: "the command form.", example: "Читай! — 'Read!'" },
  { term: "participle", plain: "a verb turned into an adjective.", example: "the READING man" },
  { term: "gerund", aliases: ["verbal adverb"], plain: "a verb turned into an adverb.", example: "WHILE reading…" },
  { term: "reflexive", plain: "a verb where the action loops back on the doer; in Russian it ends in -ся.", example: "мыться — to wash oneself" },

  // Word building & sounds
  { term: "stem", plain: "the core part of a word before the changeable ending." },
  { term: "ending", plain: "the changeable last part of a word that carries the grammar info." },
  { term: "prefix", plain: "a piece added to the FRONT of a word to change its meaning.", example: "ПРИ-ехать — to arrive" },
  { term: "suffix", plain: "a piece added inside a word (before the ending) to build it." },
  { term: "root", plain: "the core meaning-carrying part of a word." },
  { term: "vowel", plain: "an open sound like a/e/o/у; Russian has 10 vowel letters." },
  { term: "consonant", plain: "a sound like b/k/т made by blocking air." },
  { term: "stress", aliases: ["word stress"], plain: "the syllable you say LOUDER. In Russian it can change a word's meaning.", example: "зА́мок (castle) vs замО́к (lock)" },
  { term: "transliteration", plain: "writing Russian sounds with English letters.", example: "'spasibo' for спасибо" },

  // Meaning
  { term: "idiom", aliases: ["idiomatic expression", "idiomatic"], plain: "a phrase whose meaning isn't literal.", example: "'piece of cake' = easy" },
  { term: "synonym", plain: "a word that means about the same as another." },
  { term: "antonym", plain: "a word that means the opposite." },
  { term: "register", plain: "how formal or casual the language is — e.g. 'Вы' (formal) vs 'ты' (casual)." },
];

// Build the matcher: all terms + aliases, escaped, longest-first (so multi-word
// terms win), with an optional plural. Lookup normalizes to the canonical entry.
const lookup = new Map<string, GlossEntry>();
for (const e of GLOSSARY) {
  lookup.set(e.term.toLowerCase(), e);
  for (const a of e.aliases || []) lookup.set(a.toLowerCase(), e);
}
const surfaces = Array.from(lookup.keys()).sort((a, b) => b.length - a.length);
const escaped = surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const GLOSS_RE = new RegExp(`\\b(${escaped.join("|")})(es|s)?\\b`, "gi");

export function glossRegex(): RegExp {
  GLOSS_RE.lastIndex = 0;
  return new RegExp(GLOSS_RE.source, "gi");
}

export function lookupTerm(raw: string): GlossEntry | undefined {
  let k = raw.toLowerCase();
  if (lookup.has(k)) return lookup.get(k);
  if (k.endsWith("es") && lookup.has(k.slice(0, -2))) return lookup.get(k.slice(0, -2));
  if (k.endsWith("s") && lookup.has(k.slice(0, -1))) return lookup.get(k.slice(0, -1));
  return undefined;
}
