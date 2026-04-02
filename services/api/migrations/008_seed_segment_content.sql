-- Migration 008: Segment-differentiated content atoms
-- Adds 44 content atoms specifically targeted to individual learner segments:
--   Teen (10), Migrant (12), University Prep (10), Kid (12)

-- =====================
-- TEEN SEGMENT
-- =====================

INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data, quality_score) VALUES

-- Teen 1: Russian internet slang — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings'], 'A1',
 ARRAY['teen'], ARRAY['internet','slang'], 0.20, 15,
 '{"promptEn": "Your Russian friend texts you \"Прив, чё делаешь?\". What does it mean?",
  "correctAnswer": "Hey, what are you doing?",
  "distractors": ["Hello, where are you?", "Hi, are you coming?", "Hey, what did you eat?"],
  "explanationEn": "Прив is a texting shortcut for Привет (hi). Чё is slang for что (what). Делаешь = are you doing. Very common in Russian texting!",
  "hintSequence": ["Прив is short for a greeting", "Чё = что (what)"]}',
 0.82),

-- Teen 2: Meme culture — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings','script.cyrillic.cognates'], 'A1',
 ARRAY['teen'], ARRAY['internet','memes'], 0.25, 20,
 '{"promptEn": "In Russian meme culture, what does \"лол\" (lol) stand for?",
  "correctAnswer": "It is borrowed from English LOL — laughing out loud",
  "distractors": ["It means \"fool\" in Russian", "It is the name of a popular game", "It means \"love\" in texting slang"],
  "explanationEn": "Russians borrow many internet terms from English and write them in Cyrillic. лол = LOL, рофл = ROFL, кек = kek. This is called транслит.",
  "hintSequence": ["Sound it out in Cyrillic: л=L, о=O, л=L", "It means the same thing as in English"]}',
 0.78),

-- Teen 3: Social media vocabulary — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.greetings','script.cyrillic.cognates'], 'A1',
 ARRAY['teen'], ARRAY['internet','social_media'], 0.20, 15,
 '{"promptRu": "Подпишись на мой канал!", "promptEn": "Translate to English:",
  "correctAnswer": "Subscribe to my channel!",
  "distractors": ["Follow my friend!", "Watch my video!", "Like my post!"],
  "explanationEn": "Подпишись = subscribe (imperative). Канал = channel. You hear this constantly on Russian YouTube and Telegram."}',
 0.85),

-- Teen 4: Gaming terminology — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings','script.cyrillic.false_friends'], 'A1',
 ARRAY['teen'], ARRAY['gaming'], 0.25, 15,
 '{"promptEn": "A Russian gamer says \"ГГ, хорошо играл!\". What does ГГ mean?",
  "correctAnswer": "GG — good game",
  "distractors": ["Go go — hurry up", "Гуляй-гуляй — take a walk", "Готов-готов — ready ready"],
  "explanationEn": "ГГ is the Cyrillic spelling of GG (good game). Russian gamers use tons of English gaming terms written in Cyrillic: скилл (skill), нуб (noob), баг (bug).",
  "hintSequence": ["Sound out Г=G, Г=G", "It is said at the end of a match"]}',
 0.80),

-- Teen 5: Informal conversational — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.nominative'], 'A1',
 ARRAY['teen'], ARRAY['informal','conversation'], 0.30, 20,
 '{"promptRu": "Это мой лучший ___. Мы вместе играем в игры.", "promptEn": "This is my best ___. We play games together.",
  "correctAnswer": "друг",
  "distractors": ["друга", "другу", "другом"],
  "explanationEn": "After мой лучший, we need nominative case (the subject). Друг = friend (male). No ending change needed in nominative.",
  "hintSequence": ["The word is the subject of the sentence", "Nominative case — no changes needed"]}',
 0.83),

-- Teen 6: Music lyrics — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.greetings'], 'A1',
 ARRAY['teen'], ARRAY['music'], 0.20, 20,
 '{"promptRu": "Я тебя люблю", "promptEn": "This phrase appears in almost every Russian pop song. Translate it:",
  "correctAnswer": "I love you",
  "distractors": ["I miss you", "I need you", "I see you"],
  "explanationEn": "Я = I, тебя = you (accusative), люблю = love. This is the most famous phrase in Russian music. Listen for it in songs by Егор Крид, Мот, or any Russian pop artist."}',
 0.90),

