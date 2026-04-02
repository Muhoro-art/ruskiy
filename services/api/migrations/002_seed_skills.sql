-- Seed: Core Russian Skills for English Speakers
-- Ordered by the transfer difficulty matrix from the product design

-- ============================================
-- CYRILLIC SCRIPT (A1)
-- ============================================
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('script.cyrillic.cognates', 'vocabulary', 'script', 'A1', 'Cyrillic Cognate Letters (М, Т, А, К)', 'Буквы-когнаты кириллицы'),
('script.cyrillic.false_friends', 'vocabulary', 'script', 'A1', 'Cyrillic False Friends (В, Н, Р, С)', 'Буквы-ложные друзья'),
('script.cyrillic.unique', 'vocabulary', 'script', 'A1', 'Unique Cyrillic Letters (Ж, Ш, Щ, Ц, Ы)', 'Уникальные буквы кириллицы'),
('script.cyrillic.soft_hard_signs', 'vocabulary', 'script', 'A1', 'Soft & Hard Signs (Ь, Ъ)', 'Мягкий и твёрдый знаки'),
('script.cyrillic.reading', 'vocabulary', 'script', 'A1', 'Basic Cyrillic Reading', 'Базовое чтение кириллицы'),
('script.cyrillic.handwriting', 'vocabulary', 'script', 'A1', 'Cyrillic Handwriting', 'Письмо кириллицей');

-- ============================================
-- PHONETICS (A1-B1)
-- ============================================
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('phonetics.vowels.basic', 'phonetics', 'vowels', 'A1', 'Russian Vowels (А, О, У, Э, Ы, И)', 'Русские гласные'),
('phonetics.vowels.reduction', 'phonetics', 'vowels', 'A2', 'Vowel Reduction (unstressed О→А)', 'Редукция гласных'),
('phonetics.consonants.voiced_voiceless', 'phonetics', 'consonants', 'A1', 'Voiced/Voiceless Consonant Pairs', 'Парные звонкие/глухие согласные'),
('phonetics.consonants.palatalization', 'phonetics', 'consonants', 'A2', 'Soft/Hard Consonant Pairs (Palatalization)', 'Мягкие/твёрдые согласные (палатализация)'),
('phonetics.consonants.russian_r', 'phonetics', 'consonants', 'A2', 'Russian Trill Р vs English R', 'Русское Р (трель)'),
('phonetics.consonants.kh_sound', 'phonetics', 'consonants', 'A1', 'Russian Х (velar fricative)', 'Звук Х'),
('phonetics.stress.patterns', 'phonetics', 'prosody', 'A2', 'Word Stress Patterns', 'Ударение в словах'),
('phonetics.intonation.questions', 'phonetics', 'prosody', 'B1', 'Question Intonation (IK-3)', 'Интонация вопросов (ИК-3)');

-- ============================================
-- GRAMMAR: CASE SYSTEM (Progressive Unlocking)
-- ============================================

-- Nominative (A1)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.nominative.singular', 'grammar', 'cases', 'A1', 'Nominative Case: Singular', 'Именительный падеж: ед. число'),
('grammar.cases.nominative.plural', 'grammar', 'cases', 'A1', 'Nominative Case: Plural', 'Именительный падеж: мн. число');

-- Accusative (A1)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.accusative.inanimate', 'grammar', 'cases', 'A1', 'Accusative Case: Inanimate', 'Винительный падеж: неодуш.'),
('grammar.cases.accusative.animate', 'grammar', 'cases', 'A2', 'Accusative Case: Animate', 'Винительный падеж: одуш.'),
('grammar.cases.accusative.fem_singular', 'grammar', 'cases', 'A1', 'Accusative: Feminine Singular (-у/-ю)', 'Вин. падеж: жен. род ед. ч.');

-- Prepositional (A1-A2)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.prepositional.location', 'grammar', 'cases', 'A1', 'Prepositional Case: Location (в/на + prep)', 'Предложный падеж: место'),
('grammar.cases.prepositional.about', 'grammar', 'cases', 'A2', 'Prepositional Case: About (о/об)', 'Предложный падеж: о ком/чём');

-- Genitive (A2)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.genitive.singular', 'grammar', 'cases', 'A2', 'Genitive Case: Singular', 'Родительный падеж: ед. число'),
('grammar.cases.genitive.plural', 'grammar', 'cases', 'B1', 'Genitive Case: Plural', 'Родительный падеж: мн. число'),
('grammar.cases.genitive.possession', 'grammar', 'cases', 'A2', 'Genitive: Possession & Absence', 'Род. падеж: принадлежность и отсутствие'),
('grammar.cases.genitive.quantity', 'grammar', 'cases', 'A2', 'Genitive: After Numbers', 'Род. падеж: после числительных');

