-- Migration 010: Add true-beginner content atoms
-- These exercises require ZERO Russian reading ability.
-- They use visual recognition, sound matching, and Latin transliteration
-- so a complete beginner who has never seen Cyrillic can start learning.

-- ============================================================
-- STAGE 0: Cyrillic Letter Recognition (visual only)
-- The learner sees a Cyrillic letter and picks the sound it makes.
-- All options are in English/Latin script.
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
-- Letters that look like English letters but sound different
(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "Р", "distractors": ["P (as in pet)", "D (as in dog)", "B (as in boy)"], "correctAnswer": "R (as in run)", "explanationEn": "The letter Р looks like English P, but it makes an R sound! This is one of the trickiest false friends in the Cyrillic alphabet."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "Н", "distractors": ["H (as in hat)", "I (as in it)", "U (as in up)"], "correctAnswer": "N (as in no)", "explanationEn": "The letter Н looks like English H, but it makes an N sound! Compare: НЕТ (nyet = no)."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "В", "distractors": ["B (as in boy)", "W (as in win)", "F (as in fun)"], "correctAnswer": "V (as in voice)", "explanationEn": "The letter В looks like English B, but it makes a V sound! Compare: ВОДКА (vodka)."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "С", "distractors": ["K (as in cat)", "G (as in go)", "Sh (as in she)"], "correctAnswer": "S (as in sun)", "explanationEn": "The letter С looks like English C, and it always makes an S sound! Never a K sound like English C sometimes does."}',
 0.2, 0.95),

-- Letters that look AND sound like English
(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "А", "distractors": ["E (as in egg)", "O (as in go)", "U (as in up)"], "correctAnswer": "A (as in father)", "explanationEn": "Good news — А looks like A and sounds like A! It is pronounced like the a in \"father\", never like the a in \"cat\"."}',
 0.1, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "О", "distractors": ["A (as in apple)", "U (as in under)", "E (as in egg)"], "correctAnswer": "O (as in more)", "explanationEn": "О looks and sounds like O! When stressed, it sounds like the o in \"more\". When unstressed, it reduces to an \"ah\" sound."}',
 0.1, 0.95),

-- Uniquely Russian letters
(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "Ж", "distractors": ["Z (as in zoo)", "G (as in go)", "Ch (as in chair)"], "correctAnswer": "Zh (like the s in pleasure)", "explanationEn": "Ж makes the Zh sound — like the s in \"pleasure\" or the g in \"genre\". It looks like a bug, which can help you remember it!"}',
 0.3, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "What sound does this Russian letter make?", "promptRu": "Ш", "distractors": ["S (as in sun)", "Z (as in zoo)", "Ch (as in chair)"], "correctAnswer": "Sh (as in ship)", "explanationEn": "Ш makes the Sh sound — like in \"ship\". It looks like a comb with three teeth pointing up!"}',
 0.3, 0.95);

-- Matching: Cyrillic letter groups to sounds (no reading required)
INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "Match each Russian letter to the sound it makes", "matchPairs": [{"left": "А", "right": "A (ah)"}, {"left": "О", "right": "O (oh)"}, {"left": "М", "right": "M (em)"}, {"left": "К", "right": "K (kah)"}], "explanationEn": "These four letters look and sound similar to their English equivalents. They are the easiest letters to learn!"}',
 0.1, 0.95),

(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "These Russian letters LOOK like English letters but make DIFFERENT sounds. Match them correctly:", "matchPairs": [{"left": "Р", "right": "R sound"}, {"left": "Н", "right": "N sound"}, {"left": "В", "right": "V sound"}, {"left": "С", "right": "S sound"}], "explanationEn": "These are the false-friend letters! They look familiar but sound completely different. Р=R, Н=N, В=V, С=S."}',
 0.25, 0.95),

(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['script.cyrillic.cognates'],
 '{"promptEn": "Match each Russian letter to the sound it makes:", "matchPairs": [{"left": "Д", "right": "D (as in dog)"}, {"left": "Л", "right": "L (as in love)"}, {"left": "П", "right": "P (as in pen)"}, {"left": "Б", "right": "B (as in book)"}], "explanationEn": "These letters look unfamiliar but their sounds are common English consonants."}',
 0.2, 0.95);