-- Teen 7: Social media — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.nominative','script.cyrillic.cognates'], 'A1',
 ARRAY['teen'], ARRAY['social_media'], 0.25, 15,
 '{"promptRu": "Новый ___ набрал миллион просмотров!", "promptEn": "The new ___ got a million views!",
  "correctAnswer": "клип",
  "distractors": ["клипа", "клипу", "клипом"],
  "explanationEn": "Клип = music video/clip (borrowed from English). In nominative case as the subject. Просмотры = views. Миллион = million (cognate!).",
  "hintSequence": ["The word is the subject — use nominative", "It sounds like the English word clip"]}',
 0.81),

-- Teen 8: Texting slang — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings'], 'A1',
 ARRAY['teen'], ARRAY['internet','texting'], 0.20, 15,
 '{"promptEn": "Your Russian friend sends you \"спс\" in a text message. What does it mean?",
  "correctAnswer": "Thanks (short for спасибо)",
  "distractors": ["See you later", "I am sleeping", "Help me"],
  "explanationEn": "спс = спасибо (thanks). Russians love abbreviating in texts: пжл = пожалуйста (please), нзч = не за что (you are welcome), лан = ладно (okay).",
  "hintSequence": ["It is an abbreviation of a very common word", "с-п-с — think спа..."]}',
 0.84),

-- Teen 9: Music — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.nominative'], 'A1',
 ARRAY['teen'], ARRAY['music'], 0.30, 20,
 '{"promptRu": "Моя любимая ___ — это \"Кукла\" от Мота.", "promptEn": "My favorite ___ is \"Kukla\" by Mot.",
  "correctAnswer": "песня",
  "distractors": ["песни", "песню", "песней"],
  "explanationEn": "Песня = song. It is feminine and in nominative here as the subject. Мот is a popular Russian rapper.",
  "hintSequence": ["Subject of the sentence = nominative case", "Feminine noun ending in -я, no change in nominative"]}',
 0.79),

-- Teen 10: Internet culture — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['teen'], ARRAY['internet'], 0.15, 15,
 '{"promptRu": "Это фейк!", "promptEn": "Translate this common internet expression:",
  "correctAnswer": "This is fake!",
  "distractors": ["This is fun!", "This is fast!", "This is fine!"],
  "explanationEn": "Фейк is borrowed from English \"fake\". Russian internet culture borrows heavily from English: хайп (hype), кринж (cringe), вайб (vibe), контент (content)."}',
 0.86);


-- =====================
-- MIGRANT SEGMENT
-- =====================

INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data, quality_score) VALUES

-- Migrant 1: At the doctor's office — scenario
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.greetings','pragmatics.formality.ty_vy'], 'A1',
 ARRAY['migrant'], ARRAY['healthcare'], 0.35, 90,
 '{"promptEn": "You are at a doctor''s office. You have a headache and need to explain your symptoms.",
  "dialogueLines": [
   {"speaker": "Врач", "textRu": "Здравствуйте. На что жалуетесь?", "textEn": "Hello. What are your complaints?"},
   {"speaker": "Вы", "textRu": "Здравствуйте. У меня болит голова.", "textEn": "Hello. I have a headache."},
   {"speaker": "Врач", "textRu": "Давно болит?", "textEn": "Has it been hurting long?"},
   {"speaker": "Вы", "textRu": "Два дня.", "textEn": "Two days."},
   {"speaker": "Врач", "textRu": "Температура есть?", "textEn": "Do you have a temperature?"},
   {"speaker": "Вы", "textRu": "Нет, температуры нет.", "textEn": "No, no temperature."},
   {"speaker": "Врач", "textRu": "Хорошо. Я выпишу вам лекарство.", "textEn": "Okay. I will prescribe you medicine."}
  ],
  "explanationEn": "Key phrases: У меня болит... (I have a pain in...), жалуетесь (complaints), температура (temperature), лекарство (medicine). Always use Вы with doctors."}',
 0.88),

