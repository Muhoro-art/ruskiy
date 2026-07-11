// Legal documents for the Russkiy platform, drafted to follow Federal Law No. 152-FZ
// "On Personal Data" (as amended, incl. the 1 Sept 2025 standalone-consent rule) and
// Roskomnadzor's guidance on the "Policy regarding the processing of personal data".
//
// RUSSIAN is the legally-operative language for users in the Russian Federation and is
// shown by default; an English translation is provided for the (English-speaking)
// learners. Version dates MUST stay in sync with services/api/internal/legal/legal.go.
//
// The operator MUST complete the [BRACKETED] facts (legal entity name, ИНН/ОГРН, address,
// responsible-person contact) — these are specific to the operating company, and the
// operator must also file the Roskomnadzor processing notification before launch.

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalVariant = { title: string; effectiveDate: string; intro: string; sections: LegalSection[] };
export type LegalDocument = {
  slug: "consent" | "privacy" | "terms" | "cookies";
  version: string;
  ru: LegalVariant;
  en: LegalVariant;
};

const OPERATOR_EN = "[OPERATOR LEGAL NAME]";
const OPERATOR_RU = "[НАИМЕНОВАНИЕ ОПЕРАТОРА]";
const DETAILS_EN = "[registered address], ИНН [___], ОГРН [___], email [privacy@yourdomain.ru]";
const DETAILS_RU = "[юридический адрес], ИНН [___], ОГРН [___], эл. почта [privacy@yourdomain.ru]";
const RESP_EN = "the person responsible for organizing the processing of personal data: [name, email]";
const RESP_RU = "лицо, ответственное за организацию обработки персональных данных: [ФИО, эл. почта]";

// ————————————————————————————————————————————————————————————————
// 1. Consent to the processing of personal data (152-FZ Art. 9) — the STANDALONE consent.
// ————————————————————————————————————————————————————————————————
export const CONSENT: LegalDocument = {
  slug: "consent",
  version: "2026-07-11",
  ru: {
    title: "Согласие на обработку персональных данных",
    effectiveDate: "11 июля 2026 г.",
    intro:
      `Предоставляя настоящее согласие, я, субъект персональных данных, свободно, своей волей и в своём интересе даю согласие ${OPERATOR_RU} (далее — «Оператор»), ${DETAILS_RU}, на обработку моих персональных данных на условиях, изложенных ниже, в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».`,
    sections: [
      { heading: "1. Перечень персональных данных", paragraphs: [
        "Отображаемое имя, адрес электронной почты, пароль (хранится только в виде защищённого хеша), роль и язык интерфейса; данные об обучении (уровень, прогресс, ответы на задания, результаты экзаменов, аналитика); технические данные (IP-адрес, сведения о браузере/устройстве, дата и время), в том числе как подтверждение факта дачи согласия.",
      ] },
      { heading: "2. Цели обработки", paragraphs: [
        "Создание и защита учётной записи; предоставление и персонализация обучения; работа функций для преподавателей/учебных заведений; поддержка пользователей; исполнение требований законодательства; улучшение сервиса.",
      ] },
      { heading: "3. Перечень действий и способы обработки", paragraphs: [
        "Сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, блокирование, удаление, уничтожение. Обработка ведётся смешанным способом (с использованием средств автоматизации и без таковых).",
      ] },
      { heading: "4. Локализация", paragraphs: [
        "Запись, систематизация, накопление, хранение, уточнение и извлечение персональных данных граждан Российской Федерации осуществляются с использованием баз данных, расположенных на территории Российской Федерации (ч. 5 ст. 18 152-ФЗ).",
      ] },
      { heading: "5. Срок действия и отзыв согласия", paragraphs: [
        "Согласие действует в течение срока использования сервиса и срока хранения данных, определённого Политикой обработки персональных данных. Согласие может быть отозвано в любой момент путём удаления учётной записи в настройках либо направлением обращения на [privacy@yourdomain.ru]. Отзыв не влияет на обработку, осуществлённую до его получения.",
      ] },
      { heading: "6. Права субъекта", paragraphs: [
        "Я подтверждаю, что ознакомлен(а) с Политикой обработки персональных данных, проинформирован(а) о своих правах, предусмотренных 152-ФЗ, и даю согласие осознанно.",
      ] },
    ],
  },
  en: {
    title: "Consent to the Processing of Personal Data",
    effectiveDate: "11 July 2026",
    intro:
      `By giving this consent I, the data subject, freely, of my own will and in my own interest, consent to ${OPERATOR_EN} (the "Operator"), ${DETAILS_EN}, processing my personal data on the terms below, in accordance with Federal Law No. 152-FZ of 27 July 2006 "On Personal Data".`,
    sections: [
      { heading: "1. Categories of personal data", paragraphs: ["Display name, email, password (stored only as a secure hash), role and locale; learning data (level, progress, answers, exam results, analytics); technical data (IP address, browser/device, date and time), including as evidence of this consent."] },
      { heading: "2. Purposes", paragraphs: ["Creating and securing your account; delivering and personalizing learning; operating teacher/institution features; support; legal compliance; improving the service."] },
      { heading: "3. Actions and methods", paragraphs: ["Collection, recording, systematization, accumulation, storage, updating, retrieval, use, blocking, deletion, destruction — by automated and non-automated means."] },
      { heading: "4. Localization", paragraphs: ["Personal data of citizens of the Russian Federation is recorded, systematized, accumulated, stored, updated and retrieved using databases located in the Russian Federation (Art. 18(5), 152-FZ)."] },
      { heading: "5. Term and withdrawal", paragraphs: ["This consent is valid for as long as you use the service and for the retention period in the Privacy Policy. You may withdraw it at any time by deleting your account in settings or contacting [privacy@yourdomain.ru]. Withdrawal does not affect processing already carried out."] },
      { heading: "6. Rights", paragraphs: ["I confirm I have read the Privacy Policy, am informed of my rights under 152-FZ, and give this consent knowingly."] },
    ],
  },
};

