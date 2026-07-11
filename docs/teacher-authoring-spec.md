# Teacher Authoring Sandbox ("Студия") — Design Spec

**Status:** Approved direction, spec-first (user decision 2026-07-03). A clickable
prototype ships at `/dashboard/studio` (real editor + real learner-component
preview; persistence disabled).

## 1. Vision

Teachers author their own Russian exercises, games and topics with the platform's
tools — "a sandbox where they can create their own Russian learning games, topics,
content" — then either **assign them to their own students** or **submit them to a
platform moderator** to be published globally to all learners.

Two hard principles:

1. **Reuse the existing exercise engine.** Teacher content is data, not code: every
   authored item conforms to the SAME `Question` schema the curriculum uses
   (`apps/web/src/curriculum/types.ts`), so all 9 interactive exercise types
   (multiple_choice, fill_blank, matching, drag_endings, word_scramble,
   sentence_builder, listening, memory_match, free_response) work for teacher
   content with zero new renderers. New exercise types built later benefit both.
2. **Learners only ever see vetted content.** A teacher's own students see the
   teacher's content once the teacher assigns it (the teacher IS the authority for
   their class). The GLOBAL pool requires moderator approval — nothing teacher-made
   reaches strangers' children without review.

## 2. Content model (backend)

```sql
-- 0xx_teacher_content.sql
CREATE TABLE teacher_content (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL,
    exercise_type VARCHAR(32)  NOT NULL,     -- one of the 9 engine types
    content_data  JSONB        NOT NULL,     -- Question-shaped payload (validated)
    cefr_level    cefr_level   NOT NULL DEFAULT 'A1',
    topic         VARCHAR(100) DEFAULT '',   -- teacher-defined grouping ("Моя тема")
    target_skills TEXT[]       DEFAULT '{}',
    status        VARCHAR(24)  NOT NULL DEFAULT 'draft',
        -- draft → submitted → approved | rejected   (global-publish pipeline)
        -- 'draft' items are still assignable to the author's OWN cohorts.
    submitted_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE content_reviews (               -- moderation queue + audit trail
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id  UUID NOT NULL REFERENCES teacher_content(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES users(id),   -- admin/moderator who resolved it
    verdict     VARCHAR(16),                 -- approved | rejected (NULL = pending)
    feedback    TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Attach authored items to assignments (extends the existing assignment flow —
-- an assignment can carry curriculum skills AND/OR authored items):
CREATE TABLE assignment_content (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    content_id    UUID NOT NULL REFERENCES teacher_content(id) ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, content_id)
);
```

Validation on write: server-side JSON-schema check per exercise_type (required
fields per type mirror the component props — e.g. `multiple_choice` requires
`promptEn`, `correctAnswer`, `distractors[1..6]`), length caps on all strings,
and a profanity/PII lint before submit.

## 3. API surface

| Method & path | Who | Purpose |
|---|---|---|
| `POST /v1/teacher/content` | teacher/dean | create draft |
| `GET /v1/teacher/content` | teacher/dean | list own items (all statuses) |
| `PATCH /v1/teacher/content/{id}` | author | edit draft/rejected (re-opens as draft) |
| `DELETE /v1/teacher/content/{id}` | author | delete own item (cascade from assignments) |
| `POST /v1/teacher/content/{id}/submit` | author | draft → submitted (enqueues review) |
| `GET /v1/admin/content/reviews` | admin | pending queue |
| `POST /v1/admin/content/reviews/{id}` | admin | `{verdict, feedback}` → approved/rejected |
| `GET /v1/content/global?level=&type=` | any learner | approved global pool (feeds sessions) |

Ownership: every teacher endpoint checks `author_id = caller`; admin endpoints sit
behind the existing `RequireRole("admin")` gate. Rate-limit submits (e.g. 20/day)
to keep the moderation queue sane.

## 4. Studio UX (teacher, Russian UI)

1. **Мои материалы** — list of authored items with status chips (Черновик /
   На проверке / Одобрено / Отклонено + reviewer feedback).
2. **Конструктор** (prototype already live at `/dashboard/studio`):
   type picker → type-specific form → **live preview rendering the real learner
   components** → Сохранить как черновик.
3. **Использование**: from an item, «Назначить группе» opens the existing
   new-assignment form with the item attached (`assignment_content`); or
   «Отправить на модерацию» for global publish.
4. Kid-safety flag: authored items default to teen+; a moderator must explicitly
   mark an item kid-safe before it can reach the kid segment.

## 5. Moderation UX (admin panel)

New `/admin/moderation` page in the existing admin shell: queue of submitted items
(author, type, level, live preview using the same components), Approve / Reject +
feedback. Every decision writes the `content_reviews` audit row. Approved items
appear in the global pool and in the author's list as Одобрено.

## 6. Delivery to learners

- **Cohort path:** assignment carries `assignment_content` rows → the learner's
  assignment view lists the items → the session player renders them like any
  curriculum question (they're the same shape).
- **Global path:** approved items join the content pool the session composer
  samples from, tagged by cefr_level/topic/skills; the adaptive engine treats them
  like curriculum bank questions.
- Usage/quality loop (phase 2): per-item accuracy stats feed back to the author
  ("your item is too easy/hard"), and a report button lets learners flag items
  post-publication.

## 7. Phasing & estimates

| Phase | Scope | Status |
|---|---|---|
| A | Tables + CRUD + validation + Студия persistence («черновик») | ✅ SHIPPED 2026-07-03 (+ composite builder, per-author quotas 500/25, per-type content validation) |
| B | Assign-to-cohort (`assignment_content` + learner delivery via `/dashboard/tasks/{id}`) | ✅ SHIPPED 2026-07-03 |
| C | Submit → `/admin/moderation` queue → approve/reject+feedback → `GET /content/global` pool | ✅ SHIPPED 2026-07-03 (session-composer integration of the global pool still open) |
| D | Usage stats, kid-safe flags, item reporting, versioning/unpublish | later |

## Appendix: locale note

Staff UI strings live in `apps/web/src/lib/ru.ts` (plain dictionary — the seam for
a future full i18n layer). Learner-facing strings stay English; authored CONTENT
carries its own ru/en fields exactly like curriculum questions.