-- Migrant 2: Government forms — scenario
(uuid_generate_v4(), 'scenario', NULL, ARRAY['pragmatics.formality.ty_vy','vocab.greetings'], 'A1',
 ARRAY['migrant'], ARRAY['bureaucracy'], 0.40, 90,
 '{"promptEn": "You need to fill out a registration form at a government office (МФЦ).",
  "dialogueLines": [
   {"speaker": "Сотрудник", "textRu": "Здравствуйте. Ваш паспорт, пожалуйста.", "textEn": "Hello. Your passport, please."},
   {"speaker": "Вы", "textRu": "Вот, пожалуйста.", "textEn": "Here you go."},
   {"speaker": "Сотрудник", "textRu": "Ваша фамилия?", "textEn": "Your surname?"},
   {"speaker": "Вы", "textRu": "Моя фамилия — Карими.", "textEn": "My surname is Karimi."},
   {"speaker": "Сотрудник", "textRu": "Адрес проживания?", "textEn": "Residential address?"},
   {"speaker": "Вы", "textRu": "Улица Ленина, дом пять, квартира двенадцать.", "textEn": "Lenin Street, building 5, apartment 12."},
   {"speaker": "Сотрудник", "textRu": "Хорошо. Подпишите здесь.", "textEn": "Okay. Sign here."}
  ],
  "explanationEn": "Key words: паспорт (passport), фамилия (surname), адрес (address), улица (street), дом (building), квартира (apartment), подпишите (sign). МФЦ = Multi-Function Center, the main government services office."}',
 0.87),

-- Migrant 3: Workplace instructions — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.greetings','grammar.cases.accusative'], 'A1',
 ARRAY['migrant'], ARRAY['workplace'], 0.30, 20,
 '{"promptRu": "Наденьте каску и перчатки.", "promptEn": "Translate this workplace instruction:",
  "correctAnswer": "Put on a hard hat and gloves.",
  "distractors": ["Take off your jacket.", "Open the door.", "Clean the table."],
  "explanationEn": "Наденьте = put on (formal imperative). Каска = hard hat/helmet. Перчатки = gloves. These are common safety instructions at work sites."}',
 0.85),

-- Migrant 4: Asking for help in store — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.food.basic','grammar.cases.accusative'], 'A1',
 ARRAY['migrant'], ARRAY['shopping'], 0.25, 15,
 '{"promptRu": "Скажите, пожалуйста, где ___ ?", "promptEn": "Tell me, please, where is the ___ ? (молоко)",
  "correctAnswer": "молоко",
  "distractors": ["молока", "молоку", "молоком"],
  "explanationEn": "After где (where), the noun stays in nominative case. Молоко = milk (neuter, no change). Скажите пожалуйста is a polite way to ask for help.",
  "hintSequence": ["Где asks about location — no case change needed", "Молоко is neuter — it stays the same in nominative"]}',
 0.83),

-- Migrant 5: Talking to child's teacher — dialogue
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['pragmatics.formality.ty_vy','vocab.greetings'], 'A1',
 ARRAY['migrant'], ARRAY['education','family'], 0.35, 60,
 '{"dialogueLines": [
   {"speaker": "Вы", "textRu": "Здравствуйте! Я мама Амира.", "textEn": "Hello! I am Amir''s mother."},
   {"speaker": "Учитель", "textRu": "Здравствуйте! Очень приятно. Как дела у Амира дома?", "textEn": "Hello! Nice to meet you. How is Amir doing at home?"},
   {"speaker": "Вы", "textRu": "Хорошо, спасибо. Как он учится?", "textEn": "Well, thanks. How is he doing in school?"},
   {"speaker": "Учитель", "textRu": "Он старается. Но ему нужно больше читать.", "textEn": "He is trying. But he needs to read more."},
   {"speaker": "Вы", "textRu": "Понятно. Спасибо большое.", "textEn": "I understand. Thank you very much."}
  ],
  "explanationEn": "Always use Вы with teachers. Key phrases: Как дела (how are things), как он учится (how is he studying), старается (is trying), нужно (needs to), читать (read)."}',
 0.86),

-- Migrant 6: At pharmacy — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.greetings','grammar.cases.accusative'], 'A1',
 ARRAY['migrant'], ARRAY['healthcare'], 0.30, 15,
 '{"promptRu": "Дайте, пожалуйста, ___ от головной боли.", "promptEn": "Please give me ___ for a headache. (таблетки)",
  "correctAnswer": "таблетки",
  "distractors": ["таблеток", "таблеткам", "таблетками"],
  "explanationEn": "Дайте = give (formal/polite imperative). Таблетки = pills/tablets (accusative plural, same as nominative for inanimate). От головной боли = for a headache.",
  "hintSequence": ["After дайте we need accusative case", "For inanimate nouns, accusative plural = nominative plural"]}',
 0.82),

