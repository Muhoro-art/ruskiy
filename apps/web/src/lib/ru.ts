// Russian UI strings for STAFF surfaces (teacher / dean consoles).
//
// Product decision: teachers of Russian are Russian speakers, so the staff
// consoles render in Russian while LEARNER surfaces stay English (learners are
// students OF Russian). This is a plain dictionary rather than a full i18n
// layer — one place to change copy, and an easy seam if per-user locale
// selection is added later (see docs/teacher-authoring-spec.md, appendix).

export const T = {
  // Shell / nav
  navCommandCenter: "Командный центр",
  navCohorts: "Группы",
  navAssignments: "Задания",
  navDean: "Декан",
  navInstitution: "Учреждение",
  navStudio: "Студия",
  roleTeacher: "Преподаватель",
  roleDean: "Декан",
  roleAdmin: "Администратор",
  signOut: "Выйти",

  // Command Center
  c2Title: "Командный центр",
  c2Subtitle: "Ваши группы, ученики и кому нужна помощь.",
  students: "Учеников",
  active7d: "Активны (7 дн.)",
  started: "Приступили",
  ofStudents: "от всех учеников",
  avgMastery: "Средний прогресс",
  avgMasteryNote: (n: number) => `среди ${n} приступивших`,
  noneStarted: "никто не приступил",
  atRisk: "Требуют внимания",
  cohorts: "Групп",
  assignmentsCount: (n: number) => `${n} заданий`,
  cohortsPanel: "Группы",
  cohortCol: "Группа",
  startedCol: "Приступили",
  activeCol: "Активны",
  masteryCol: "Прогресс",
  joinCodeCol: "Код",
  noCohorts: "Пока нет групп.",
  attentionPanel: "Ученики, требующие внимания",
  worstFirst: "сначала самые сложные",
  allOnTrack: "Никто не отмечен — все идут по плану. 🎉",
  lastActive: "был(а) активен(на)",
  never: "никогда",
  assignmentsPanel: "Последние задания",
  noAssignments: "Заданий пока нет.",
  wholeCohort: "вся группа",
  nStudents: (n: number) => `${n} учен.`,
  newAssignment: "+ Новое задание",
  viewAll: "Все →",

  // Risk reasons (stable server keys → display copy)
  riskReasons: {
    not_started: "Не приступал(а)",
    low_mastery: "Низкий прогресс",
    inactive: "Неактивен(на)",
    low_mastery_inactive: "Низкий прогресс + неактивен(на)",
  } as Record<string, string>,

  // Cohorts pages
  cohortsTitle: "Группы",
  cohortsSubtitle: "Управляйте классами и приглашайте учеников.",
  newCohort: "+ Новая группа",
  cohortNamePh: "Название группы (напр. Русский 101 — осень 2026)",
  create: "Создать",
  loading: "Загрузка…",
  noCohortsYet: "Пока нет групп. Создайте первую выше.",
  studentsN: (n: number) => `${n} ${n === 1 ? "ученик" : n < 5 && n > 1 ? "ученика" : "учеников"}`,
  createdOn: "создана",
  viewHeatmap: "Карта навыков →",
  teacherAccessRequired: "Требуется роль преподавателя",
  askAdminForRole: "Попросите администратора выдать вашему аккаунту роль преподавателя.",

  // Cohort detail / joining
  heatmapTitle: "Карта слабых навыков",
  skillsTracked: (s: number, k: number) => `${s} учен. · ${k} навыков отслеживается`,
  inviteStudents: "+ Пригласить учеников",
  joinCode: "Код приглашения",
  generateCode: "Создать код",
  rotateCode: "Сменить код",
  codeHint: "Передайте код ученику любым способом — введя его на странице Join, ученик сам вступает в группу.",
  copied: "Скопировано!",
  copy: "Копировать",
  searchPh: "Поиск учеников по имени…",
  search: "Найти",
  searching: "Ищем…",
  searchHint: "Найдите ученика и отправьте приглашение — он должен принять его сам.",
  invite: "Пригласить",
  invited: "Приглашён",
  enrolled: "В группе",
  pendingInvites: "Ожидают ответа",
  noStudentsYet: "В группе пока нет учеников. Отправьте приглашения или поделитесь кодом.",
  studentCol: "Ученик",
  classAvg: "Среднее по классу",
  needsFocused: "нужна целенаправленная практика",
  developing: "развивается — нужна смешанная практика",
  onTrack: "идёт по плану — продолжайте интервальные повторения",

  // Assignments
  assignmentsTitle: "Задания",
  assignmentsSubtitle: "Создавайте адаптивные задания для групп, подгрупп или отдельных учеников.",
  due: "Срок:",
  noDeadline: "Без срока",
  minExercises: (n: number) => `мин. ${n} упражнений`,
  reuse: "Использовать снова",
  forWholeCohort: "Вся группа",
  forNStudents: (n: number) => `Для ${n} учен.`,
  noAssignmentsYet: "Заданий пока нет. Создайте первое для своей группы.",

  // New assignment
  newAssignmentTitle: "Новое задание",
  breadcrumbAssignments: "Задания",
  assignmentTitleLabel: "Название задания",
  assignmentTitlePh: "напр. Родительный падеж — неделя 3",
  cohortLabel: "Группа",
  selectCohort: "Выберите группу…",
  noCohortsCreateFirst: "Нет групп — сначала создайте группу",
  audienceLabel: "Кому",
  audienceAll: "Всей группе",
  audienceSome: "Выбранным ученикам",
  audienceHint: "Выберите учеников — задание увидят только они.",
  targetSkillsLabel: "Целевые навыки",
  targetSkillsHint: "(ИИ адаптирует упражнения под каждого ученика)",
  minExercisesLabel: "Минимум упражнений",
  deadlineLabel: "Срок сдачи",
  timePerQuestionLabel: "Время на вопрос, сек",
  timePerQuestionHint: "(по умолчанию 30 — задания всегда с таймером)",
  howAdaptiveTitle: "Как работают адаптивные задания:",
  howAdaptiveBody:
    "Вы задаёте целевые навыки и рамки. ИИ формирует персональный набор упражнений для каждого ученика по его текущим знаниям: тот, кто пишет родительный падеж единственного числа на 80%, а множественного — на 30%, получит в основном множественное число.",
  createAssignment: "Создать задание",
  creating: "Создаём…",
  cancel: "Отмена",
  titleAndCohortRequired: "Нужны название и группа.",

  // Student report (teacher-facing student page)
  lessonsWorked: "Уроков пройдено",
  reportBreadcrumb: "Отчёт об ученике",
  levelLabel: "Уровень",
  avgConfidenceLabel: "Средний прогресс",
  skillsAttempted: "Навыков затронуто",
  mastered: "Освоено",
  sessions: "Сессий",
  totalXp: "Всего XP",
  weakAreasTitle: "Самые слабые места",
  weakAreasSub: "Навыки с наименьшей уверенностью среди затронутых учеником.",
  noAttemptedSkills: "У ученика пока нет данных по затронутым навыкам.",
  notYourStudent: "Не ваш ученик",
  reportLoadFail: "Не удалось загрузить отчёт",
  loadingReport: "Загружаем отчёт…",
  back: "← Назад",

  // At-risk truncation
  andNMore: (n: number) => `…и ещё ${n}`,

  // Cohort join-code rotation
  rotateConfirm: "Сменить код? Старый код перестанет работать у всех, кому вы его отправили.",

  // Assignment audience validation
  audienceEmptyError: "Выберите хотя бы одного ученика или переключитесь на «Всей группе».",

  // Dean console
  deanTitle: "Декан · Управление",
  deanSubtitle: "Как работает каждый преподаватель — по всему учреждению.",
  teachers: "Преподавателей",
  teacherPerformance: "Работа преподавателей",
  sortHint: "клик по колонке — сортировка · клик по преподавателю — детали",
  noTeachersYet: "Пока нет преподавателей. Выдайте пользователю роль преподавателя, чтобы увидеть его здесь.",
  teacherCol: "Преподаватель",
  allTeachers: "← Все преподаватели",
  deanOversight: "Командный центр преподавателя — обзор декана.",
  teacherFallback: "Преподаватель",

  // Institution admin (dean)
  instTitle: "Учреждение",
  instSubtitle: "Приглашайте преподавателей, распределяйте группы и управляйте набором студентов.",
  inviteTeacherPanel: "Пригласить преподавателя или декана",
  assignCohortPanel: "Назначить группу преподавателю",
  enrolledStudentsPanel: "Зачисленные студенты",
} as const;

/** Map a server risk-reason key to Russian display copy. */
export function riskLabel(key: string): string {
  return T.riskReasons[key] || key;
}
