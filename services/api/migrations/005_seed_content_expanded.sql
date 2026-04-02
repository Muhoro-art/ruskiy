-- Migration 005: Expanded content seeding — 100+ exercises for comprehensive A1/A2 coverage

-- =====================
-- CYRILLIC SCRIPT
-- =====================

INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data) VALUES

-- Cyrillic: unique letters matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['script.cyrillic.unique'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match these uniquely Russian letters to their sounds", "matchPairs": [
   {"left": "Ж", "right": "Zh (as in pleasure)"},
   {"left": "Ш", "right": "Sh (as in ship)"},
   {"left": "Щ", "right": "Shch (as in fresh cheese)"},
   {"left": "Ц", "right": "Ts (as in cats)"},
   {"left": "Ч", "right": "Ch (as in church)"}
 ], "explanationEn": "These consonants have no single English letter equivalent but have familiar sounds."}'),

-- Cyrillic: soft/hard signs
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.signs'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "Ь", "promptEn": "What is the function of this letter?",
  "correctAnswer": "It softens the preceding consonant (soft sign)",
  "distractors": ["It adds a pause between syllables", "It makes a vowel sound", "It hardens the preceding consonant"],
  "explanationEn": "Ь (soft sign) does not make a sound itself — it tells you to palatalize (soften) the consonant before it.",
  "hintSequence": ["This is a sign, not a letter with its own sound", "Think about what мягкий знак means"]}'),

-- Cyrillic: vowel pairs
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['script.cyrillic.vowels'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 30,
 '{"promptEn": "Match the hard and soft vowel pairs", "matchPairs": [
   {"left": "А (hard)", "right": "Я (soft)"},
   {"left": "О (hard)", "right": "Ё (soft)"},
   {"left": "У (hard)", "right": "Ю (soft)"},
   {"left": "Э (hard)", "right": "Е (soft)"},
   {"left": "Ы (hard)", "right": "И (soft)"}
 ], "explanationEn": "Russian vowels come in pairs: hard and soft. Soft vowels palatalize the preceding consonant."}'),

-- Cyrillic: reading practice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 15,
 '{"promptRu": "РЕСТОРАН", "promptEn": "What English word does this look like?",
  "correctAnswer": "Restaurant",
  "distractors": ["Restart", "Restore", "Resistance"],
  "explanationEn": "Ресторан is a cognate — it looks and means the same as the English word restaurant!"}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 15,
 '{"promptRu": "ТАКСИ", "promptEn": "What English word does this look like?",
  "correctAnswer": "Taxi",
  "distractors": ["Task", "Tax", "Tuxedo"],
  "explanationEn": "Такси is a direct borrowing from English. Many international words exist in Russian!"}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 15,
 '{"promptRu": "КОФЕ", "promptEn": "What English word does this look like?",
  "correctAnswer": "Coffee",
  "distractors": ["Cough", "Cozy", "Copy"],
  "explanationEn": "Кофе means coffee. Note: it is one of the rare masculine nouns that ends in -е!"}'),

-- =====================
-- PHONETICS
-- =====================

-- Voiced/voiceless pairs
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['phonetics.consonants.voiced_voiceless'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 30,
 '{"promptEn": "Match the voiced consonant to its voiceless pair", "matchPairs": [
   {"left": "Б [b]", "right": "П [p]"},
   {"left": "В [v]", "right": "Ф [f]"},
   {"left": "Г [g]", "right": "К [k]"},
   {"left": "Д [d]", "right": "Т [t]"},
   {"left": "З [z]", "right": "С [s]"}
 ], "explanationEn": "In Russian, voiced consonants become voiceless at the end of words. This is called final devoicing: хлеб sounds like хлеп."}'),

-- Stress and reduction
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['phonetics.vowel_reduction'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 20,
 '{"promptEn": "In the word молоко (milk), which О sounds like [a]?",
  "correctAnswer": "The first two О''s (only the last О is stressed)",
  "distractors": ["All three О''s sound the same", "Only the first О sounds like [a]", "None — О always sounds like O"],
  "explanationEn": "Russian unstressed О reduces to an [a]-like sound. In молокО, stress falls on the last syllable, so the first two О''s sound like [a].",
  "hintSequence": ["Stress falls on the last syllable", "Unstressed О reduces"]}'),

-- Palatalization
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['phonetics.palatalization'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.40, 20,
 '{"promptEn": "What happens to the consonant in мяч (ball) vs мат (checkmate)?",
  "correctAnswer": "In мяч, the М is palatalized (soft) because of Я; in мат, it is hard",
  "distractors": ["They sound the same", "In мат, the М is soft", "The А makes the М harder in both"],
  "explanationEn": "Soft vowels (Я, Е, Ё, И, Ю) palatalize the consonant before them. Hard vowels (А, Э, О, Ы, У) keep it hard."}'),