-- Migrant 7: Bus/transport — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.transport'], 'A1',
 ARRAY['migrant'], ARRAY['transport'], 0.20, 15,
 '{"promptRu": "Этот автобус идёт до центра?", "promptEn": "Translate:",
  "correctAnswer": "Does this bus go to the center?",
  "distractors": ["Where is the bus stop?", "When does the bus arrive?", "How much is the ticket?"],
  "explanationEn": "Этот = this. Автобус = bus. Идёт до = goes to. Центр = center. Essential phrase for daily commuting."}',
 0.84),

-- Migrant 8: Asking directions — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.directions'], 'A1',
 ARRAY['migrant'], ARRAY['navigation'], 0.25, 15,
 '{"promptRu": "Извините, как пройти до ___?", "promptEn": "Excuse me, how do I get to the ___? (аптека → genitive)",
  "correctAnswer": "аптеки",
  "distractors": ["аптека", "аптеку", "аптекой"],
  "explanationEn": "До requires genitive case. Аптека (pharmacy) → аптеки in genitive. Как пройти до... is the standard way to ask walking directions.",
  "hintSequence": ["До always takes genitive case", "Feminine -а changes to -и in genitive"]}',
 0.83),

-- Migrant 9: Workplace — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.greetings','pragmatics.formality.ty_vy'], 'A1',
 ARRAY['migrant'], ARRAY['workplace'], 0.25, 15,
 '{"promptRu": "Во сколько начинается смена?", "promptEn": "Translate this workplace question:",
  "correctAnswer": "What time does the shift start?",
  "distractors": ["Where is my workplace?", "Who is the manager?", "When is the break?"],
  "explanationEn": "Во сколько = at what time. Начинается = starts. Смена = shift. Essential for any workplace."}',
 0.81),

-- Migrant 10: Emergency — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.greetings'], 'A1',
 ARRAY['migrant'], ARRAY['emergency'], 0.15, 10,
 '{"promptEn": "What number do you call for emergencies in Russia?",
  "correctAnswer": "112 (единая служба спасения)",
  "distractors": ["911", "999", "100"],
  "explanationEn": "112 is the universal emergency number in Russia. You can also call 103 for ambulance (скорая помощь), 101 for fire (пожарная), 102 for police (полиция)."}',
 0.90),

-- Migrant 11: Shopping — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.food.basic'], 'A1',
 ARRAY['migrant'], ARRAY['shopping'], 0.15, 10,
 '{"promptRu": "Сколько стоит?", "promptEn": "Translate:",
  "correctAnswer": "How much does it cost?",
  "distractors": ["Where is the exit?", "Do you have change?", "Is the store open?"],
  "explanationEn": "Сколько = how much. Стоит = costs. The most important phrase for shopping. You can point at any item and ask Сколько стоит?"}',
 0.90),

-- Migrant 12: Housing — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.greetings','grammar.cases.accusative'], 'A1',
 ARRAY['migrant'], ARRAY['housing'], 0.30, 15,
 '{"promptRu": "Я хочу снять ___ .", "promptEn": "I want to rent an ___. (квартира → accusative)",
  "correctAnswer": "квартиру",
  "distractors": ["квартира", "квартиры", "квартирой"],
  "explanationEn": "Снять = to rent. Квартира (apartment) → квартиру in accusative after хочу снять. Feminine -а → -у in accusative.",
  "hintSequence": ["After хочу + verb, the object takes accusative", "Feminine nouns: -а → -у in accusative"]}',
 0.84);


-- =====================
-- UNIVERSITY PREP SEGMENT
-- =====================

INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data, quality_score) VALUES

-- UniPrep 1: Academic vocabulary — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['pragmatics.formality.ty_vy'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.35, 20,
 '{"promptEn": "How would you address a professor in an email opening?",
  "correctAnswer": "Уважаемый профессор Иванов!",
  "distractors": ["Привет, профессор!", "Здорово, Иванов!", "Эй, препод!"],
  "explanationEn": "Уважаемый = respected/dear (formal). This is the standard way to begin a formal email or letter in Russian. Never use Привет or informal greetings with professors.",
  "hintSequence": ["You need the most formal option", "Уважаемый is the formal salutation"]}',
 0.87),

