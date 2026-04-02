-- Migration: Populate skill prerequisites
-- Implements progressive unlocking chains from the product design doc
-- Case order: Nominative → Accusative → Prepositional → Genitive → Dative → Instrumental

-- ============================================
-- CYRILLIC SCRIPT CHAIN
-- ============================================
UPDATE skills SET prerequisites = '{}' WHERE skill_id = 'script.cyrillic.cognates';
UPDATE skills SET prerequisites = '{script.cyrillic.cognates}' WHERE skill_id = 'script.cyrillic.false_friends';
UPDATE skills SET prerequisites = '{script.cyrillic.false_friends}' WHERE skill_id = 'script.cyrillic.unique';
UPDATE skills SET prerequisites = '{script.cyrillic.cognates}' WHERE skill_id = 'script.cyrillic.soft_hard_signs';
UPDATE skills SET prerequisites = '{script.cyrillic.cognates,script.cyrillic.false_friends,script.cyrillic.unique}' WHERE skill_id = 'script.cyrillic.reading';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'script.cyrillic.handwriting';

-- ============================================
-- PHONETICS CHAIN
-- ============================================
UPDATE skills SET prerequisites = '{}' WHERE skill_id = 'phonetics.vowels.basic';
UPDATE skills SET prerequisites = '{phonetics.vowels.basic}' WHERE skill_id = 'phonetics.vowels.reduction';
UPDATE skills SET prerequisites = '{}' WHERE skill_id = 'phonetics.consonants.voiced_voiceless';
UPDATE skills SET prerequisites = '{phonetics.consonants.voiced_voiceless}' WHERE skill_id = 'phonetics.consonants.palatalization';
UPDATE skills SET prerequisites = '{phonetics.consonants.palatalization}' WHERE skill_id = 'phonetics.consonants.russian_r';
UPDATE skills SET prerequisites = '{}' WHERE skill_id = 'phonetics.consonants.kh_sound';
UPDATE skills SET prerequisites = '{phonetics.vowels.reduction}' WHERE skill_id = 'phonetics.stress.patterns';
UPDATE skills SET prerequisites = '{phonetics.stress.patterns}' WHERE skill_id = 'phonetics.intonation.questions';

-- ============================================
-- GRAMMAR: NOMINATIVE (entry point for cases)
-- ============================================
UPDATE skills SET prerequisites = '{}' WHERE skill_id = 'grammar.cases.nominative.singular';
UPDATE skills SET prerequisites = '{grammar.cases.nominative.singular}' WHERE skill_id = 'grammar.cases.nominative.plural';

-- ============================================
-- GRAMMAR: ACCUSATIVE (requires Nominative)
-- ============================================
UPDATE skills SET prerequisites = '{grammar.cases.nominative.singular,grammar.cases.nominative.plural}' WHERE skill_id = 'grammar.cases.accusative.inanimate';
UPDATE skills SET prerequisites = '{grammar.cases.accusative.inanimate}' WHERE skill_id = 'grammar.cases.accusative.animate';
UPDATE skills SET prerequisites = '{grammar.cases.accusative.inanimate}' WHERE skill_id = 'grammar.cases.accusative.fem_singular';

-- ============================================
-- GRAMMAR: PREPOSITIONAL (requires Accusative)
-- ============================================
UPDATE skills SET prerequisites = '{grammar.cases.accusative.inanimate}' WHERE skill_id = 'grammar.cases.prepositional.location';
UPDATE skills SET prerequisites = '{grammar.cases.prepositional.location}' WHERE skill_id = 'grammar.cases.prepositional.about';

-- ============================================
-- GRAMMAR: GENITIVE (requires Prepositional)
-- ============================================
UPDATE skills SET prerequisites = '{grammar.cases.prepositional.location}' WHERE skill_id = 'grammar.cases.genitive.singular';
UPDATE skills SET prerequisites = '{grammar.cases.genitive.singular}' WHERE skill_id = 'grammar.cases.genitive.plural';
UPDATE skills SET prerequisites = '{grammar.cases.genitive.singular}' WHERE skill_id = 'grammar.cases.genitive.possession';
UPDATE skills SET prerequisites = '{grammar.cases.genitive.singular,vocab.numbers.1_20}' WHERE skill_id = 'grammar.cases.genitive.quantity';

