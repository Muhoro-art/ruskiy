"use client";

// Студия — конструктор собственных материалов преподавателя.
//
// Полная свобода: ВСЕ ДЕСЯТЬ типов упражнений платформы доступны как блоки
// (выбор ответа, пропуск, собери слово, соответствия, собери предложение,
// аудирование, мемори, окончания, свободный ответ, диалог), а «Составное
// задание» комбинирует их в цепочку без ограничений на порядок и сочетание.
//
// Шаги составного задания РЕДАКТИРУЕМЫ: клик по шагу загружает его в блок-
// редактор («Редактируете шаг N» → «Обновить шаг»), «+ Новый шаг» возвращает
// в режим добавления. Предпросмотр всегда рендерит настоящие компоненты
// учеников через общий ContentPlayer.

import { useEffect, useMemo, useState } from "react";
import { api, type TeacherContent } from "@/lib/api";
import { ContentPlayer, type AtomicType, type AtomicData, type CompositeStep } from "@/components/content/ContentPlayer";
import { PageHeader, Panel } from "@/components/dashboard/ui";

type StudioType = AtomicType | "composite";

const ATOMIC_TYPES: Array<{ id: AtomicType; label: string; hint: string }> = [
  { id: "multiple_choice", label: "Выбор ответа", hint: "Вопрос + правильный ответ и отвлекающие варианты" },
  { id: "fill_blank", label: "Пропуск", hint: "Русское предложение с ___ на месте пропуска" },
  { id: "word_scramble", label: "Собери слово", hint: "Ученик собирает русское слово из букв" },
  { id: "matching", label: "Соответствия", hint: "Пары «русский ↔ перевод», ученик соединяет их" },
  { id: "sentence_builder", label: "Собери предложение", hint: "Ученик расставляет слова в правильном порядке" },
  { id: "listening", label: "Аудирование", hint: "Фраза озвучивается — ученик выбирает ответ" },
  { id: "memory_match", label: "Мемори", hint: "Игра на память: найти пары карточек ru ↔ en" },
  { id: "drag_endings", label: "Окончания", hint: "Перетащить правильные окончания в пропуски {0}, {1}…" },
  { id: "free_response", label: "Свободный ответ", hint: "Письмо или говорение с образцом и критериями самооценки" },
  { id: "dialogue", label: "Диалог", hint: "Реплики с озвучкой и переводом — чтение по ролям" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  [...ATOMIC_TYPES.map((t) => [t.id, t.label]), ["composite", "Составное задание"]]
);
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Черновик", cls: "bg-gray-100 text-gray-600" },
  submitted: { text: "На проверке", cls: "bg-amber-50 text-amber-700" },
  approved: { text: "Одобрено", cls: "bg-green-50 text-green-700" },
  rejected: { text: "Отклонено", cls: "bg-red-50 text-red-700" },
};
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const smallBtn = "text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50";

function stepSummary(s: CompositeStep): string {
  const d = s.data;
  const core =
    s.type === "fill_blank" ? d.promptRu
    : s.type === "matching" ? `${d.matchPairs?.length ?? 0} пар`
    : s.type === "memory_match" ? `${d.pairs?.length ?? 0} пар`
    : s.type === "sentence_builder" ? (d.correctOrder || []).join(" ")
    : s.type === "listening" ? d.textRu
    : s.type === "drag_endings" ? d.templateRu
    : s.type === "dialogue" ? `${d.dialogueLines?.length ?? 0} реплик`
    : d.promptEn || d.answer;
  return `${TYPE_LABEL[s.type]} — ${(core || "").slice(0, 44)}`;
}