-- UniPrep 2: Formal letter — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['pragmatics.formality.ty_vy','grammar.verbs.present'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic','writing'], 0.40, 25,
 '{"promptRu": "Уважаемый декан! ___ к Вам с просьбой.", "promptEn": "Dear Dean! I ___ to you with a request. (обращаться → я)",
  "correctAnswer": "Обращаюсь",
  "distractors": ["Обращаться", "Обращается", "Обращаются"],
  "explanationEn": "Обращаюсь = I am addressing/turning to (first person present). This is a formal phrase used to begin official requests. Note the capital В in Вам — showing respect.",
  "hintSequence": ["You need the я-form of the verb", "First conjugation: -ать → -аюсь for reflexive verbs"]}',
 0.85),

-- UniPrep 3: Academic reading — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.genitive'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic','reading'], 0.35, 25,
 '{"promptEn": "Read: \"Расписание занятий висит на доске.\" What does расписание занятий mean?",
  "correctAnswer": "Class schedule",
  "distractors": ["Homework assignment", "Exam results", "Library hours"],
  "explanationEn": "Расписание = schedule/timetable. Занятий = of classes (genitive plural of занятие). Висит на доске = hangs on the board. Essential university vocabulary.",
  "hintSequence": ["Расписание relates to time and planning", "Занятие = class/lesson"]}',
 0.83),

-- UniPrep 4: University vocabulary — matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['pragmatics.formality.ty_vy'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.25, 30,
 '{"promptEn": "Match the university terms to their meanings", "matchPairs": [
   {"left": "лекция", "right": "lecture"},
   {"left": "семинар", "right": "seminar / discussion class"},
   {"left": "зачёт", "right": "pass/fail exam"},
   {"left": "экзамен", "right": "graded exam"},
   {"left": "реферат", "right": "term paper / essay"}
  ],
  "explanationEn": "Russian universities distinguish between лекции (professor talks) and семинары (students discuss). Зачёт is pass/fail, экзамен is graded. Реферат is a research essay."}',
 0.88),

-- UniPrep 5: Genitive case with negation — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.genitive'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.40, 20,
 '{"promptRu": "У меня нет ___.", "promptEn": "I do not have a ___. (учебник → genitive)",
  "correctAnswer": "учебника",
  "distractors": ["учебник", "учебнику", "учебником"],
  "explanationEn": "After нет, we always use genitive case. Учебник (textbook) → учебника in genitive. Masculine nouns ending in a consonant add -а.",
  "hintSequence": ["Нет always requires genitive case", "Masculine consonant-ending nouns: add -а in genitive"]}',
 0.84),

-- UniPrep 6: Present tense conjugation — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.verbs.present'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.30, 20,
 '{"promptRu": "Студенты ___ лекцию профессора.", "promptEn": "The students ___ the professor''s lecture. (слушать → они)",
  "correctAnswer": "слушают",
  "distractors": ["слушать", "слушает", "слушаю"],
  "explanationEn": "Слушать (to listen) is first conjugation. For они (they): remove -ть, add -ют. Слуша + ют = слушают.",
  "hintSequence": ["You need the они-form", "First conjugation они-ending is -ют"]}',
 0.82),

-- UniPrep 7: Academic dialogue — dialogue
(uuid_generate_v4(), 'dialogue', NULL, ARRAY['pragmatics.formality.ty_vy','vocab.greetings'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.30, 60,
 '{"dialogueLines": [
   {"speaker": "Студент", "textRu": "Здравствуйте! Можно задать вопрос?", "textEn": "Hello! May I ask a question?"},
   {"speaker": "Профессор", "textRu": "Конечно, пожалуйста.", "textEn": "Of course, please."},
   {"speaker": "Студент", "textRu": "Когда нужно сдать реферат?", "textEn": "When is the essay due?"},
   {"speaker": "Профессор", "textRu": "До пятницы. Отправьте мне на почту.", "textEn": "By Friday. Send it to me by email."},
   {"speaker": "Студент", "textRu": "Спасибо большое!", "textEn": "Thank you very much!"}
  ],
  "explanationEn": "Key phrases: Можно задать вопрос? (May I ask a question?), сдать реферат (submit an essay), до пятницы (by Friday), отправьте на почту (send by email). Always use Вы with professors."}',
 0.86),