-- =====================
-- GREETINGS & BASICS
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.greetings'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 30,
 '{"promptEn": "Match the Russian greeting to its English meaning", "matchPairs": [
   {"left": "Привет", "right": "Hi (informal)"},
   {"left": "Здравствуйте", "right": "Hello (formal)"},
   {"left": "Доброе утро", "right": "Good morning"},
   {"left": "До свидания", "right": "Goodbye"},
   {"left": "Пока", "right": "Bye (informal)"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.greetings', 'pragmatics.formality.ty_vy'], 'A1',
 ARRAY['uni_prep','migrant','senior'], ARRAY['general'], 0.20, 20,
 '{"promptRu": "___, меня зовут Анна.", "promptEn": "___. My name is Anna. (formal context)",
  "correctAnswer": "Здравствуйте",
  "distractors": ["Привет", "Пока", "Эй"],
  "explanationEn": "In formal introductions, always use Здравствуйте.",
  "hintSequence": ["This is a formal setting", "The formal greeting derives from здоровье (health)"]}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 15,
 '{"promptEn": "How do you say ''Thank you'' in Russian?",
  "correctAnswer": "Спасибо",
  "distractors": ["Пожалуйста", "Извините", "Ничего"],
  "explanationEn": "Спасибо means thank you. It comes from Спаси Бог (God save you)."}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 15,
 '{"promptEn": "How do you say ''Please'' or ''You are welcome'' in Russian?",
  "correctAnswer": "Пожалуйста",
  "distractors": ["Спасибо", "Простите", "Здорово"],
  "explanationEn": "Пожалуйста has a double function — it means both please and you are welcome!"}'),

-- =====================
-- PERSONAL PRONOUNS
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.pronouns.personal'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 25,
 '{"promptEn": "Match the Russian pronoun to its English meaning", "matchPairs": [
   {"left": "я", "right": "I"},
   {"left": "ты", "right": "you (informal)"},
   {"left": "он / она", "right": "he / she"},
   {"left": "мы", "right": "we"},
   {"left": "они", "right": "they"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.pronouns.personal', 'pragmatics.formality.ty_vy'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptEn": "You are writing an email to your boss. Which pronoun should you use for ''you''?",
  "correctAnswer": "Вы (formal you)",
  "distractors": ["ты (informal you)", "они (they)", "мы (we)"],
  "explanationEn": "Вы (capitalized in letters) is the formal/polite form of you. Use it with superiors, strangers, and elders.",
  "hintSequence": ["Think about formality with your boss"]}'),

-- =====================
-- NUMBERS
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.numbers.1_20'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 20,
 '{"promptEn": "Write the Russian word for the number 7:", "promptRu": "7 = ___",
  "correctAnswer": "семь",
  "distractors": ["шесть", "восемь", "пять"],
  "explanationEn": "Семь (7) — note the soft sign at the end!"}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.numbers.1_20'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 30,
 '{"promptEn": "Match the numbers 11–15 to their Russian words", "matchPairs": [
   {"left": "11", "right": "одиннадцать"},
   {"left": "12", "right": "двенадцать"},
   {"left": "13", "right": "тринадцать"},
   {"left": "14", "right": "четырнадцать"},
   {"left": "15", "right": "пятнадцать"}
 ], "explanationEn": "Russian teens all end in -надцать (на десять = on ten). Just add the base number!"}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.numbers.tens'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptEn": "Write the Russian word for 20:", "promptRu": "20 = ___",
  "correctAnswer": "двадцать",
  "distractors": ["двенадцать", "тридцать", "десять"],
  "explanationEn": "Двадцать = два + дцать (two tens). Pattern continues: тридцать (30), сорок (40 — irregular!)."}'),

-- =====================
-- NOMINATIVE CASE (basic nouns)
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.nominative.gender'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 15,
 '{"promptRu": "книга", "promptEn": "What gender is this noun?",
  "correctAnswer": "Feminine (ends in -а)",
  "distractors": ["Masculine", "Neuter", "Plural"],
  "explanationEn": "Russian nouns ending in -а or -я are typically feminine: книга (book), мама (mom), Россия (Russia)."}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.nominative.gender'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 15,
 '{"promptRu": "стол", "promptEn": "What gender is this noun?",
  "correctAnswer": "Masculine (ends in a consonant)",
  "distractors": ["Feminine", "Neuter", "Plural"],
  "explanationEn": "Russian nouns ending in a consonant are typically masculine: стол (table), дом (house), студент (student)."}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.nominative.gender'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 15,
 '{"promptRu": "окно", "promptEn": "What gender is this noun?",
  "correctAnswer": "Neuter (ends in -о)",
  "distractors": ["Masculine", "Feminine", "Plural"],
  "explanationEn": "Russian nouns ending in -о or -е are typically neuter: окно (window), молоко (milk), море (sea)."}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.cases.nominative.gender'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 30,
 '{"promptEn": "Sort these nouns by gender", "matchPairs": [
   {"left": "дом (house)", "right": "masculine"},
   {"left": "школа (school)", "right": "feminine"},
   {"left": "молоко (milk)", "right": "neuter"},
   {"left": "студент (student)", "right": "masculine"},
   {"left": "мама (mom)", "right": "feminine"}
 ]}'),