-- ============================================================
-- STAGE 1: Reading simple words with transliteration help
-- The learner sees a Russian word WITH pronunciation guide
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['vocab.greetings'],
 '{"promptEn": "The Russian word for \"yes\" is written ДА and pronounced \"da\". How do you say \"no\" in Russian?", "distractors": ["Да (da)", "Ну (nu)", "Ой (oy)"], "correctAnswer": "Нет (nyet)", "explanationEn": "Нет (nyet) means no. These are the two most important words to learn first! Да = yes, Нет = no."}',
 0.15, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['vocab.greetings'],
 '{"promptEn": "Listen to the pronunciation guide. Which greeting is used with friends (informal)?", "distractors": ["Здравствуйте (zdra-stvuy-te) — formal", "До свидания (da-svi-da-ni-ya) — goodbye", "Спасибо (spa-si-ba) — thank you"], "correctAnswer": "Привет (pri-vyet) — informal hi", "explanationEn": "Привет (pri-vyet) is the casual way to say hi to friends. Здравствуйте (zdra-stvuy-te) is the formal version for strangers, teachers, and elders."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['vocab.greetings'],
 '{"promptEn": "Which word means \"thank you\" in Russian?", "distractors": ["Привет (pri-vyet) — hello", "Пожалуйста (pa-zha-luy-sta) — please", "Извините (iz-vi-ni-te) — excuse me"], "correctAnswer": "Спасибо (spa-si-ba)", "explanationEn": "Спасибо (spa-si-ba) means thank you. You will use this word every single day! It comes from the phrase \"Спаси Бог\" (God save you)."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['vocab.greetings'],
 '{"promptEn": "Match each Russian word to its English meaning (pronunciation guides provided):", "matchPairs": [{"left": "Да (da)", "right": "Yes"}, {"left": "Нет (nyet)", "right": "No"}, {"left": "Спасибо (spa-si-ba)", "right": "Thank you"}, {"left": "Пожалуйста (pa-zha-luy-sta)", "right": "Please / You''re welcome"}], "explanationEn": "These are the four most essential Russian words. Memorize them and you can survive basic interactions!"}',
 0.15, 0.95);


-- ============================================================
-- STAGE 2: Numbers (with transliteration)
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['vocab.numbers.1_20'],
 '{"promptEn": "Match the Russian numbers 1-5 to their values (pronunciation in parentheses):", "matchPairs": [{"left": "Один (a-DIN)", "right": "1"}, {"left": "Два (dva)", "right": "2"}, {"left": "Три (tri)", "right": "3"}, {"left": "Четыре (chi-TY-re)", "right": "4"}], "explanationEn": "Russian numbers 1-4. Notice that три (tri) sounds like \"three\" — it shares the same ancient root!"}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['vocab.numbers.1_20'],
 '{"promptEn": "The Russian word \"три\" (tri) sounds very similar to an English number. Which one?", "distractors": ["Two", "Ten", "Twelve"], "correctAnswer": "Three", "explanationEn": "Три (tri) and three come from the same ancient Indo-European root! Many number words are similar across languages."}',
 0.15, 0.95),

(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['vocab.numbers.1_20'],
 '{"promptEn": "Match the Russian numbers 5-10:", "matchPairs": [{"left": "Пять (pyat)", "right": "5"}, {"left": "Шесть (shest)", "right": "6"}, {"left": "Семь (syem)", "right": "7"}, {"left": "Десять (DYE-syat)", "right": "10"}], "explanationEn": "Russian numbers 5-10. Семь (syem) for 7 is related to Latin \"septem\" (September was originally the 7th month)."}',
 0.25, 0.95);