-- UniPrep 8: Reading comprehension — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['grammar.cases.genitive','grammar.verbs.present'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic','reading'], 0.35, 30,
 '{"promptEn": "Read: \"Библиотека работает с девяти до шести.\" When does the library close?",
  "correctAnswer": "At six o''clock",
  "distractors": ["At nine o''clock", "At five o''clock", "It does not say"],
  "explanationEn": "Библиотека = library. Работает = works/operates. С девяти до шести = from nine to six. С + genitive (от), до + genitive (шести). Numbers in genitive: шесть → шести.",
  "hintSequence": ["До means until/to", "Шести is the genitive of шесть (six)"]}',
 0.84),

-- UniPrep 9: Formal writing — translation
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['pragmatics.formality.ty_vy'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic','writing'], 0.35, 20,
 '{"promptRu": "С уважением, Анна Петрова", "promptEn": "This is a common way to end a formal letter. Translate:",
  "correctAnswer": "With respect / Sincerely, Anna Petrova",
  "distractors": ["Goodbye, Anna Petrova", "Hello, Anna Petrova", "Thanks, Anna Petrova"],
  "explanationEn": "С уважением = with respect / sincerely. This is the standard formal letter closing in Russian, equivalent to Sincerely or Best regards."}',
 0.88),

-- UniPrep 10: Academic genitive — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['grammar.cases.genitive'], 'A1',
 ARRAY['uni_prep'], ARRAY['academic'], 0.35, 20,
 '{"promptRu": "Кафедра русского ___.", "promptEn": "Department of Russian ___. (язык → genitive)",
  "correctAnswer": "языка",
  "distractors": ["язык", "языку", "языком"],
  "explanationEn": "Кафедра (department) + genitive. Русского языка = of the Russian language. Язык → языка in genitive (masculine, add -а).",
  "hintSequence": ["After кафедра we need genitive — of what?", "Masculine nouns add -а in genitive"]}',
 0.82);


-- =====================
-- KID SEGMENT
-- =====================

INSERT INTO content_atoms (id, content_type, exercise_type, target_skills, cefr_level, segment_tags, domain_tags, difficulty, estimated_time, content_data, quality_score) VALUES

-- Kid 1: Animal matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.colors','script.cyrillic.cognates'], 'A1',
 ARRAY['kid'], ARRAY['animals','fun'], 0.10, 30,
 '{"promptEn": "Match each animal to its Russian name!", "matchPairs": [
   {"left": "Cat", "right": "Кот"},
   {"left": "Dog", "right": "Собака"},
   {"left": "Fish", "right": "Рыба"},
   {"left": "Bird", "right": "Птица"},
   {"left": "Bear", "right": "Медведь"}
  ],
  "explanationEn": "Медведь (bear) literally means honey-eater! Кот is a boy cat, Кошка is a girl cat."}',
 0.88),

-- Kid 2: Colors matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.colors'], 'A1',
 ARRAY['kid'], ARRAY['colors','fun'], 0.10, 30,
 '{"promptEn": "Match each color to its Russian word!", "matchPairs": [
   {"left": "Red", "right": "Красный"},
   {"left": "Blue", "right": "Синий"},
   {"left": "Green", "right": "Зелёный"},
   {"left": "Yellow", "right": "Жёлтый"},
   {"left": "White", "right": "Белый"}
  ],
  "explanationEn": "Fun fact: Красный (red) comes from the old Russian word for beautiful! Красная площадь (Red Square) actually means Beautiful Square."}',
 0.90),

-- Kid 3: Family vocabulary — matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.family'], 'A1',
 ARRAY['kid'], ARRAY['family','fun'], 0.10, 30,
 '{"promptEn": "Match each family member to their Russian name!", "matchPairs": [
   {"left": "Mom", "right": "Мама"},
   {"left": "Dad", "right": "Папа"},
   {"left": "Sister", "right": "Сестра"},
   {"left": "Brother", "right": "Брат"},
   {"left": "Grandma", "right": "Бабушка"}
  ],
  "explanationEn": "Мама and Папа sound just like in English! Бабушка is so famous that English speakers use it too. You might also hear Деда or Дедушка for Grandpa."}',
 0.90),