// ————————————————————————————————————————————————————————————————
// 2. Privacy Policy — the "Policy regarding the processing of personal data" (152-FZ 18.1).
// ————————————————————————————————————————————————————————————————
export const PRIVACY: LegalDocument = {
  slug: "privacy",
  version: "2026-07-11",
  ru: {
    title: "Политика в отношении обработки персональных данных",
    effectiveDate: "11 июля 2026 г.",
    intro: `Настоящая Политика определяет порядок обработки и защиты персональных данных ${OPERATOR_RU} (далее — «Оператор») при использовании платформы Russkiy и разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».`,
    sections: [
      { heading: "1. Оператор", paragraphs: [`${OPERATOR_RU}, ${DETAILS_RU}. Ответственность за организацию обработки: ${RESP_RU}.`] },
      { heading: "2. Категории субъектов и персональных данных", paragraphs: ["Субъекты: обучающиеся, преподаватели, представители учебных заведений. Данные: отображаемое имя, эл. почта, пароль (хеш), роль, язык; данные об обучении; технические данные (IP-адрес, браузер/устройство, дата и время)."] },
      { heading: "3. Цели обработки", paragraphs: ["Регистрация и защита учётной записи; предоставление и персонализация обучения; функции для преподавателей и учебных заведений; поддержка; исполнение требований закона; улучшение сервиса."] },
      { heading: "4. Правовые основания", paragraphs: ["Согласие субъекта (ст. 9 152-ФЗ), исполнение договора (пользовательского соглашения), исполнение обязанностей, возложенных законодательством."] },
      { heading: "5. Порядок и способы обработки", paragraphs: ["Обработка ведётся смешанным способом (с использованием средств автоматизации и без). Действия: сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, блокирование, удаление, уничтожение."] },
      { heading: "6. Локализация (ч. 5 ст. 18 152-ФЗ)", paragraphs: ["Запись, систематизация, накопление, хранение, уточнение и извлечение персональных данных граждан РФ осуществляются с использованием баз данных, расположенных на территории Российской Федерации."] },
      { heading: "7. Сроки хранения", paragraphs: ["Персональные данные хранятся не дольше, чем этого требуют цели обработки. Данные аналитики хранятся не более 90 дней; учётные и учебные данные — на время действия учётной записи и до её удаления; журнал согласий — как подтверждение исполнения требований закона. По достижении целей данные удаляются или обезличиваются. [Уточните сроки в уведомлении в Роскомнадзор.]"] },
      { heading: "8. Трансграничная передача", paragraphs: ["[Если трансграничная передача не осуществляется — укажите это. Если осуществляется — укажите страны и правовое основание согласно ст. 12 152-ФЗ, с предварительным уведомлением Роскомнадзора.]"] },
      { heading: "9. Права субъекта персональных данных", paragraphs: ["Субъект вправе получать сведения об обработке своих данных, требовать их уточнения, блокирования или уничтожения, а также отозвать согласие. Удаление учётной записи и всех связанных данных доступно в настройках. Обращения: [privacy@yourdomain.ru]. Субъект вправе обжаловать действия Оператора в Роскомнадзоре или в судебном порядке."] },
      { heading: "10. Меры защиты", paragraphs: ["Применяются правовые, организационные и технические меры: шифрование при передаче (HTTPS), хранение паролей в виде хешей, httpOnly-cookie сессии, разграничение доступа, ограничение частоты запросов, внутренний контроль."] },
      { heading: "11. Несовершеннолетние", paragraphs: ["Обработка данных лиц, не достигших 18 лет, осуществляется с согласия их законных представителей. Учётные записи для детей создаются родителем или опекуном. [Согласуйте механизм подтверждения согласия законного представителя.]"] },
      { heading: "12. Уведомление об инцидентах", paragraphs: ["При установлении факта неправомерной или случайной передачи персональных данных Оператор уведомляет Роскомнадзор в течение 24 часов, а по результатам внутреннего расследования — в течение 72 часов."] },
      { heading: "13. Изменения и контакты", paragraphs: [`Политика может обновляться; версия и дата вступления в силу указаны выше. Вопросы: [privacy@yourdomain.ru], ${OPERATOR_RU}.`] },
    ],
  },
  en: {
    title: "Policy on the Processing of Personal Data (Privacy Policy)",
    effectiveDate: "11 July 2026",
    intro: `This Policy sets out how ${OPERATOR_EN} (the "Operator") processes and protects personal data on the Russkiy platform, in accordance with Federal Law No. 152-FZ of 27 July 2006 "On Personal Data".`,
    sections: [
      { heading: "1. Operator", paragraphs: [`${OPERATOR_EN}, ${DETAILS_EN}. Responsible for organizing processing: ${RESP_EN}.`] },
      { heading: "2. Data subjects and categories of data", paragraphs: ["Subjects: learners, teachers, institution staff. Data: display name, email, password (hash), role, locale; learning data; technical data (IP address, browser/device, date and time)."] },
      { heading: "3. Purposes", paragraphs: ["Registering and securing accounts; delivering and personalizing learning; teacher/institution features; support; legal compliance; improving the service."] },
      { heading: "4. Legal basis", paragraphs: ["The data subject's consent (Art. 9, 152-FZ), performance of our agreement (Terms), and compliance with legal obligations."] },
      { heading: "5. Methods of processing", paragraphs: ["Processing is by mixed means (automated and non-automated): collection, recording, systematization, accumulation, storage, updating, retrieval, use, blocking, deletion, destruction."] },
      { heading: "6. Localization (Art. 18(5), 152-FZ)", paragraphs: ["Personal data of Russian citizens is recorded, systematized, accumulated, stored, updated and retrieved using databases located in the Russian Federation."] },
      { heading: "7. Retention", paragraphs: ["Data is kept no longer than the purposes require. Analytics: up to 90 days; account and learning data: for the life of the account until deletion; the consent log: as evidence of legal compliance. On completion, data is deleted or anonymized. [Confirm the periods in the Roskomnadzor notification.]"] },
      { heading: "8. Cross-border transfer", paragraphs: ["[If none, state so. If any, list the countries and legal basis per Art. 12 of 152-FZ, with prior notification to Roskomnadzor.]"] },
      { heading: "9. Your rights", paragraphs: ["You may obtain information about the processing of your data, require its rectification, blocking or destruction, and withdraw consent. Deleting your account and all associated data is available in settings. Contact: [privacy@yourdomain.ru]. You may complain to Roskomnadzor or a court."] },
      { heading: "10. Security", paragraphs: ["Legal, organizational and technical measures: encryption in transit (HTTPS), hashed passwords, httpOnly session cookies, access controls, rate limiting, internal audits."] },
      { heading: "11. Minors", paragraphs: ["Data of persons under 18 is processed with the consent of their legal representative. Children's accounts are set up by a parent or guardian. [Confirm the guardian-consent mechanism.]"] },
      { heading: "12. Breach notification", paragraphs: ["On establishing an unlawful or accidental transfer of personal data, the Operator notifies Roskomnadzor within 24 hours, and within 72 hours reports the results of its internal investigation."] },
      { heading: "13. Changes and contact", paragraphs: [`This Policy may be updated; the version and effective date are above. Questions: [privacy@yourdomain.ru], ${OPERATOR_EN}.`] },
    ],
  },
};