export default function StudioPage() {
  const [tab, setTab] = useState<"builder" | "library">("builder");
  const [library, setLibrary] = useState<TeacherContent[]>([]);
  const [libLoading, setLibLoading] = useState(true);

  // ---- builder state ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [cefr, setCefr] = useState("A1");
  const [type, setType] = useState<StudioType>("multiple_choice");
  const [atomicType, setAtomicType] = useState<AtomicType>("multiple_choice");
  // shared / per-type fields
  const [promptEn, setPromptEn] = useState("How do you say “thank you” in Russian?");
  const [promptRu, setPromptRu] = useState("Я читаю ___ книгу.");
  const [answer, setAnswer] = useState("спасибо");
  const [distractors, setDistractors] = useState("пожалуйста, привет, до свидания");
  const [hint, setHint] = useState("");
  const [explanation, setExplanation] = useState("«Спасибо» is the standard way to say thank you.");
  const [pairs, setPairs] = useState<Array<{ left: string; right: string }>>([
    { left: "кошка", right: "cat" },
    { left: "собака", right: "dog" },
  ]);
  const [sentenceRu, setSentenceRu] = useState("Я читаю интересную книгу");
  const [tokenDistractors, setTokenDistractors] = useState("");
  const [translation, setTranslation] = useState("I am reading an interesting book");
  const [listenText, setListenText] = useState("Доброе утро!");
  const [memPairs, setMemPairs] = useState<Array<{ ru: string; en: string }>>([
    { ru: "дом", en: "house" },
    { ru: "вода", en: "water" },
  ]);
  const [template, setTemplate] = useState("Я читал{0} интересн{1} книгу.");
  const [slotRows, setSlotRows] = useState<Array<{ stem: string; correct: string }>>([
    { stem: "читал", correct: "а" },
    { stem: "интересн", correct: "ую" },
  ]);
  const [bank, setBank] = useState("а, ую, ый, ая");
  const [frMode, setFrMode] = useState<"writing" | "speaking">("writing");
  const [modelAnswer, setModelAnswer] = useState("Меня зовут Анна. Я живу в Москве.");
  const [rubric, setRubric] = useState("Introduced themselves\nUsed correct verb forms");
  const [dialogLines, setDialogLines] = useState<Array<{ speaker: string; textRu: string; textEn: string }>>([
    { speaker: "Анна", textRu: "Привет! Как дела?", textEn: "Hi! How are you?" },
    { speaker: "Иван", textRu: "Хорошо, спасибо!", textEn: "Good, thanks!" },
  ]);
  // composite
  const [steps, setSteps] = useState<CompositeStep[]>([]);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  // ui
  const [previewNonce, setPreviewNonce] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveAtomic: AtomicType = type === "composite" ? atomicType : (type as AtomicType);
  const distractorList = useMemo(
    () => distractors.split(",").map((s) => s.trim()).filter(Boolean),
    [distractors]
  );

  async function loadLibrary() {
    try {
      setLibrary(await api.listContent());
    } catch {
      /* backend down — library stays empty */
    } finally {
      setLibLoading(false);
    }
  }
  useEffect(() => {
    loadLibrary();
  }, []);

  function buildAtomicData(t: AtomicType): AtomicData {
    switch (t) {
      case "multiple_choice":
        return { promptEn, correctAnswer: answer, distractors: distractorList, explanationEn: explanation };
      case "fill_blank":
        return { promptRu, promptEn: promptEn || undefined, correctAnswer: answer, explanationEn: explanation };
      case "word_scramble":
        return { promptEn, answer, hintEn: hint || undefined, explanationEn: explanation };
      case "matching":
        return { promptEn: promptEn || "Соедини пары", matchPairs: pairs.filter((p) => p.left.trim() && p.right.trim()), explanationEn: explanation || undefined };
      case "sentence_builder":
        return {
          promptEn: promptEn || "Arrange the words",
          correctOrder: sentenceRu.split(/\s+/).map((w) => w.trim()).filter(Boolean),
          distractorTokens: tokenDistractors.split(",").map((s) => s.trim()).filter(Boolean),
          translationEn: translation || undefined,
          explanationEn: explanation || undefined,
        };
      case "listening":
        return { promptEn: promptEn || "What did you hear?", textRu: listenText, correctAnswer: answer, distractors: distractorList, explanationEn: explanation || undefined };
      case "memory_match":
        return { promptEn: promptEn || "Find the pairs", pairs: memPairs.filter((p) => p.ru.trim() && p.en.trim()), explanationEn: explanation || undefined };
      case "drag_endings":
        return {
          promptEn: promptEn || "Drag the correct endings",
          templateRu: template,
          slots: slotRows.filter((s) => s.stem.trim() && s.correct.trim()),
          endingBank: bank.split(",").map((s) => s.trim()).filter(Boolean),
          explanationEn: explanation || undefined,
        };
      case "free_response":
        return {
          promptEn: promptEn || "Write a few sentences",
          promptRu: promptRu.includes("___") ? undefined : promptRu || undefined,
          modelAnswerRu: modelAnswer,
          rubricEn: rubric.split("\n").map((s) => s.trim()).filter(Boolean),
          responseMode: frMode,
          explanationEn: explanation || undefined,
        };
      case "dialogue":
        return { dialogueLines: dialogLines.filter((l) => l.speaker.trim() && l.textRu.trim() && l.textEn.trim()), explanationEn: explanation || undefined };
    }
  }
  function loadAtomicData(t: AtomicType, d: AtomicData) {
    setPromptEn(d.promptEn || "");
    setPromptRu(d.promptRu || "");
    setAnswer(d.correctAnswer || d.answer || "");
    setDistractors((d.distractors || []).join(", "));
    setHint(d.hintEn || "");
    setExplanation(d.explanationEn || "");
    if (d.matchPairs?.length) setPairs(d.matchPairs);
    if (d.correctOrder?.length) setSentenceRu(d.correctOrder.join(" "));
    setTokenDistractors((d.distractorTokens || []).join(", "));
    if (d.translationEn) setTranslation(d.translationEn);
    if (d.textRu) setListenText(d.textRu);
    if (d.pairs?.length) setMemPairs(d.pairs);
    if (d.templateRu) setTemplate(d.templateRu);
    if (d.slots?.length) setSlotRows(d.slots);
    if (d.endingBank?.length) setBank(d.endingBank.join(", "));
    if (d.responseMode) setFrMode(d.responseMode);
    if (d.modelAnswerRu) setModelAnswer(d.modelAnswerRu);
    if (d.rubricEn?.length) setRubric(d.rubricEn.join("\n"));
    if (d.dialogueLines?.length) setDialogLines(d.dialogueLines);
    void t;
  }

  function buildContentData(): Record<string, unknown> {
    if (type === "composite") return { steps };
    return buildAtomicData(type as AtomicType) as Record<string, unknown>;
  }

  async function save() {
    setSaveMsg("");
    if (!title.trim()) {
      setSaveMsg("Дайте материалу название.");
      return;
    }
    if (type === "composite" && steps.length === 0) {
      setSaveMsg("Добавьте хотя бы один шаг.");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), exerciseType: type, contentData: buildContentData(), cefrLevel: cefr };
      const saved = editingId ? await api.updateContent(editingId, payload) : await api.createContent(payload);
      setEditingId(saved.id);
      setSaveMsg("✓ Черновик сохранён.");
      loadLibrary();
    } catch (e) {
      setSaveMsg((e as Error).message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview(id: string) {
    try {
      await api.submitContent(id);
      setSaveMsg("✓ Отправлено на модерацию.");
      loadLibrary();
    } catch (e) {
      setSaveMsg((e as Error).message || "Не удалось отправить");
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("Удалить этот материал безвозвратно?")) return;
    try {
      await api.deleteContent(id);
      if (editingId === id) resetBuilder();
      loadLibrary();
    } catch {
      /* ignore */
    }
  }

  function editItem(c: TeacherContent) {
    setEditingId(c.id);
    setTitle(c.title);
    setCefr(c.cefrLevel || "A1");
    setSaveMsg("");
    setLastResult(null);
    setEditingStepIndex(null);
    if (c.exerciseType === "composite") {
      setType("composite");
      const data = c.contentData as unknown as { steps?: CompositeStep[] };
      setSteps(Array.isArray(data.steps) ? data.steps : []);
    } else {
      setType(c.exerciseType as StudioType);
      setSteps([]);
      loadAtomicData(c.exerciseType as AtomicType, c.contentData as AtomicData);
    }
    setTab("builder");
    setPreviewNonce((n) => n + 1);
  }

  function resetBuilder() {
    setEditingId(null);
    setTitle("");
    setSteps([]);
    setEditingStepIndex(null);
    setSaveMsg("");
    setLastResult(null);
    setPreviewNonce((n) => n + 1);
  }

  // ---- composite step workflow: click to edit, explicit add/update ----
  function selectStep(i: number) {
    const s = steps[i];
    setEditingStepIndex(i);
    setAtomicType(s.type);
    loadAtomicData(s.type, s.data);
    setPreviewNonce((n) => n + 1);
  }
  function addStep() {
    setSteps((s) => [...s, { type: effectiveAtomic, data: buildAtomicData(effectiveAtomic) }]);
    setPreviewNonce((n) => n + 1);
  }
  function updateStep() {
    if (editingStepIndex === null) return;
    setSteps((s) => s.map((x, i) => (i === editingStepIndex ? { type: atomicType, data: buildAtomicData(atomicType) } : x)));
    setPreviewNonce((n) => n + 1);
  }
  function finishStepEdit() {
    setEditingStepIndex(null);
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setEditingStepIndex((cur) => (cur === i ? i + dir : cur === i + dir ? i : cur));
    setPreviewNonce((n) => n + 1);
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, k) => k !== i));
    setEditingStepIndex((cur) => (cur === i ? null : cur !== null && cur > i ? cur - 1 : cur));
    setPreviewNonce((n) => n + 1);
  }

  const onPlayerResult = (label: string) => {
    if (label === "correct") setLastResult("✓ Ученик ответил верно");
    else if (label === "incorrect") setLastResult("✗ Неверный ответ ученика");
    else if (label === "done") setLastResult("Диалог прочитан");
    else setLastResult(`Результат: ${label} верно`);
  };

  const previewKey = `${type}|${effectiveAtomic}|${previewNonce}|${steps.length}`;
  const editingItem = editingId ? library.find((c) => c.id === editingId) : null;

  // ---- per-type editor fields ----
  const F = effectiveAtomic;
  const showPromptEn = F !== "dialogue";
  const promptEnLabel =
    F === "fill_blank" ? "Пояснение к вопросу (англ., необязательно)"
    : F === "listening" ? "Вопрос после прослушивания (англ.)"
    : "Вопрос / инструкция (англ. — язык учеников)";

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Студия"
        subtitle="Все десять типов упражнений платформы — как блоки. Комбинируйте их в собственные тесты и игры; предпросмотр показывает ровно то, что увидит ученик."
        right={
          <div className="flex gap-2">
            <button onClick={() => setTab("builder")}
              className={`text-sm rounded-lg px-3 py-1.5 border ${tab === "builder" ? "bg-[var(--color-primary)] text-white border-transparent" : "border-gray-200 text-slate-700 hover:bg-gray-50"}`}>
              Конструктор
            </button>
            <button onClick={() => setTab("library")}
              className={`text-sm rounded-lg px-3 py-1.5 border ${tab === "library" ? "bg-[var(--color-primary)] text-white border-transparent" : "border-gray-200 text-slate-700 hover:bg-gray-50"}`}>
              Мои материалы{libLoading ? "" : ` (${library.length})`}
            </button>
          </div>
        }
      />

      {tab === "library" ? (
        <Panel title="Мои материалы">
          {libLoading ? (
            <p className="text-sm text-gray-400">Загрузка…</p>
          ) : library.length === 0 ? (
            <p className="text-sm text-gray-400">Пока пусто — соберите первый материал в Конструкторе и сохраните черновик.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {library.map((c) => {
                const st = STATUS_LABEL[c.status] || STATUS_LABEL.draft;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.title}</p>
                      <p className="text-xs text-gray-400">
                        {TYPE_LABEL[c.exerciseType] || c.exerciseType} · {c.cefrLevel} ·{" "}
                        {new Date(c.updatedAt).toLocaleDateString("ru-RU")}
                      </p>
                      {c.status === "rejected" && c.reviewFeedback && (
                        <p className="text-xs text-red-600 mt-0.5 truncate" title={c.reviewFeedback}>
                          Модератор: {c.reviewFeedback}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
                      {(c.status === "draft" || c.status === "rejected") && (
                        <button onClick={() => editItem(c)} className={smallBtn}>Редактировать</button>
                      )}
                      {c.status === "draft" && (
                        <button onClick={() => submitForReview(c.id)} className={smallBtn}>На модерацию</button>
                      )}
                      <button onClick={() => removeItem(c.id)} className={`${smallBtn} text-red-600 border-red-100 hover:bg-red-50`}>
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {saveMsg && <p className={`text-sm mt-3 ${saveMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{saveMsg}</p>}
        </Panel>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название материала (видно только вам и модератору)"
              className={`${inputCls} flex-1`} />
            <select value={cefr} onChange={(e) => setCefr(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            {editingId && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                ред.: {editingItem?.title || "…"} ·{" "}
                <button onClick={resetBuilder} className="underline hover:text-slate-600">новый</button>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* ================= Editor ================= */}
            <Panel title="Конструктор">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Тип материала</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ATOMIC_TYPES.map((t) => (
                      <button key={t.id} title={t.hint}
                        onClick={() => {
                          if (type === "composite" && steps.length > 0 &&
                              !window.confirm(`Переключиться на «${t.label}»? Шаги составного задания (${steps.length}) будут потеряны при сохранении.`)) {
                            return;
                          }
                          setType(t.id); setLastResult(null); setEditingStepIndex(null); setPreviewNonce((n) => n + 1);
                        }}
                        className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                          type === t.id ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)] font-semibold" : "border-gray-200 hover:border-gray-300 text-slate-700"
                        }`}>
                        {t.label}
                      </button>
                    ))}
                    <button title="Цепочка шагов любых типов — соберите собственный тест или игру"
                      onClick={() => { setType("composite"); setLastResult(null); setPreviewNonce((n) => n + 1); }}
                      className={`col-span-3 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        type === "composite" ? "border-[var(--color-gold)] bg-amber-50 text-amber-800 font-semibold" : "border-gray-200 hover:border-gray-300"
                      }`}>
                      ✨ Составное задание — комбинируйте любые блоки в свой тест или игру
                    </button>
                  </div>
                </div>

                {type === "composite" && (
                  <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Шаги ({steps.length})</p>
                      {editingStepIndex !== null && (
                        <span className="text-xs text-amber-700">Редактируете шаг {editingStepIndex + 1} — блок ниже</span>
                      )}
                    </div>
                    {steps.length === 0 ? (
                      <p className="text-xs text-amber-700">Настройте блок ниже и добавьте его как шаг. Клик по шагу — редактирование.</p>
                    ) : (
                      <div className="space-y-1">
                        {steps.map((s, i) => (
                          <div key={i}
                            className={`flex items-center gap-2 border rounded px-2 py-1.5 cursor-pointer transition-colors ${
                              editingStepIndex === i ? "bg-amber-100 border-amber-300" : "bg-white border-gray-100 hover:border-amber-200"
                            }`}
                            onClick={() => selectStep(i)}
                            title="Нажмите, чтобы редактировать этот шаг">
                            <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                            <span className="text-xs text-slate-700 flex-1 truncate">{stepSummary(s)}</span>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }} className="text-gray-400 hover:text-slate-700 text-xs px-1" title="Выше">↑</button>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }} className="text-gray-400 hover:text-slate-700 text-xs px-1" title="Ниже">↓</button>
                            <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} className="text-red-400 hover:text-red-600 text-xs px-1" title="Убрать">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- block editor context (composite mode) ---- */}
                {type === "composite" && (
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                    <span className="text-sm font-medium">
                      {editingStepIndex !== null ? `Шаг ${editingStepIndex + 1}:` : "Новый шаг:"}
                    </span>
                    <select value={atomicType} onChange={(e) => setAtomicType(e.target.value as AtomicType)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white flex-1">
                      {ATOMIC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    {editingStepIndex !== null ? (
                      <>
                        <button onClick={updateStep} className="text-sm font-semibold bg-[var(--color-primary)] text-white rounded-lg px-3 py-1.5 hover:bg-[var(--color-primary-light)]">
                          Обновить шаг
                        </button>
                        <button onClick={finishStepEdit} className={smallBtn}>Готово</button>
                      </>
                    ) : (
                      <button onClick={addStep} className="text-sm font-semibold bg-[var(--color-accent)] text-white rounded-lg px-3 py-1.5 hover:opacity-90">
                        + Добавить шаг
                      </button>
                    )}
                  </div>
                )}

                {/* ---- per-type fields ---- */}
                {F === "fill_blank" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Русское предложение (один пропуск: ___)</label>
                    <input value={promptRu} onChange={(e) => setPromptRu(e.target.value)} className={inputCls} />
                  </div>
                )}
                {F === "listening" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Фраза, которая прозвучит (по-русски)</label>
                    <input value={listenText} onChange={(e) => setListenText(e.target.value)} className={inputCls} />
                  </div>
                )}
                {F === "sentence_builder" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Предложение (по-русски — слова разделяются пробелами)</label>
                      <input value={sentenceRu} onChange={(e) => setSentenceRu(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Лишние слова (через запятую, необязательно)</label>
                      <input value={tokenDistractors} onChange={(e) => setTokenDistractors(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Перевод (англ.)</label>
                      <input value={translation} onChange={(e) => setTranslation(e.target.value)} className={inputCls} />
                    </div>
                  </>
                )}
                {F === "drag_endings" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Шаблон (по-русски, пропуски: {"{0}, {1}"}…)</label>
                      <input value={template} onChange={(e) => setTemplate(e.target.value)} className={inputCls} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Пропуски (основа + правильное окончание)</label>
                      {slotRows.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <span className="text-xs text-gray-400 w-8">{`{${i}}`}</span>
                          <input value={s.stem} onChange={(e) => setSlotRows((rs) => rs.map((x, k) => (k === i ? { ...x, stem: e.target.value } : x)))}
                            placeholder="основа (читал)" className={inputCls} />
                          <input value={s.correct} onChange={(e) => setSlotRows((rs) => rs.map((x, k) => (k === i ? { ...x, correct: e.target.value } : x)))}
                            placeholder="окончание (а)" className={inputCls} />
                          <button onClick={() => setSlotRows((rs) => rs.filter((_, k) => k !== i))} disabled={slotRows.length <= 1}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30 px-1">✕</button>
                        </div>
                      ))}
                      <button onClick={() => setSlotRows((rs) => [...rs, { stem: "", correct: "" }])} disabled={slotRows.length >= 8} className={smallBtn}>+ Пропуск</button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Банк окончаний (через запятую — включая правильные)</label>
                      <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} />
                    </div>
                  </>
                )}
                {F === "free_response" && (
                  <>
                    <div className="flex gap-2">
                      {(["writing", "speaking"] as const).map((m) => (
                        <button key={m} onClick={() => setFrMode(m)}
                          className={`px-3 py-1.5 rounded-lg border text-sm ${frMode === m ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)] font-medium" : "border-gray-200"}`}>
                          {m === "writing" ? "✍️ Письмо" : "🗣️ Говорение"}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Образец ответа (по-русски)</label>
                      <input value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Критерии самооценки (англ., по одному на строку)</label>
                      <textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={3} className={inputCls} />
                    </div>
                  </>
                )}
                {F === "dialogue" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Реплики диалога</label>
                    {dialogLines.map((l, i) => (
                      <div key={i} className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center">
                        <input value={l.speaker} onChange={(e) => setDialogLines((ls) => ls.map((x, k) => (k === i ? { ...x, speaker: e.target.value } : x)))}
                          placeholder="Кто" className={inputCls} />
                        <input value={l.textRu} onChange={(e) => setDialogLines((ls) => ls.map((x, k) => (k === i ? { ...x, textRu: e.target.value } : x)))}
                          placeholder="Реплика по-русски" className={inputCls} />
                        <input value={l.textEn} onChange={(e) => setDialogLines((ls) => ls.map((x, k) => (k === i ? { ...x, textEn: e.target.value } : x)))}
                          placeholder="Translation" className={inputCls} />
                        <button onClick={() => setDialogLines((ls) => ls.filter((_, k) => k !== i))} disabled={dialogLines.length <= 2}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 px-1">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setDialogLines((ls) => [...ls, { speaker: "", textRu: "", textEn: "" }])} disabled={dialogLines.length >= 20} className={smallBtn}>+ Реплика</button>
                  </div>
                )}
                {F === "matching" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Пары (русский ↔ перевод, без повторов)</label>
                    {pairs.map((p, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input value={p.left} onChange={(e) => setPairs((ps) => ps.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)))}
                          placeholder="кошка" className={inputCls} />
                        <span className="text-gray-400">↔</span>
                        <input value={p.right} onChange={(e) => setPairs((ps) => ps.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)))}
                          placeholder="cat" className={inputCls} />
                        <button onClick={() => setPairs((ps) => ps.filter((_, k) => k !== i))} disabled={pairs.length <= 2}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 px-1">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setPairs((ps) => [...ps, { left: "", right: "" }])} disabled={pairs.length >= 12} className={smallBtn}>+ Пара</button>
                  </div>
                )}
                {F === "memory_match" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Карточки-пары (без повторов)</label>
                    {memPairs.map((p, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input value={p.ru} onChange={(e) => setMemPairs((ps) => ps.map((x, k) => (k === i ? { ...x, ru: e.target.value } : x)))}
                          placeholder="дом" className={inputCls} />
                        <span className="text-gray-400">↔</span>
                        <input value={p.en} onChange={(e) => setMemPairs((ps) => ps.map((x, k) => (k === i ? { ...x, en: e.target.value } : x)))}
                          placeholder="house" className={inputCls} />
                        <button onClick={() => setMemPairs((ps) => ps.filter((_, k) => k !== i))} disabled={memPairs.length <= 2}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 px-1">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setMemPairs((ps) => [...ps, { ru: "", en: "" }])} disabled={memPairs.length >= 10} className={smallBtn}>+ Пара</button>
                  </div>
                )}
                {showPromptEn && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{promptEnLabel}</label>
                    <input value={promptEn} onChange={(e) => setPromptEn(e.target.value)} className={inputCls} />
                  </div>
                )}
                {(F === "multiple_choice" || F === "fill_blank" || F === "listening") && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Правильный ответ</label>
                    <input value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputCls} />
                  </div>
                )}
                {F === "word_scramble" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Слово-ответ (по-русски)</label>
                      <input value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Подсказка (англ., необязательно)</label>
                      <input value={hint} onChange={(e) => setHint(e.target.value)} className={inputCls} />
                    </div>
                  </>
                )}
                {(F === "multiple_choice" || F === "listening") && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Отвлекающие варианты (через запятую, без повторов)</label>
                    <input value={distractors} onChange={(e) => setDistractors(e.target.value)} className={inputCls} />
                  </div>
                )}
                {F !== "dialogue" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Объяснение после ответа (англ., необязательно)</label>
                    <input value={explanation} onChange={(e) => setExplanation(e.target.value)} className={inputCls} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => { setPreviewNonce((n) => n + 1); setLastResult(null); }}
                    className="border border-gray-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                    Обновить предпросмотр
                  </button>
                  <button onClick={save} disabled={saving}
                    className="bg-[var(--color-primary)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--color-primary-light)] disabled:opacity-50">
                    {saving ? "Сохраняем…" : editingId ? "Сохранить изменения" : "Сохранить как черновик"}
                  </button>
                  {editingId && editingItem?.status === "draft" && (
                    <button onClick={() => submitForReview(editingId)}
                      className="border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-100">
                      Отправить на модерацию
                    </button>
                  )}
                </div>
                {saveMsg && <p className={`text-sm ${saveMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{saveMsg}</p>}
              </div>
            </Panel>

            {/* ================= Live preview ================= */}
            <Panel title={type === "composite" && editingStepIndex !== null ? `Предпросмотр — шаг ${editingStepIndex + 1} (блок ниже)` : "Предпросмотр — глазами ученика"}>
              <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-[var(--color-surface)]">
                {type === "composite" && editingStepIndex !== null ? (
                  // While editing a step, preview THAT block live (with unsaved edits).
                  <ContentPlayer
                    key={`stepedit|${previewKey}`}
                    item={{ exerciseType: atomicType, contentData: buildAtomicData(atomicType) as Record<string, unknown> }}
                    nonce={previewNonce}
                    onResult={onPlayerResult}
                  />
                ) : type === "composite" && steps.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
                    Настройте блок слева и добавьте его как шаг — предпросмотр проиграет всё задание по порядку.
                  </p>
                ) : (
                  <ContentPlayer
                    key={previewKey}
                    item={{ exerciseType: type, contentData: buildContentData() }}
                    nonce={previewNonce}
                    onResult={onPlayerResult}
                    doneLabel={`Готово! Все ${steps.length || 1} шагов пройдены.`}
                    againLabel="Пройти ещё раз"
                    stepLabel={(i, n) => `шаг ${i} из ${n}`}
                  />
                )}
              </div>
              {lastResult && <p className="text-sm text-[var(--color-text-muted)] mt-3">{lastResult}</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