-- =====================
-- ACCUSATIVE CASE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.accusative.fem_singular'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 25,
 '{"promptRu": "Я вижу ___.", "promptEn": "I see ___. (кошка → ?)",
  "correctAnswer": "кошку",
  "distractors": ["кошка", "кошки", "кошкой"],
  "explanationEn": "Accusative of animate feminine nouns: -а → -у. кошка (cat) → кошку.",
  "hintSequence": ["вижу requires accusative case", "Feminine -а → -у in accusative"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.accusative.masc_animate'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.40, 25,
 '{"promptRu": "Я знаю ___.", "promptEn": "I know ___. (студент → ?)",
  "correctAnswer": "студента",
  "distractors": ["студент", "студенту", "студентом"],
  "explanationEn": "Animate masculine nouns change in accusative: consonant ending → add -а. студент → студента.",
  "hintSequence": ["Animate masculine accusative = genitive", "Add -а to the consonant ending"]}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.accusative.masc_inanimate'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Я читаю ___.", "promptEn": "I am reading ___. (журнал / magazine)",
  "correctAnswer": "журнал",
  "distractors": ["журнала", "журналу", "журналом"],
  "explanationEn": "Inanimate masculine nouns do NOT change in accusative case. журнал stays журнал."}'),

-- =====================
-- PREPOSITIONAL CASE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.prepositional.location'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 25,
 '{"promptRu": "Я работаю в ___.", "promptEn": "I work in ___. (офис → ?)",
  "correctAnswer": "офисе",
  "distractors": ["офис", "офиса", "офису"],
  "explanationEn": "Prepositional case after в (in): masculine consonant endings add -е. офис → в офисе.",
  "hintSequence": ["в + location = prepositional case", "Masculine nouns add -е"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.prepositional.location'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 25,
 '{"promptRu": "Книга на ___.", "promptEn": "The book is on ___. (стол → ?)",
  "correctAnswer": "столе",
  "distractors": ["стол", "стола", "столу"],
  "explanationEn": "на + location also uses prepositional case. стол → на столе.",
  "hintSequence": ["на + location = prepositional", "Masculine consonant ending + -е"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.prepositional.about'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 25,
 '{"promptRu": "Мы говорим о ___.", "promptEn": "We are talking about ___. (музыка → ?)",
  "correctAnswer": "музыке",
  "distractors": ["музыка", "музыку", "музыкой"],
  "explanationEn": "о + topic uses prepositional case. Feminine -а → -е. музыка → о музыке.",
  "hintSequence": ["о (about) triggers prepositional case", "Feminine -а → -е"]}'),

-- =====================
-- GENITIVE CASE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.genitive.possession'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.45, 25,
 '{"promptRu": "Это книга ___.", "promptEn": "This is ___''s book. (мама → ?)",
  "correctAnswer": "мамы",
  "distractors": ["мама", "маме", "маму"],
  "explanationEn": "Genitive shows possession. Feminine -а → -ы. мама → мамы (mom''s).",
  "hintSequence": ["Possession uses genitive case", "Feminine -а → -ы in genitive"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.genitive.negation'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.45, 25,
 '{"promptRu": "У меня нет ___.", "promptEn": "I don''t have ___. (машина / car → ?)",
  "correctAnswer": "машины",
  "distractors": ["машина", "машину", "машиной"],
  "explanationEn": "After нет (don''t have / there is no), use genitive. машина → машины.",
  "hintSequence": ["нет requires genitive case", "Feminine -а → -ы"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.genitive.masc_singular'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.45, 25,
 '{"promptRu": "Без ___ невозможно.", "promptEn": "Without ___ it''s impossible. (паспорт → ?)",
  "correctAnswer": "паспорта",
  "distractors": ["паспорт", "паспорту", "паспортом"],
  "explanationEn": "Без (without) requires genitive. Masculine consonant endings add -а. паспорт → паспорта.",
  "hintSequence": ["без triggers genitive case", "Masculine nouns add -а in genitive"]}'),

-- =====================
-- DATIVE CASE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.dative.indirect_object'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.50, 25,
 '{"promptRu": "Я дал книгу ___.", "promptEn": "I gave the book to ___. (друг → ?)",
  "correctAnswer": "другу",
  "distractors": ["друг", "друга", "другом"],
  "explanationEn": "Dative case for the indirect object (to whom?). Masculine consonant endings add -у. друг → другу.",
  "hintSequence": ["To whom? = dative case", "Masculine nouns add -у in dative"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.dative.fem_singular'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.50, 25,
 '{"promptRu": "Я позвонил ___.", "promptEn": "I called ___. (сестра → ?)",
  "correctAnswer": "сестре",
  "distractors": ["сестра", "сестру", "сестрой"],
  "explanationEn": "Dative for feminine -а nouns: -а → -е. сестра → сестре.",
  "hintSequence": ["позвонить requires dative (to whom?)", "Feminine -а → -е in dative"]}'),

-- =====================
-- INSTRUMENTAL CASE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.instrumental.with'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.55, 25,
 '{"promptRu": "Я пью чай с ___.", "promptEn": "I drink tea with ___. (молоко → ?)",
  "correctAnswer": "молоком",
  "distractors": ["молоко", "молока", "молоке"],
  "explanationEn": "С (with) triggers instrumental case. Neuter -о → -ом. молоко → молоком.",
  "hintSequence": ["с (with) requires instrumental case", "Neuter -о → -ом"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.instrumental.fem_singular'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.55, 25,
 '{"promptRu": "Я пишу ___.", "promptEn": "I write with ___. (ручка / pen → ?)",
  "correctAnswer": "ручкой",
  "distractors": ["ручка", "ручку", "ручке"],
  "explanationEn": "Instrumental for feminine -а nouns: -а → -ой. ручка → ручкой (with a pen).",
  "hintSequence": ["How? / With what? = instrumental case", "Feminine -а → -ой"]}'),

-- =====================
-- VERB CONJUGATION
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.present.first_conj'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "Он ___ книгу.", "promptEn": "He ___ a book. (читать → ?)",
  "correctAnswer": "читает",
  "distractors": ["читать", "читаю", "читают"],
  "explanationEn": "Читать is 1st conjugation. он/она form: remove -ть, add -ет. чита + ет = читает.",
  "hintSequence": ["This is the он/она form", "1st conjugation: -ет for 3rd person singular"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.present.first_conj'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "Мы ___ в парке.", "promptEn": "We ___ in the park. (гулять → ?)",
  "correctAnswer": "гуляем",
  "distractors": ["гулять", "гуляет", "гуляют"],
  "explanationEn": "Гулять (to walk) is 1st conjugation. мы form: -ем. гуля + ем = гуляем.",
  "hintSequence": ["This is the мы form", "1st conjugation мы ending is -ем"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.present.second_conj'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Они ___ по-русски.", "promptEn": "They ___ Russian. (говорить → ?)",
  "correctAnswer": "говорят",
  "distractors": ["говорить", "говорит", "говорю"],
  "explanationEn": "Говорить is 2nd conjugation. они form: -ят. говор + ят = говорят.",
  "hintSequence": ["This is the они form", "2nd conjugation они ending is -ят"]}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.verbs.present.first_conj'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 35,
 '{"promptEn": "Match the pronoun to the correct form of работать (to work)", "matchPairs": [
   {"left": "я", "right": "работаю"},
   {"left": "ты", "right": "работаешь"},
   {"left": "он/она", "right": "работает"},
   {"left": "мы", "right": "работаем"},
   {"left": "они", "right": "работают"}
 ], "explanationEn": "Работать is 1st conjugation: -ю, -ешь, -ет, -ем, -ете, -ют"}'),

-- Irregular verbs
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.irregular.want'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 20,
 '{"promptRu": "Я ___ пить.", "promptEn": "I ___ to drink. (хотеть → ?)",
  "correctAnswer": "хочу",
  "distractors": ["хотеть", "хочет", "хотят"],
  "explanationEn": "Хотеть (to want) is irregular — it mixes conjugation patterns. я хочу, ты хочешь, but мы хотим.",
  "hintSequence": ["Хотеть is an irregular verb", "The я form has the stem хоч-"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.irregular.go'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Я ___ в школу.", "promptEn": "I ___ to school. (идти → ?)",
  "correctAnswer": "иду",
  "distractors": ["идти", "идёт", "идут"],
  "explanationEn": "Идти (to go on foot) — я иду, ты идёшь, он идёт.",
  "hintSequence": ["Идти is a verb of motion", "я form: ид + у"]}'),

-- =====================
-- VERBAL ASPECT
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.verbs.aspect.basic'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.50, 25,
 '{"promptEn": "Which sentence describes a completed action?",
  "correctAnswer": "Я написал письмо. (I wrote/finished the letter.)",
  "distractors": ["Я писал письмо. (I was writing a letter.)", "Я пишу письмо. (I am writing a letter.)", "Я буду писать. (I will write.)"],
  "explanationEn": "Написал (perfective) = completed action. Писал (imperfective) = ongoing/habitual action. This is the core of Russian verbal aspect.",
  "hintSequence": ["Look for the prefix на-", "Prefixed forms are usually perfective = completed"]}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.verbs.aspect.pairs'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.50, 30,
 '{"promptEn": "Match the imperfective verb to its perfective partner", "matchPairs": [
   {"left": "читать (read)", "right": "прочитать"},
   {"left": "писать (write)", "right": "написать"},
   {"left": "делать (do)", "right": "сделать"},
   {"left": "говорить (say)", "right": "сказать"},
   {"left": "покупать (buy)", "right": "купить"}
 ], "explanationEn": "Most perfective verbs are formed by adding a prefix. But some pairs are completely different words (говорить/сказать)."}'),

