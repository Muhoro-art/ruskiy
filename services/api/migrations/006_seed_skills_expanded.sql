-- Migration 006: Additional skills referenced by expanded content

INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
-- Cyrillic additions
('script.cyrillic.signs', 'vocabulary', 'script', 'A1', 'Soft & Hard Signs (Ь, Ъ)', 'Мягкий и твёрдый знаки'),
('script.cyrillic.vowels', 'vocabulary', 'script', 'A1', 'Vowel Pairs (Hard/Soft)', 'Пары гласных (твёрдые/мягкие)')
ON CONFLICT (skill_id) DO NOTHING;

INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
-- Phonetics additions
('phonetics.vowel_reduction', 'phonetics', 'vowels', 'A2', 'Vowel Reduction (О→А unstressed)', 'Редукция гласных'),
('phonetics.palatalization', 'phonetics', 'consonants', 'A2', 'Palatalization (Soft vs Hard)', 'Палатализация (мягкие/твёрдые)')
ON CONFLICT (skill_id) DO NOTHING;

INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
-- Grammar additions
('grammar.pronouns.personal', 'grammar', 'pronouns', 'A1', 'Personal Pronouns', 'Личные местоимения'),
('grammar.pronouns.possessive', 'grammar', 'pronouns', 'A1', 'Possessive Pronouns (мой/моя/моё)', 'Притяжательные местоимения'),
('grammar.cases.nominative.gender', 'grammar', 'cases', 'A1', 'Noun Gender (Masculine/Feminine/Neuter)', 'Род существительных'),
('grammar.cases.accusative.masc_animate', 'grammar', 'cases', 'A2', 'Accusative: Masculine Animate', 'Вин. падеж: муж. род одуш.'),
('grammar.cases.accusative.masc_inanimate', 'grammar', 'cases', 'A1', 'Accusative: Masculine Inanimate', 'Вин. падеж: муж. род неодуш.'),
('grammar.cases.genitive.negation', 'grammar', 'cases', 'A2', 'Genitive: Negation (нет + gen)', 'Род. падеж: отрицание'),
('grammar.cases.genitive.masc_singular', 'grammar', 'cases', 'A2', 'Genitive: Masculine Singular', 'Род. падеж: муж. род ед. ч.'),
('grammar.cases.dative.indirect_object', 'grammar', 'cases', 'A2', 'Dative: Indirect Object', 'Дат. падеж: косвенное дополнение'),
('grammar.cases.dative.fem_singular', 'grammar', 'cases', 'A2', 'Dative: Feminine Singular', 'Дат. падеж: жен. род ед. ч.'),
('grammar.cases.instrumental.fem_singular', 'grammar', 'cases', 'B1', 'Instrumental: Feminine Singular', 'Твор. падеж: жен. род ед. ч.'),
('grammar.adjectives.agreement.nom', 'grammar', 'adjectives', 'A1', 'Adjective Agreement: Nominative', 'Согласование прилагательных: Им. п.'),
('grammar.adjectives.comparative', 'grammar', 'adjectives', 'A2', 'Comparative Adjectives', 'Сравнительная степень прилагательных'),
('grammar.prepositions.location', 'grammar', 'prepositions', 'A1', 'Prepositions of Location (в, на)', 'Предлоги места'),
('grammar.prepositions.direction', 'grammar', 'prepositions', 'A1', 'Prepositions of Direction (в, на + acc)', 'Предлоги направления'),
('grammar.negation.basic', 'grammar', 'negation', 'A1', 'Basic Negation (не/нет)', 'Базовое отрицание'),
('grammar.questions.words', 'grammar', 'questions', 'A1', 'Question Words (кто, что, где, когда)', 'Вопросительные слова'),
('grammar.possessive.u_menya', 'grammar', 'possessive', 'A1', 'Possessive Construction (у меня есть)', 'Конструкция ''у меня есть'''),
('grammar.verbs.being.est', 'grammar', 'verbs', 'A1', 'Existence (есть / there is)', 'Глагол быть / наличие'),
('grammar.verbs.irregular.want', 'grammar', 'verbs', 'A1', 'Irregular: хотеть (to want)', 'Неправильный: хотеть'),
('grammar.verbs.irregular.go', 'grammar', 'verbs', 'A1', 'Irregular: идти (to go)', 'Неправильный: идти'),
('grammar.verbs.past.masculine', 'grammar', 'verbs', 'A1', 'Past Tense: Masculine', 'Прошедшее время: муж. род'),
('grammar.verbs.past.feminine', 'grammar', 'verbs', 'A1', 'Past Tense: Feminine', 'Прошедшее время: жен. род'),
('grammar.verbs.aspect.basic', 'grammar', 'aspect', 'A2', 'Verbal Aspect: Basics', 'Вид глагола: основы'),
('grammar.verbs.motion.basic', 'grammar', 'verbs', 'A2', 'Verbs of Motion: Basic', 'Глаголы движения: основы'),
('grammar.verbs.reflexive', 'grammar', 'verbs', 'A2', 'Reflexive Verbs (-ся/-сь)', 'Возвратные глаголы'),
('grammar.verbs.future.compound', 'grammar', 'verbs', 'A2', 'Future: Compound (буду + infinitive)', 'Составное будущее время'),
('grammar.conditional.basic', 'grammar', 'conditional', 'A2', 'Conditional: бы + past tense', 'Сослагательное наклонение: бы')
ON CONFLICT (skill_id) DO NOTHING;

INSERT INTO skills (skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru) VALUES
-- Vocabulary additions
('vocab.numbers.tens', 'vocabulary', 'survival', 'A1', 'Numbers: Tens (20-100)', 'Числа: десятки'),
('vocab.food.drinks', 'vocabulary', 'survival', 'A1', 'Drinks', 'Напитки'),
('vocab.time.days', 'vocabulary', 'survival', 'A1', 'Days of the Week', 'Дни недели'),
('vocab.time.months', 'vocabulary', 'survival', 'A1', 'Months of the Year', 'Месяцы'),
('vocab.phrases.essential', 'vocabulary', 'survival', 'A1', 'Essential Survival Phrases', 'Базовые фразы для выживания'),
('vocab.body', 'vocabulary', 'health', 'A2', 'Body Parts', 'Части тела'),
('vocab.health', 'vocabulary', 'health', 'A2', 'Health & Doctor Visits', 'Здоровье и врач'),
('vocab.services', 'vocabulary', 'survival', 'A2', 'Public Services (post, bank)', 'Государственные услуги')
ON CONFLICT (skill_id) DO NOTHING;
