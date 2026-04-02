-- Seed: Sample Content Atoms for A1 level

-- Cyrillic cognate letters exercise
INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data) VALUES
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 30,
 '{"promptEn": "Match the Cyrillic letters to their sounds", "matchPairs": [
   {"left": "М", "right": "M (as in Mother)"},
   {"left": "Т", "right": "T (as in Top)"},
   {"left": "А", "right": "A (as in Father)"},
   {"left": "К", "right": "K (as in Kite)"},
   {"left": "О", "right": "O (as in Or)"}
 ], "explanationEn": "These letters look and sound similar to their English equivalents — great starting point!"}'),

-- Cyrillic false friends exercise
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.false_friends'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.20, 20,
 '{"promptRu": "В", "promptEn": "What sound does this Cyrillic letter make?", "correctAnswer": "V (as in Victory)",
  "distractors": ["B (as in Boy)", "W (as in Win)", "F (as in Fun)"],
  "explanationEn": "В looks like English B but sounds like V. This is a false friend!",
  "hintSequence": ["It looks like an English letter but sounds different", "Think of the word Vodka — Водка"]}'),

-- Greetings vocabulary
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.greetings'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.10, 15,
 '{"promptRu": "Привет!", "promptEn": "Translate to English:", "correctAnswer": "Hello! / Hi!",
  "distractors": ["Goodbye!", "Thank you!", "Please!"],
  "explanationEn": "Привет is the informal greeting, like Hi. Use it with friends and family."}'),

-- Formal vs informal greeting
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['pragmatics.formality.ty_vy', 'vocab.greetings'], 'A1',
 ARRAY['uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptEn": "You are meeting your professor for the first time. How should you greet them?",
  "correctAnswer": "Здравствуйте!",
  "distractors": ["Привет!", "Здорово!", "Эй!"],
  "explanationEn": "Здравствуйте is the formal greeting. Always use it with strangers, elders, and in professional settings.",
  "hintSequence": ["Think about formality — this is a professor", "The formal greeting starts with Здрав..."]}'),

-- Accusative case exercise
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.accusative.fem_singular'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.35, 25,
 '{"promptRu": "Я хочу купить ___ хлеба.", "promptEn": "I want to buy ___ of bread.",
  "correctAnswer": "буханку",
  "distractors": ["буханка", "буханки", "буханкой"],
  "explanationEn": "After купить (to buy), we need accusative case. Feminine nouns ending in -а change to -у.",
  "hintSequence": ["Think about the case after купить", "This is a feminine noun in accusative", "Feminine -а nouns change to -у in accusative"]}'),

-- Numbers exercise
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.numbers.1_20'], 'A1',
 ARRAY['kid','teen','uni_prep','migrant','senior'], ARRAY['general'], 0.15, 30,
 '{"promptEn": "Match the numbers to their Russian words", "matchPairs": [
   {"left": "1", "right": "один"},
   {"left": "2", "right": "два"},
   {"left": "3", "right": "три"},
   {"left": "5", "right": "пять"},
   {"left": "10", "right": "десять"}
 ]}'),

-- Prepositional case - location
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.prepositional.location'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.30, 25,
 '{"promptRu": "Я живу в ___.", "promptEn": "I live in ___. (Москва → ?)",
  "correctAnswer": "Москве",
  "distractors": ["Москва", "Москву", "Москвой"],
  "explanationEn": "After в (in) for location, we use the prepositional case. Москва → Москве (feminine -а → -е).",
  "hintSequence": ["After в for location, which case do we use?", "Feminine -а nouns change to -е in prepositional"]}'),

-- Present tense conjugation
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.present.first_conj'], 'A1',
 ARRAY['teen','uni_prep','migrant','senior'], ARRAY['general'], 0.25, 20,
 '{"promptRu": "Я ___ по-русски.", "promptEn": "I ___ Russian. (говорить → ?)",
  "correctAnswer": "говорю",
  "distractors": ["говорить", "говорит", "говорят"],
  "explanationEn": "Говорить (to speak) is a 2nd conjugation verb. For я: remove -ить, add -ю. говор + ю = говорю.",
  "hintSequence": ["What is the я form?", "Remove -ить and add the я ending"]}'),

-- Dialogue: Ordering food
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['vocab.food.basic', 'pragmatics.formality.ty_vy'], 'A1',
 ARRAY['uni_prep','migrant','senior'], ARRAY['general'], 0.20, 60,
 '{"dialogueLines": [
   {"speaker": "Официант", "textRu": "Здравствуйте! Что будете заказывать?", "textEn": "Hello! What would you like to order?"},
   {"speaker": "Вы", "textRu": "Здравствуйте! Можно, пожалуйста, чай и пирожок?", "textEn": "Hello! Could I have tea and a pastry, please?"},
   {"speaker": "Официант", "textRu": "Конечно. Чай чёрный или зелёный?", "textEn": "Of course. Black or green tea?"},
   {"speaker": "Вы", "textRu": "Чёрный, пожалуйста.", "textEn": "Black, please."},
   {"speaker": "Официант", "textRu": "Хорошо. Одну минутку.", "textEn": "Good. One moment."}
 ], "explanationEn": "Notice the formal Здравствуйте and polite пожалуйста (please). Можно means May I / Could I."}'),

-- Scenario: At the metro
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.transport', 'vocab.directions'], 'A1',
 ARRAY['uni_prep','migrant'], ARRAY['general'], 0.30, 90,
 '{"promptEn": "You need to get to Красная площадь (Red Square). You are at a metro station. Practice asking for directions.",
  "dialogueLines": [
   {"speaker": "Вы", "textRu": "Извините, как доехать до Красной площади?", "textEn": "Excuse me, how do I get to Red Square?"},
   {"speaker": "Прохожий", "textRu": "Вам нужна красная линия. Станция Охотный Ряд.", "textEn": "You need the red line. Okhotny Ryad station."},
   {"speaker": "Вы", "textRu": "Спасибо большое!", "textEn": "Thank you very much!"},
   {"speaker": "Прохожий", "textRu": "Пожалуйста!", "textEn": "You are welcome!"}
 ]}');