-- ============================================
-- GRAMMAR: DATIVE (requires Genitive)
-- ============================================
UPDATE skills SET prerequisites = '{grammar.cases.genitive.singular}' WHERE skill_id = 'grammar.cases.dative.singular';
UPDATE skills SET prerequisites = '{grammar.cases.dative.singular}' WHERE skill_id = 'grammar.cases.dative.plural';
UPDATE skills SET prerequisites = '{grammar.cases.dative.singular}' WHERE skill_id = 'grammar.cases.dative.expressions';

-- ============================================
-- GRAMMAR: INSTRUMENTAL (requires Dative)
-- ============================================
UPDATE skills SET prerequisites = '{grammar.cases.dative.singular}' WHERE skill_id = 'grammar.cases.instrumental.singular';
UPDATE skills SET prerequisites = '{grammar.cases.instrumental.singular}' WHERE skill_id = 'grammar.cases.instrumental.plural';
UPDATE skills SET prerequisites = '{grammar.cases.instrumental.singular}' WHERE skill_id = 'grammar.cases.instrumental.with';

-- ============================================
-- GRAMMAR: VERBS
-- ============================================
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'grammar.verbs.present.first_conj';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'grammar.verbs.present.second_conj';
UPDATE skills SET prerequisites = '{grammar.verbs.present.first_conj,grammar.verbs.present.second_conj}' WHERE skill_id = 'grammar.verbs.past';
UPDATE skills SET prerequisites = '{grammar.verbs.past}' WHERE skill_id = 'grammar.verbs.future.imperfective';
UPDATE skills SET prerequisites = '{grammar.verbs.past}' WHERE skill_id = 'grammar.verbs.aspect.intro';
UPDATE skills SET prerequisites = '{grammar.verbs.future.imperfective,grammar.verbs.aspect.intro}' WHERE skill_id = 'grammar.verbs.future.perfective';
UPDATE skills SET prerequisites = '{grammar.verbs.aspect.intro}' WHERE skill_id = 'grammar.verbs.aspect.pairs';
UPDATE skills SET prerequisites = '{grammar.verbs.aspect.pairs}' WHERE skill_id = 'grammar.verbs.aspect.usage';
UPDATE skills SET prerequisites = '{grammar.verbs.present.first_conj,grammar.verbs.present.second_conj}' WHERE skill_id = 'grammar.verbs.motion.basic';
UPDATE skills SET prerequisites = '{grammar.verbs.motion.basic,grammar.verbs.aspect.intro}' WHERE skill_id = 'grammar.verbs.motion.prefixed';
UPDATE skills SET prerequisites = '{grammar.verbs.present.first_conj,grammar.verbs.present.second_conj}' WHERE skill_id = 'grammar.verbs.imperative';

-- ============================================
-- VOCABULARY
-- ============================================
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.greetings';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.numbers.1_20';
UPDATE skills SET prerequisites = '{vocab.numbers.1_20}' WHERE skill_id = 'vocab.numbers.21_100';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.family';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.food.basic';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.colors';
UPDATE skills SET prerequisites = '{script.cyrillic.reading}' WHERE skill_id = 'vocab.days_months';
UPDATE skills SET prerequisites = '{grammar.cases.nominative.singular,vocab.greetings}' WHERE skill_id = 'vocab.directions';
UPDATE skills SET prerequisites = '{grammar.cases.nominative.singular,vocab.greetings}' WHERE skill_id = 'vocab.transport';
UPDATE skills SET prerequisites = '{vocab.numbers.1_20,vocab.greetings}' WHERE skill_id = 'vocab.shopping';

-- ============================================
-- PRAGMATICS
-- ============================================
UPDATE skills SET prerequisites = '{vocab.greetings}' WHERE skill_id = 'pragmatics.formality.ty_vy';
UPDATE skills SET prerequisites = '{pragmatics.formality.ty_vy}' WHERE skill_id = 'pragmatics.politeness.requests';
UPDATE skills SET prerequisites = '{pragmatics.politeness.requests}' WHERE skill_id = 'pragmatics.conversation.fillers';