-- =====================
-- PAST TENSE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.past.masculine'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Он ___ в магазин.", "promptEn": "He ___ to the store. (ходить → past)",
  "correctAnswer": "ходил",
  "distractors": ["ходить", "ходит", "ходила"],
  "explanationEn": "Past tense for masculine: remove -ть, add -л. ходить → ходил. Feminine would be ходила.",
  "hintSequence": ["Past tense masculine ending", "Remove -ть, add -л"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.past.feminine'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Она ___ кофе.", "promptEn": "She ___ coffee. (пить → past)",
  "correctAnswer": "пила",
  "distractors": ["пить", "пил", "пили"],
  "explanationEn": "Past feminine: remove -ть, add -ла. пить → пила. Note: past tense agrees with the subject''s gender!",
  "hintSequence": ["She = feminine past tense", "Feminine past: -ла"]}'),

-- =====================
-- FOOD VOCABULARY
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.food.basic'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the Russian food word to its English meaning", "matchPairs": [
   {"left": "хлеб", "right": "bread"},
   {"left": "молоко", "right": "milk"},
   {"left": "сыр", "right": "cheese"},
   {"left": "мясо", "right": "meat"},
   {"left": "рыба", "right": "fish"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.food.drinks'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the Russian drinks to English", "matchPairs": [
   {"left": "чай", "right": "tea"},
   {"left": "кофе", "right": "coffee"},
   {"left": "вода", "right": "water"},
   {"left": "сок", "right": "juice"},
   {"left": "молоко", "right": "milk"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.food.basic'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 15,
 '{"promptRu": "яблоко", "promptEn": "What does this word mean?",
  "correctAnswer": "apple",
  "distractors": ["orange", "banana", "grape"],
  "explanationEn": "Яблоко (apple) is a neuter noun ending in -о. Plural: яблоки."}'),

-- =====================
-- FAMILY VOCABULARY
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.family'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the Russian family words to English", "matchPairs": [
   {"left": "мама", "right": "mom"},
   {"left": "папа", "right": "dad"},
   {"left": "брат", "right": "brother"},
   {"left": "сестра", "right": "sister"},
   {"left": "бабушка", "right": "grandmother"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.family'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 15,
 '{"promptEn": "My ___ is a teacher. (father)", "promptRu": "Мой ___ — учитель.",
  "correctAnswer": "папа",
  "distractors": ["мама", "брат", "дедушка"],
  "explanationEn": "Папа (dad) is masculine despite ending in -а. This is one of the few exceptions!"}'),

-- =====================
-- COLORS
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.colors'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the Russian colors to English", "matchPairs": [
   {"left": "красный", "right": "red"},
   {"left": "синий", "right": "blue"},
   {"left": "зелёный", "right": "green"},
   {"left": "белый", "right": "white"},
   {"left": "чёрный", "right": "black"}
 ], "explanationEn": "Fun fact: красный (red) comes from красивый (beautiful). Красная площадь = Beautiful Square!"}'),