-- Kid 4: Number matching game
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['vocab.numbers.1_20'], 'A1',
 ARRAY['kid'], ARRAY['numbers','fun'], 0.10, 30,
 '{"promptEn": "How many items do you see? Match the number!", "matchPairs": [
   {"left": "One star", "right": "Одна звезда"},
   {"left": "Two hearts", "right": "Два сердца"},
   {"left": "Three trees", "right": "Три дерева"},
   {"left": "Four cats", "right": "Четыре кота"},
   {"left": "Five flowers", "right": "Пять цветов"}
  ],
  "explanationEn": "Notice how the noun changes after different numbers! After 2-4 we use a special form, and after 5+ we use another. Do not worry about this yet — just learn the numbers!"}',
 0.85),

-- Kid 5: Story scenario — The Magic Forest
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.colors','vocab.family'], 'A1',
 ARRAY['kid'], ARRAY['story','adventure'], 0.15, 60,
 '{"promptEn": "Help Mishka the Bear find his way through the Magic Forest!",
  "dialogueLines": [
   {"speaker": "Narrator", "textRu": "Мишка идёт в лес.", "textEn": "Mishka the Bear goes into the forest."},
   {"speaker": "Мишка", "textRu": "Ой! Кто ты?", "textEn": "Oh! Who are you?"},
   {"speaker": "Лиса", "textRu": "Привет! Я лиса. Меня зовут Алиса.", "textEn": "Hi! I am a fox. My name is Alisa."},
   {"speaker": "Мишка", "textRu": "Привет, Алиса! Где мой дом?", "textEn": "Hi, Alisa! Where is my home?"},
   {"speaker": "Лиса", "textRu": "Иди прямо и потом налево!", "textEn": "Go straight and then left!"},
   {"speaker": "Мишка", "textRu": "Спасибо, Алиса!", "textEn": "Thanks, Alisa!"}
  ],
  "explanationEn": "Мишка = Mishka (cute name for a bear). Лиса = fox. Лес = forest. Дом = home. Прямо = straight. Налево = left. Направо = right."}',
 0.88),

-- Kid 6: Animal sounds — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid'], ARRAY['animals','fun'], 0.10, 15,
 '{"promptEn": "In Russia, a cat says \"мяу\". What does a dog say?",
  "correctAnswer": "Гав-гав!",
  "distractors": ["Мяу-мяу!", "Кря-кря!", "Му-му!"],
  "explanationEn": "Russian animal sounds are different from English! Dog = Гав-гав (not woof). Cat = Мяу. Duck = Кря-кря. Cow = Му-му. Rooster = Ку-ка-ре-ку!",
  "hintSequence": ["It is NOT мяу — that is a cat!", "Think of a barking sound starting with Г"]}',
 0.87),

-- Kid 7: Colors — multiple choice
(uuid_generate_v4(), 'exercise', 'multiple_choice', ARRAY['vocab.colors'], 'A1',
 ARRAY['kid'], ARRAY['colors','fun'], 0.15, 15,
 '{"promptEn": "What color is the sky? Какого цвета небо?",
  "correctAnswer": "Голубое (light blue)",
  "distractors": ["Красное (red)", "Зелёное (green)", "Жёлтое (yellow)"],
  "explanationEn": "Russian has TWO words for blue! Голубой = light blue (like the sky). Синий = dark blue (like the deep sea). English only has one word for both!",
  "hintSequence": ["Think about the color of the sky on a sunny day", "It is a shade of blue — голубой or синий?"]}',
 0.85),

