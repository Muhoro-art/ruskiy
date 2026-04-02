-- Set prerequisites for additional skills from migrations 004-006

-- Case variants need their base case
UPDATE skills SET prerequisites = ARRAY['grammar.cases.accusative.inanimate'] WHERE skill_id = 'grammar.cases.accusative.masc_inanimate' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.accusative.inanimate'] WHERE skill_id = 'grammar.cases.accusative.masc_animate' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.dative.singular'] WHERE skill_id = 'grammar.cases.dative.fem_singular' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.dative.singular'] WHERE skill_id = 'grammar.cases.dative.indirect_object' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.genitive.singular'] WHERE skill_id = 'grammar.cases.genitive.masc_singular' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.genitive.singular'] WHERE skill_id = 'grammar.cases.genitive.negation' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.instrumental.singular'] WHERE skill_id = 'grammar.cases.instrumental.fem_singular' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.nominative.singular'] WHERE skill_id = 'grammar.cases.nominative.gender' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Adjectives
UPDATE skills SET prerequisites = ARRAY['grammar.cases.nominative.singular'] WHERE skill_id = 'grammar.adjectives.agreement.nom' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.adjectives.agreement.nom'] WHERE skill_id = 'grammar.adjectives.comparative' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Grammar structures
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.present.first_conj'] WHERE skill_id = 'grammar.conditional.basic' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.nominative.singular'] WHERE skill_id = 'grammar.negation.basic' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.genitive.singular'] WHERE skill_id = 'grammar.possessive.u_menya' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.accusative.inanimate'] WHERE skill_id = 'grammar.prepositions.direction' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.cases.prepositional.location'] WHERE skill_id = 'grammar.prepositions.location' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'grammar.pronouns.personal' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.pronouns.personal'] WHERE skill_id = 'grammar.pronouns.possessive' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'grammar.questions.words' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Verbs
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.present.first_conj'] WHERE skill_id = 'grammar.verbs.being.est' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.past'] WHERE skill_id = 'grammar.verbs.future.compound' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.present.first_conj'] WHERE skill_id = 'grammar.verbs.irregular.go' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.present.first_conj'] WHERE skill_id = 'grammar.verbs.irregular.want' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.past'] WHERE skill_id = 'grammar.verbs.past.feminine' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.past'] WHERE skill_id = 'grammar.verbs.past.masculine' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.present.first_conj'] WHERE skill_id = 'grammar.verbs.reflexive' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['grammar.verbs.aspect.intro'] WHERE skill_id = 'grammar.verbs.aspect.basic' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Phonetics
UPDATE skills SET prerequisites = ARRAY['phonetics.consonants.palatalization'] WHERE skill_id = 'phonetics.palatalization' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['phonetics.vowels.basic'] WHERE skill_id = 'phonetics.vowel_reduction' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Script
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'script.cyrillic.vowels' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'script.cyrillic.signs' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);

-- Vocabulary
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'vocab.body' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['vocab.food.basic'] WHERE skill_id = 'vocab.food.drinks' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'vocab.health' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['vocab.numbers.1_20'] WHERE skill_id = 'vocab.numbers.tens' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'vocab.phrases.essential' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['script.cyrillic.cognates'] WHERE skill_id = 'vocab.services' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['vocab.days_months'] WHERE skill_id = 'vocab.time.days' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
UPDATE skills SET prerequisites = ARRAY['vocab.days_months'] WHERE skill_id = 'vocab.time.months' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL);