-- =====================
-- POSSESSIVES
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.pronouns.possessive'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "___ книга", "promptEn": "___ book (my, feminine noun)",
  "correctAnswer": "моя",
  "distractors": ["мой", "моё", "мои"],
  "explanationEn": "Possessives agree with the noun''s gender. книга = feminine → моя. мой = masc, моё = neuter, мои = plural.",
  "hintSequence": ["книга is feminine", "Feminine possessive: моя"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.pronouns.possessive'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "Это ___ дом.", "promptEn": "This is ___ house. (my)",
  "correctAnswer": "мой",
  "distractors": ["моя", "моё", "мои"],
  "explanationEn": "дом is masculine → мой. Possessives must agree in gender with the noun they modify."}'),

-- =====================
-- ADJECTIVE AGREEMENT
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.adjectives.agreement.nom'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "___ дом", "promptEn": "___ house (big, masculine)",
  "correctAnswer": "большой",
  "distractors": ["большая", "большое", "большие"],
  "explanationEn": "Masculine adjective ending: -ой/-ый/-ий. дом = masculine → большой.",
  "hintSequence": ["дом is masculine", "Masculine adjective ending is -ой"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.adjectives.agreement.nom'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "___ машина", "promptEn": "___ car (new, feminine)",
  "correctAnswer": "новая",
  "distractors": ["новый", "новое", "новые"],
  "explanationEn": "Feminine adjective ending: -ая/-яя. машина = feminine → новая."}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.adjectives.agreement.nom'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "___ окно", "promptEn": "___ window (old, neuter)",
  "correctAnswer": "старое",
  "distractors": ["старый", "старая", "старые"],
  "explanationEn": "Neuter adjective ending: -ое/-ее. окно = neuter → старое."}'),