-- ============================================================
-- Phonetics: Vowel sounds (with visual + transliteration)
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['phonetics.vowels.basic'],
 '{"promptEn": "Russian has 10 vowel letters! Match these 5 basic vowels to their sounds:", "matchPairs": [{"left": "А", "right": "ah (as in father)"}, {"left": "О", "right": "oh (as in more)"}, {"left": "У", "right": "oo (as in moon)"}, {"left": "Э", "right": "eh (as in pet)"}, {"left": "И", "right": "ee (as in meet)"}], "explanationEn": "These are the 5 hard vowels. Each has a soft partner: А→Я, О→Ё, У→Ю, Э→Е, И→Ы. The soft vowels add a y-sound before them."}',
 0.2, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['phonetics.vowels.basic'],
 '{"promptEn": "Russian has 10 vowel letters, grouped in 5 pairs. The letter У makes the sound \"oo\" (as in moon). What sound does its soft partner Ю make?", "distractors": ["ah (as in father)", "oh (as in more)", "eh (as in pet)"], "correctAnswer": "yoo (as in you)", "explanationEn": "Ю makes the yoo sound — exactly like the English word \"you\"! Soft vowels add a y-sound: У (oo) → Ю (yoo)."}',
 0.25, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['phonetics.vowels.basic'],
 '{"promptEn": "The Russian letter Я is the last letter of the alphabet. What sound does it make?", "distractors": ["ah (as in father)", "oh (as in more)", "ee (as in meet)"], "correctAnswer": "ya (as in yard)", "explanationEn": "Я makes the ya sound. Fun fact: Я also means \"I\" (me) in Russian! The letter that means ''I'' is placed last in the alphabet — some say this reflects Russian collectivism over individualism."}',
 0.2, 0.95);


-- ============================================================
-- Phonetics: Consonants (beginner-friendly, visual)
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'matching', 'A1',
 ARRAY['phonetics.consonants.voiced_voiceless'],
 '{"promptEn": "Russian consonants come in voiced/voiceless pairs, just like English (b/p, d/t, g/k). Match the Russian pairs:", "matchPairs": [{"left": "Б (b) voiced", "right": "П (p) voiceless"}, {"left": "Д (d) voiced", "right": "Т (t) voiceless"}, {"left": "Г (g) voiced", "right": "К (k) voiceless"}, {"left": "В (v) voiced", "right": "Ф (f) voiceless"}], "explanationEn": "Just like English, Russian consonants pair up: voiced (vocal cords vibrate) and voiceless (they don''t). At the end of a word, voiced consonants become voiceless: Б→П, Д→Т, etc."}',
 0.3, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['phonetics.consonants.kh_sound'],
 '{"promptEn": "The Russian letter Х makes a sound that doesn''t exist in English. Which description is closest?", "distractors": ["Like English H in \"hat\"", "Like English K in \"kit\"", "Like English SH in \"ship\""], "correctAnswer": "Like the ch in Scottish \"loch\" or German \"Bach\"", "explanationEn": "Х makes a throaty sound like the ch in Scottish ''loch''. It is NOT like English H. Try saying K but with friction instead of a full stop."}',
 0.3, 0.95);


-- ============================================================
-- Kid segment: Picture-based, zero reading required
-- ============================================================

INSERT INTO content_atoms (id, content_type, exercise_type, cefr_level, target_skills, segment_tags, content_data, difficulty, quality_score)
VALUES
(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 ARRAY['kid'],
 '{"promptEn": "The Russian letter that looks like a house without a roof (Д) makes what sound?", "distractors": ["B (as in ball)", "G (as in go)", "T (as in top)"], "correctAnswer": "D (as in dog)", "explanationEn": "Д makes the D sound, like in Dog! It looks like a little house — imagine a Dog house!"}',
 0.1, 0.95),

(gen_random_uuid(), 'exercise', 'multiple_choice', 'A1',
 ARRAY['script.cyrillic.cognates'],
 ARRAY['kid'],
 '{"promptEn": "The Russian letter Ф looks like a person with their hands on their hips. What sound does it make?", "distractors": ["P (as in pig)", "V (as in van)", "S (as in sun)"], "correctAnswer": "F (as in fish)", "explanationEn": "Ф makes the F sound, like in Fish! Imagine a person standing with hands on hips going Ffff!"}',
 0.1, 0.95);