-- Kid 8: Story scenario — Mishka at the market
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.food.basic','vocab.numbers.1_20'], 'A1',
 ARRAY['kid'], ARRAY['story','food'], 0.20, 60,
 '{"promptEn": "Mishka the Bear goes shopping with Mama Bear!",
  "dialogueLines": [
   {"speaker": "Мама", "textRu": "Мишка, нам нужно купить яблоки.", "textEn": "Mishka, we need to buy apples."},
   {"speaker": "Мишка", "textRu": "Сколько яблок, мама?", "textEn": "How many apples, mama?"},
   {"speaker": "Мама", "textRu": "Пять яблок и три банана.", "textEn": "Five apples and three bananas."},
   {"speaker": "Продавец", "textRu": "Здравствуйте! Вот ваши яблоки.", "textEn": "Hello! Here are your apples."},
   {"speaker": "Мишка", "textRu": "Спасибо! А можно ещё мёд?", "textEn": "Thanks! And can I also have honey?"},
   {"speaker": "Мама", "textRu": "Мишка любит мёд!", "textEn": "Mishka loves honey!"}
  ],
  "explanationEn": "Bears love мёд (honey)! Яблоки = apples. Бананы = bananas (sounds like English!). Купить = to buy. Продавец = seller/vendor."}',
 0.87),

-- Kid 9: Simple translation — family
(uuid_generate_v4(), 'exercise', 'translation', ARRAY['vocab.family'], 'A1',
 ARRAY['kid'], ARRAY['family'], 0.10, 15,
 '{"promptRu": "Это моя мама.", "promptEn": "Translate:",
  "correctAnswer": "This is my mom.",
  "distractors": ["This is my dad.", "This is my sister.", "This is my cat."],
  "explanationEn": "Это = this is. Моя = my (feminine, because мама is feminine). For masculine words we say мой: мой папа, мой брат."}',
 0.90),

-- Kid 10: Cyrillic cognates for kids — matching
(uuid_generate_v4(), 'exercise', 'matching', ARRAY['script.cyrillic.cognates'], 'A1',
 ARRAY['kid'], ARRAY['fun','cognates'], 0.10, 25,
 '{"promptEn": "These Russian words sound like English words! Can you match them?", "matchPairs": [
   {"left": "Банан", "right": "Banana"},
   {"left": "Робот", "right": "Robot"},
   {"left": "Пицца", "right": "Pizza"},
   {"left": "Шоколад", "right": "Chocolate"},
   {"left": "Жираф", "right": "Giraffe"}
  ],
  "explanationEn": "Many Russian words are borrowed from other languages and sound almost the same as English! These are called cognates. Sound them out letter by letter!"}',
 0.90),

-- Kid 11: Numbers — fill blank
(uuid_generate_v4(), 'exercise', 'fill_blank', ARRAY['vocab.numbers.1_20'], 'A1',
 ARRAY['kid'], ARRAY['numbers','fun'], 0.15, 15,
 '{"promptRu": "Один, два, ___ , четыре, пять!", "promptEn": "One, two, ___, four, five! What comes next?",
  "correctAnswer": "три",
  "distractors": ["шесть", "десять", "семь"],
  "explanationEn": "Три = three! Let us count together: один (1), два (2), три (3), четыре (4), пять (5). Три sounds a bit like tree!",
  "hintSequence": ["Count: один, два, ???", "It starts with тр..."]}',
 0.88),

-- Kid 12: Story scenario — Mishka makes friends
(uuid_generate_v4(), 'scenario', NULL, ARRAY['vocab.greetings','vocab.family'], 'A1',
 ARRAY['kid'], ARRAY['story','friendship'], 0.15, 60,
 '{"promptEn": "Mishka meets a new friend at the playground!",
  "dialogueLines": [
   {"speaker": "Мишка", "textRu": "Привет! Как тебя зовут?", "textEn": "Hi! What is your name?"},
   {"speaker": "Зайка", "textRu": "Привет! Меня зовут Зайка. А тебя?", "textEn": "Hi! My name is Zayka (Bunny). And yours?"},
   {"speaker": "Мишка", "textRu": "Меня зовут Мишка. Давай играть!", "textEn": "My name is Mishka. Let us play!"},
   {"speaker": "Зайка", "textRu": "Давай! Во что?", "textEn": "Let us! What game?"},
   {"speaker": "Мишка", "textRu": "Давай играть в мяч!", "textEn": "Let us play ball!"},
   {"speaker": "Зайка", "textRu": "Ура! Я люблю мяч!", "textEn": "Yay! I love ball!"}
  ],
  "explanationEn": "Как тебя зовут? = What is your name? Меня зовут... = My name is... Давай играть! = Let us play! Мяч = ball. Зайка = bunny (a common cute name)."}',
 0.89);