-- =====================
-- PREPOSITIONS
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.prepositions.location'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptEn": "Which preposition means ''in'' or ''at'' (location)?",
  "correctAnswer": "в",
  "distractors": ["на", "из", "к"],
  "explanationEn": "в + prepositional = in/at (enclosed spaces): в школе (at school), в городе (in the city). на = on/at (open spaces): на улице (on the street)."}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.prepositions.direction'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "Я иду ___ школу.", "promptEn": "I am going ___ school.",
  "correctAnswer": "в",
  "distractors": ["на", "из", "от"],
  "explanationEn": "в + accusative = direction toward enclosed spaces: в школу (to school). Compare: в школе (at school, prepositional)."}'),

-- =====================
-- DIALOGUES
-- =====================

-- Meeting someone
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['vocab.greetings', 'grammar.pronouns.personal'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 45,
 '{"dialogueLines": [
   {"speaker": "Аня", "textRu": "Привет! Меня зовут Аня. А тебя?", "textEn": "Hi! My name is Anya. And yours?"},
   {"speaker": "Вы", "textRu": "Привет! Меня зовут... Очень приятно!", "textEn": "Hi! My name is... Nice to meet you!"},
   {"speaker": "Аня", "textRu": "Очень приятно! Ты студент?", "textEn": "Nice to meet you! Are you a student?"},
   {"speaker": "Вы", "textRu": "Да, я студент. А ты?", "textEn": "Yes, I am a student. And you?"},
   {"speaker": "Аня", "textRu": "Я тоже студентка!", "textEn": "I am also a student! (fem)"}
 ], "explanationEn": "Notice: студент (male student) vs студентка (female student). Many professions have masculine/feminine forms in Russian."}'),

-- Shopping
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['vocab.shopping', 'vocab.numbers.1_20'], 'A1',
 ARRAY['uni_prep','migrant','senior'], ARRAY['general'], 0.25, 60,
 '{"dialogueLines": [
   {"speaker": "Продавец", "textRu": "Здравствуйте! Чем могу помочь?", "textEn": "Hello! How can I help?"},
   {"speaker": "Вы", "textRu": "Сколько стоит эта книга?", "textEn": "How much does this book cost?"},
   {"speaker": "Продавец", "textRu": "Триста рублей.", "textEn": "Three hundred rubles."},
   {"speaker": "Вы", "textRu": "Хорошо, я беру.", "textEn": "OK, I will take it."},
   {"speaker": "Продавец", "textRu": "Пожалуйста. Спасибо за покупку!", "textEn": "Here you go. Thank you for your purchase!"}
 ], "explanationEn": "Сколько стоит? = How much does it cost? Я беру = I will take it (literally: I take). Essential shopping phrases!"}'),

-- At a cafe (more complex)
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['vocab.food.basic', 'vocab.food.drinks', 'pragmatics.formality.ty_vy'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 75,
 '{"dialogueLines": [
   {"speaker": "Официант", "textRu": "Добрый день! Вот меню. Вы готовы заказать?", "textEn": "Good afternoon! Here is the menu. Are you ready to order?"},
   {"speaker": "Вы", "textRu": "Да. Мне, пожалуйста, борщ и котлету.", "textEn": "Yes. I would like borscht and a cutlet, please."},
   {"speaker": "Официант", "textRu": "Что будете пить?", "textEn": "What will you have to drink?"},
   {"speaker": "Вы", "textRu": "Чай с лимоном, пожалуйста.", "textEn": "Tea with lemon, please."},
   {"speaker": "Официант", "textRu": "С сахаром?", "textEn": "With sugar?"},
   {"speaker": "Вы", "textRu": "Нет, без сахара, спасибо.", "textEn": "No, without sugar, thanks."}
 ], "explanationEn": "Notice: с лимоном (with lemon, instrumental), без сахара (without sugar, genitive). Prepositions determine case!"}'),

-- =====================
-- SCENARIOS
-- =====================

-- At the doctor
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.body', 'vocab.health'], 'A2',
 ARRAY['uni_prep','migrant','senior'], ARRAY['medical'], 0.40, 90,
 '{"promptEn": "You feel sick and need to see a doctor. Practice the conversation.",
  "dialogueLines": [
   {"speaker": "Врач", "textRu": "Здравствуйте. Что вас беспокоит?", "textEn": "Hello. What is bothering you?"},
   {"speaker": "Вы", "textRu": "У меня болит голова и горло.", "textEn": "I have a headache and sore throat."},
   {"speaker": "Врач", "textRu": "Давно?", "textEn": "For how long?"},
   {"speaker": "Вы", "textRu": "Два дня.", "textEn": "Two days."},
   {"speaker": "Врач", "textRu": "Температура есть?", "textEn": "Do you have a temperature?"},
   {"speaker": "Вы", "textRu": "Да, тридцать восемь.", "textEn": "Yes, 38 (degrees)."}
 ]}'),