// ————————————————————————————————————————————————————————————————
// 3. Terms of Service (Пользовательское соглашение).
// ————————————————————————————————————————————————————————————————
export const TERMS: LegalDocument = {
  slug: "terms",
  version: "2026-07-11",
  ru: {
    title: "Пользовательское соглашение",
    effectiveDate: "11 июля 2026 г.",
    intro: `Настоящее Соглашение регулирует использование платформы Russkiy, оператором которой является ${OPERATOR_RU}. Регистрируя учётную запись, вы принимаете условия Соглашения.`,
    sections: [
      { heading: "1. Сервис", paragraphs: ["Russkiy предоставляет онлайн-обучение русскому языку: уроки, упражнения, экзамены, а для преподавателей/учебных заведений — инструменты управления группами."] },
      { heading: "2. Учётные записи", paragraphs: ["Вы обязуетесь предоставлять достоверные данные, хранить пароль в тайне и несёте ответственность за действия в учётной записи. До начала использования необходимо подтвердить адрес электронной почты."] },
      { heading: "3. Допустимое использование", paragraphs: ["Запрещены: противоправный контент, попытки нарушения безопасности, автоматизированный сбор данных, вмешательство в работу сервиса, нарушение прав третьих лиц."] },
      { heading: "4. Интеллектуальная собственность", paragraphs: ["Учебный контент и платформа защищены исключительными правами и предоставляются для личного некоммерческого обучения."] },
      { heading: "5. Учебные заведения", paragraphs: ["Преподаватели и деканы управляют группами только в рамках своего учебного заведения; данные учреждений изолированы."] },
      { heading: "6. Ограничение ответственности", paragraphs: ["Сервис предоставляется «как есть». В пределах, допускаемых законом, Оператор не отвечает за косвенные убытки."] },
      { heading: "7. Прекращение", paragraphs: ["Вы можете удалить учётную запись в любой момент. Оператор вправе приостановить или прекратить доступ при нарушении Соглашения."] },
      { heading: "8. Применимое право", paragraphs: ["К Соглашению применяется право Российской Федерации."] },
      { heading: "9. Изменения и контакты", paragraphs: [`Условия могут обновляться; версия и дата указаны выше. ${OPERATOR_RU}, ${DETAILS_RU}.`] },
    ],
  },
  en: {
    title: "Terms of Service",
    effectiveDate: "11 July 2026",
    intro: `These Terms govern your use of the Russkiy platform operated by ${OPERATOR_EN}. By creating an account you accept these Terms.`,
    sections: [
      { heading: "1. The service", paragraphs: ["Russkiy provides online Russian-language learning — lessons, exercises, exams — and class-management tools for teachers/institutions."] },
      { heading: "2. Accounts", paragraphs: ["You must provide accurate information, keep your password secret, and are responsible for activity on your account. You must confirm your email before using the service."] },
      { heading: "3. Acceptable use", paragraphs: ["No unlawful content, no attempts to breach security, no automated scraping, no interference with the service, no infringement of others' rights."] },
      { heading: "4. Intellectual property", paragraphs: ["Course content and the platform are protected and provided for personal, non-commercial learning."] },
      { heading: "5. Institutions", paragraphs: ["Teachers and deans manage classes only within their own institution; institutional data is isolated per tenant."] },
      { heading: "6. Liability", paragraphs: ["The service is provided \"as is\". To the extent permitted by law, the Operator is not liable for indirect damages."] },
      { heading: "7. Termination", paragraphs: ["You may delete your account at any time. We may suspend or terminate accounts that violate these Terms."] },
      { heading: "8. Governing law", paragraphs: ["These Terms are governed by the law of the Russian Federation."] },
      { heading: "9. Changes and contact", paragraphs: [`These Terms may be updated; the version and date are above. ${OPERATOR_EN}, ${DETAILS_EN}.`] },
    ],
  },
};