-- Dative (A2-B1)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.dative.singular', 'grammar', 'cases', 'A2', 'Dative Case: Singular', 'Дательный падеж: ед. число'),
('grammar.cases.dative.plural', 'grammar', 'cases', 'B1', 'Dative Case: Plural', 'Дательный падеж: мн. число'),
('grammar.cases.dative.expressions', 'grammar', 'cases', 'A2', 'Dative: Age & Impersonal (мне нужно)', 'Дат. падеж: возраст и безличные');

-- Instrumental (B1)
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.cases.instrumental.singular', 'grammar', 'cases', 'B1', 'Instrumental Case: Singular', 'Творительный падеж: ед. число'),
('grammar.cases.instrumental.plural', 'grammar', 'cases', 'B1', 'Instrumental Case: Plural', 'Творительный падеж: мн. число'),
('grammar.cases.instrumental.with', 'grammar', 'cases', 'A2', 'Instrumental: With (с + instr)', 'Твор. падеж: с кем/чем');

-- ============================================
-- GRAMMAR: VERBS
-- ============================================
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('grammar.verbs.present.first_conj', 'grammar', 'verbs', 'A1', 'Present Tense: 1st Conjugation', 'Настоящее время: 1 спряжение'),
('grammar.verbs.present.second_conj', 'grammar', 'verbs', 'A1', 'Present Tense: 2nd Conjugation', 'Настоящее время: 2 спряжение'),
('grammar.verbs.past', 'grammar', 'verbs', 'A1', 'Past Tense', 'Прошедшее время'),
('grammar.verbs.future.imperfective', 'grammar', 'verbs', 'A2', 'Future: Imperfective (буду + inf)', 'Будущее несовершенного вида'),
('grammar.verbs.future.perfective', 'grammar', 'verbs', 'A2', 'Future: Perfective', 'Будущее совершенного вида'),
('grammar.verbs.aspect.intro', 'grammar', 'aspect', 'A2', 'Verbal Aspect: Introduction', 'Вид глагола: введение'),
('grammar.verbs.aspect.pairs', 'grammar', 'aspect', 'B1', 'Verbal Aspect: Common Pairs', 'Вид глагола: видовые пары'),
('grammar.verbs.aspect.usage', 'grammar', 'aspect', 'B1', 'Verbal Aspect: When to Use Which', 'Вид глагола: когда какой использовать'),
('grammar.verbs.motion.basic', 'grammar', 'verbs', 'A2', 'Verbs of Motion: Basic (идти/ходить)', 'Глаголы движения: базовые'),
('grammar.verbs.motion.prefixed', 'grammar', 'verbs', 'B1', 'Verbs of Motion: Prefixed', 'Глаголы движения: приставочные'),
('grammar.verbs.imperative', 'grammar', 'verbs', 'A2', 'Imperative Mood', 'Повелительное наклонение');

-- ============================================
-- VOCABULARY: SURVIVAL (A1)
-- ============================================
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('vocab.greetings', 'vocabulary', 'survival', 'A1', 'Greetings & Introductions', 'Приветствия и знакомство'),
('vocab.numbers.1_20', 'vocabulary', 'survival', 'A1', 'Numbers 1–20', 'Числа 1–20'),
('vocab.numbers.21_100', 'vocabulary', 'survival', 'A1', 'Numbers 21–100', 'Числа 21–100'),
('vocab.family', 'vocabulary', 'survival', 'A1', 'Family Members', 'Семья'),
('vocab.food.basic', 'vocabulary', 'survival', 'A1', 'Basic Food & Drinks', 'Еда и напитки'),
('vocab.colors', 'vocabulary', 'survival', 'A1', 'Colors', 'Цвета'),
('vocab.days_months', 'vocabulary', 'survival', 'A1', 'Days & Months', 'Дни и месяцы'),
('vocab.directions', 'vocabulary', 'survival', 'A1', 'Basic Directions', 'Базовые направления'),
('vocab.transport', 'vocabulary', 'survival', 'A1', 'Public Transport', 'Общественный транспорт'),
('vocab.shopping', 'vocabulary', 'survival', 'A1', 'Shopping Phrases', 'Фразы для покупок');

-- ============================================
-- PRAGMATICS (A1-B1)
-- ============================================
INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
('pragmatics.formality.ty_vy', 'pragmatics', 'formality', 'A1', 'Formal vs Informal: ты/Вы', 'Ты/Вы: формальность общения'),
('pragmatics.politeness.requests', 'pragmatics', 'politeness', 'A2', 'Polite Requests & Softening', 'Вежливые просьбы'),
('pragmatics.conversation.fillers', 'pragmatics', 'conversation', 'B1', 'Conversational Fillers & Discourse Markers', 'Разговорные вставки и маркеры');