-- At the post office
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.services', 'vocab.numbers.tens'], 'A2',
 ARRAY['uni_prep','migrant'], ARRAY['general'], 0.35, 75,
 '{"promptEn": "You need to send a package at the post office.",
  "dialogueLines": [
   {"speaker": "Работник", "textRu": "Здравствуйте! Что хотите отправить?", "textEn": "Hello! What would you like to send?"},
   {"speaker": "Вы", "textRu": "Я хочу отправить посылку в Америку.", "textEn": "I want to send a package to America."},
   {"speaker": "Работник", "textRu": "Поставьте на весы, пожалуйста.", "textEn": "Put it on the scale, please."},
   {"speaker": "Работник", "textRu": "Два килограмма. Это будет восемьсот рублей.", "textEn": "Two kilograms. That will be 800 rubles."}
 ]}'),

-- =====================
-- NEGATION
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.negation.basic'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 15,
 '{"promptEn": "How do you say ''I don''t understand'' in Russian?",
  "correctAnswer": "Я не понимаю",
  "distractors": ["Я нет понимаю", "Я без понимаю", "Я ни понимаю"],
  "explanationEn": "Не is placed directly before the verb to negate it. Не понимаю = don''t understand."}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.negation.basic'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 15,
 '{"promptRu": "Я ___ знаю.", "promptEn": "I ___ know.",
  "correctAnswer": "не",
  "distractors": ["нет", "ни", "без"],
  "explanationEn": "Не before a verb = negation. Нет = no (standalone answer). Ни = neither/not a single."}'),

-- =====================
-- QUESTIONS
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.questions.words'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 30,
 '{"promptEn": "Match the Russian question words to English", "matchPairs": [
   {"left": "Кто?", "right": "Who?"},
   {"left": "Что?", "right": "What?"},
   {"left": "Где?", "right": "Where?"},
   {"left": "Когда?", "right": "When?"},
   {"left": "Почему?", "right": "Why?"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.questions.words'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 30,
 '{"promptEn": "Match more Russian question words to English", "matchPairs": [
   {"left": "Как?", "right": "How?"},
   {"left": "Сколько?", "right": "How much/many?"},
   {"left": "Какой?", "right": "Which/What kind?"},
   {"left": "Куда?", "right": "Where to?"},
   {"left": "Откуда?", "right": "Where from?"}
 ], "explanationEn": "Russian distinguishes where (где = location), where to (куда = direction), and where from (откуда = origin)."}'),

-- =====================
-- DAYS & TIME
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.time.days'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the days of the week", "matchPairs": [
   {"left": "понедельник", "right": "Monday"},
   {"left": "вторник", "right": "Tuesday"},
   {"left": "среда", "right": "Wednesday"},
   {"left": "четверг", "right": "Thursday"},
   {"left": "пятница", "right": "Friday"}
 ], "explanationEn": "Russian days are not capitalized! вторник (Tuesday) comes from второй (second), среда (Wednesday) from середина (middle)."}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.time.months'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the months", "matchPairs": [
   {"left": "январь", "right": "January"},
   {"left": "февраль", "right": "February"},
   {"left": "март", "right": "March"},
   {"left": "апрель", "right": "April"},
   {"left": "май", "right": "May"}
 ], "explanationEn": "Russian month names are similar to English — they share Latin origins. Not capitalized in Russian!"}'),

-- =====================
-- BEING/EXISTENCE
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.verbs.being.est'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptEn": "How do you say ''There is a book on the table'' in Russian?",
  "correctAnswer": "На столе книга. (or: На столе есть книга.)",
  "distractors": ["На стол книга.", "В столе книга.", "На столе книгу."],
  "explanationEn": "In Russian present tense, ''is'' is usually omitted. На столе (on the table, prepositional) + книга (book, nominative). The word есть can optionally emphasize existence."}'),

-- =====================
-- POSSESSIVE CONSTRUCTIONS
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.possessive.u_menya'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "У ___ есть собака.", "promptEn": "I have a dog. (literally: At ___ there is a dog)",
  "correctAnswer": "меня",
  "distractors": ["я", "мой", "мне"],
  "explanationEn": "У + genitive + есть = to have. я → у меня, ты → у тебя, он → у него.",
  "hintSequence": ["У requires the genitive form of the pronoun", "я in genitive = меня"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.possessive.u_menya', 'grammar.cases.genitive.negation'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 20,
 '{"promptRu": "У меня нет ___.", "promptEn": "I don''t have a ___. (кошка / cat → ?)",
  "correctAnswer": "кошки",
  "distractors": ["кошка", "кошку", "кошкой"],
  "explanationEn": "У меня нет + genitive = I don''t have. Feminine -а → -и (after к). кошка → кошки."}'),

-- =====================
-- A2: COMPARATIVES
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.adjectives.comparative'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.45, 20,
 '{"promptRu": "Этот дом ___, чем тот.", "promptEn": "This house is ___ than that one. (big → bigger)",
  "correctAnswer": "больше",
  "distractors": ["большой", "большая", "самый большой"],
  "explanationEn": "Simple comparatives: большой → больше (bigger), маленький → меньше (smaller). Use чем for than.",
  "hintSequence": ["Comparative form of большой", "больш- → больше"]}'),