// ————————————————————————————————————————————————————————————————
// 4. Cookie Policy (Политика использования cookie).
// ————————————————————————————————————————————————————————————————
export const COOKIES: LegalDocument = {
  slug: "cookies",
  version: "2026-07-11",
  ru: {
    title: "Политика использования файлов cookie",
    effectiveDate: "11 июля 2026 г.",
    intro: "Настоящая Политика описывает использование файлов cookie и аналогичных технологий на платформе Russkiy.",
    sections: [
      { heading: "1. Какие cookie мы используем", paragraphs: [
        "Строго необходимые: обеспечивают вход и безопасность сессии (httpOnly-cookie аутентификации). Без них сервис не работает.",
        "Хранение настроек: ваши предпочтения (размер текста, звук, прогресс обучения) хранятся в локальном хранилище браузера.",
        "Аналитика: обезличенная статистика использования для улучшения сервиса. Используется только с вашего согласия и никогда — для учётных записей несовершеннолетних.",
      ] },
      { heading: "2. Ваш выбор", paragraphs: ["Вы можете принять или отклонить необязательные cookie/аналитику в баннере при первом посещении и изменить выбор позднее. Отклонение не влияет на строго необходимые cookie."] },
      { heading: "3. Контакты", paragraphs: [`Вопросы: [privacy@yourdomain.ru], ${OPERATOR_RU}.`] },
    ],
  },
  en: {
    title: "Cookie Policy",
    effectiveDate: "11 July 2026",
    intro: "This Policy explains how Russkiy uses cookies and similar technologies.",
    sections: [
      { heading: "1. What we use", paragraphs: [
        "Strictly necessary: required to sign you in and keep your session secure (httpOnly authentication cookies). The service cannot run without these.",
        "Preference storage: your settings (text size, sound, tour progress) are kept in your browser's local storage.",
        "Analytics: anonymized usage statistics to improve the service — used only with your consent, and never for the accounts of minors.",
      ] },
      { heading: "2. Your choices", paragraphs: ["Accept or decline non-essential cookies/analytics via the banner on your first visit, and change your choice later. Declining does not affect strictly-necessary cookies."] },
      { heading: "3. Contact", paragraphs: [`Questions: [privacy@yourdomain.ru], ${OPERATOR_EN}.`] },
    ],
  },
};

export const LEGAL_DOCS: Record<string, LegalDocument> = {
  consent: CONSENT,
  privacy: PRIVACY,
  terms: TERMS,
  cookies: COOKIES,
};