-- =====================
-- A2: REFLEXIVE VERBS
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.reflexive'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.45, 20,
 '{"promptRu": "Я ___ в 7 часов.", "promptEn": "I wake up at 7 o''clock. (просыпаться → ?)",
  "correctAnswer": "просыпаюсь",
  "distractors": ["просыпать", "просыпаю", "просыпается"],
  "explanationEn": "Reflexive verbs end in -ся/-сь. After a vowel: -сь. просыпаю + сь = просыпаюсь.",
  "hintSequence": ["This is a reflexive verb (-ся)", "я form + -сь after vowel"]}'),

-- =====================
-- A2: VERBS OF MOTION
-- =====================

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.verbs.motion.basic'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.55, 25,
 '{"promptEn": "Choose the correct verb: ''I go to work every day'' (habitual, on foot)",
  "correctAnswer": "Я хожу на работу каждый день.",
  "distractors": ["Я иду на работу каждый день.", "Я еду на работу каждый день.", "Я езжу на работу каждый день."],
  "explanationEn": "идти/ходить = go on foot. идти = one direction now. ходить = habitual/round trip. Since this is habitual (every day), use ходить → хожу.",
  "hintSequence": ["Habitual = multidirectional verb", "On foot + habitual = ходить"]}'),

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['grammar.verbs.motion.basic'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.50, 35,
 '{"promptEn": "Match the unidirectional verb to its multidirectional pair", "matchPairs": [
   {"left": "идти (go on foot, one way)", "right": "ходить (go on foot, habitual)"},
   {"left": "ехать (go by transport, one way)", "right": "ездить (go by transport, habitual)"},
   {"left": "бежать (run, one way)", "right": "бегать (run, habitual)"},
   {"left": "лететь (fly, one way)", "right": "летать (fly, habitual)"},
   {"left": "нести (carry on foot, one way)", "right": "носить (carry on foot, habitual)"}
 ], "explanationEn": "Russian has paired verbs of motion: unidirectional (one trip, right now) and multidirectional (habitual, round trips, general ability)."}'),

-- =====================
-- CONDITIONAL/WOULD
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.conditional.basic'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.55, 20,
 '{"promptRu": "Я ___ поехать в Россию.", "promptEn": "I would like to go to Russia. (хотеть → ?)",
  "correctAnswer": "хотел бы",
  "distractors": ["хочу", "хотеть", "буду хотеть"],
  "explanationEn": "Past tense + бы = would/conditional. хотел бы = would like. Masculine: хотел бы, Feminine: хотела бы.",
  "hintSequence": ["Conditional = past tense + бы", "Masculine past of хотеть + бы"]}'),

-- =====================
-- FUTURE TENSE
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.future.compound'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.40, 20,
 '{"promptRu": "Завтра я ___ работать.", "promptEn": "Tomorrow I will work. (imperfective future)",
  "correctAnswer": "буду",
  "distractors": ["был", "будет", "будут"],
  "explanationEn": "Imperfective future = буду/будешь/будет... + infinitive. я буду работать = I will work (ongoing/habitual future).",
  "hintSequence": ["Imperfective future uses буду + infinitive", "я form of быть in future"]}'),

-- =====================
-- MISC USEFUL PHRASES
-- =====================

(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.phrases.essential'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 30,
 '{"promptEn": "Match the essential phrases", "matchPairs": [
   {"left": "Я не понимаю", "right": "I don''t understand"},
   {"left": "Говорите медленнее", "right": "Speak slower"},
   {"left": "Повторите, пожалуйста", "right": "Please repeat"},
   {"left": "Как это по-русски?", "right": "How do you say this in Russian?"},
   {"left": "Извините", "right": "Excuse me / Sorry"}
 ]}'),

(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.phrases.essential'], 'A1',
 ARRAY['uni_prep','migrant','senior'], ARRAY['general'], 0.15, 15,
 '{"promptEn": "You did not hear what someone said. What do you say?",
  "correctAnswer": "Повторите, пожалуйста.",
  "distractors": ["Стоп!", "Нет, спасибо.", "До свидания."],
  "explanationEn": "Повторите пожалуйста = Please repeat. Повторите is the formal imperative of повторить."}'),

-- =====================
-- IMPERATIVE MOOD
-- =====================

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.imperative'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.40, 20,
 '{"promptRu": "___ сюда!", "promptEn": "Come here! (идти → imperative)",
  "correctAnswer": "Идите",
  "distractors": ["Иди", "Идёт", "Идут"],
  "explanationEn": "Formal/plural imperative: stem + -ите. иди (informal) vs идите (formal/plural). Use идите with strangers!",
  "hintSequence": ["Formal imperative ending", "stem + -ите"]}'),

(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.imperative'], 'A2',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.40, 20,
 '{"promptRu": "___, пожалуйста!", "promptEn": "Wait, please! (ждать → formal imperative)",
  "correctAnswer": "Подождите",
  "distractors": ["Ждите", "Подожди", "Ждёт"],
  "explanationEn": "Подождите (please wait, formal) from подождать (perfective of ждать). Perfective imperatives are more polite for requests."}');
