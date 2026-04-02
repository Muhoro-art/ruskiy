-- Russkiy Initial Database Schema
-- PostgreSQL 16+

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TYPE account_type AS ENUM ('free', 'premium', 'institutional', 'family');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login      TIMESTAMPTZ,
    account_type    account_type DEFAULT 'free',
    subscription_id UUID,
    locale          VARCHAR(10) DEFAULT 'en-US'
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- LEARNER PROFILES
-- ============================================

CREATE TYPE learner_segment AS ENUM (
    'toddler', 'kid', 'teen', 'uni_prep', 'migrant', 'senior'
);

CREATE TYPE domain_focus AS ENUM (
    'general', 'medical', 'engineering', 'humanities', 'business', 'law'
);

CREATE TYPE cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

CREATE TABLE learner_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name    VARCHAR(100) NOT NULL,
    segment         learner_segment NOT NULL,
    native_language VARCHAR(10) DEFAULT 'en',
    domain          domain_focus DEFAULT 'general',
    current_level   cefr_level DEFAULT 'A1',
    target_level    cefr_level NOT NULL,
    target_date     DATE,
    weekly_hours    DECIMAL(4,1) DEFAULT 5.0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    onboarding_data JSONB
);

CREATE INDEX idx_profiles_user_id ON learner_profiles(user_id);
CREATE INDEX idx_profiles_segment ON learner_profiles(segment);

-- ============================================
-- SKILLS (Reference Table)
-- ============================================

CREATE TYPE skill_category AS ENUM ('grammar', 'vocabulary', 'phonetics', 'pragmatics');

CREATE TABLE skills (
    skill_id        VARCHAR(255) PRIMARY KEY,  -- e.g. 'grammar.cases.genitive.plural'
    category        skill_category NOT NULL,
    subcategory     VARCHAR(100) NOT NULL,
    cefr_level      cefr_level NOT NULL,
    display_name_en VARCHAR(255) NOT NULL,
    display_name_ru VARCHAR(255) NOT NULL,
    prerequisites   TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_cefr ON skills(cefr_level);

-- ============================================
-- LEARNER SKILL STATE (FSRS-based)
-- ============================================

CREATE TYPE skill_status AS ENUM ('new', 'learning', 'review', 'mastered', 'fossilized');

CREATE TABLE learner_skills (
    learner_id       UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    skill_id         VARCHAR(255) NOT NULL REFERENCES skills(skill_id),
    confidence       DECIMAL(4,3) DEFAULT 0.000,    -- 0.000 to 1.000
    stability        DECIMAL(10,2) DEFAULT 0.50,     -- days
    difficulty       DECIMAL(4,3) DEFAULT 0.300,     -- 0.000 to 1.000
    last_reviewed    TIMESTAMPTZ,
    next_review_due  TIMESTAMPTZ,
    total_attempts   INT DEFAULT 0,
    correct_streak   INT DEFAULT 0,
    error_count      INT DEFAULT 0,
    error_types      TEXT[] DEFAULT '{}',
    interference_with TEXT[] DEFAULT '{}',
    status           skill_status DEFAULT 'new',
    reps             INT DEFAULT 0,
    lapses           INT DEFAULT 0,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (learner_id, skill_id)
);

CREATE INDEX idx_learner_skills_due ON learner_skills(learner_id, next_review_due);
CREATE INDEX idx_learner_skills_status ON learner_skills(learner_id, status);
CREATE INDEX idx_learner_skills_confidence ON learner_skills(learner_id, confidence);

-- ============================================
-- CONTENT
-- ============================================

CREATE TYPE content_type AS ENUM ('exercise', 'dialogue', 'story', 'media', 'scenario');

CREATE TYPE exercise_type AS ENUM (
    'multiple_choice', 'fill_blank', 'translation', 'dictation',
    'speaking', 'matching', 'ordering', 'role_play', 'listening', 'reading_comp'
);

CREATE TABLE content_atoms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type    content_type NOT NULL,
    exercise_type   exercise_type,
    target_skills   TEXT[] NOT NULL DEFAULT '{}',
    cefr_level      cefr_level NOT NULL,
    segment_tags    TEXT[] DEFAULT '{}',
    domain_tags     TEXT[] DEFAULT '{}',
    difficulty      DECIMAL(3,2) DEFAULT 0.50,
    estimated_time  INT DEFAULT 30,                -- seconds
    content_data    JSONB NOT NULL,
    media_refs      TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    quality_score   DECIMAL(3,2) DEFAULT 0.50,
    usage_count     INT DEFAULT 0
);

CREATE INDEX idx_content_skills ON content_atoms USING GIN(target_skills);
CREATE INDEX idx_content_cefr ON content_atoms(cefr_level);
CREATE INDEX idx_content_type ON content_atoms(content_type, exercise_type);
CREATE INDEX idx_content_difficulty ON content_atoms(difficulty);
CREATE INDEX idx_content_segments ON content_atoms USING GIN(segment_tags);
CREATE INDEX idx_content_domains ON content_atoms USING GIN(domain_tags);

-- ============================================
-- SESSIONS
-- ============================================

CREATE TYPE session_status AS ENUM (
    'generating', 'active', 'paused', 'completed', 'abandoned'
);

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    learner_id      UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    status          session_status DEFAULT 'generating',
    current_index   INT DEFAULT 0,
    total_xp        INT DEFAULT 0,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration        INT DEFAULT 0,                 -- seconds
    accuracy_rate   DECIMAL(4,3) DEFAULT 0.000
);

CREATE INDEX idx_sessions_learner ON sessions(learner_id, started_at DESC);
CREATE INDEX idx_sessions_status ON sessions(status);

CREATE TYPE session_item_role AS ENUM (
    'warmup', 'ramp', 'core', 'relief', 'challenge', 'cooldown'
);

CREATE TABLE session_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position        INT NOT NULL,
    content_id      UUID NOT NULL REFERENCES content_atoms(id),
    role            session_item_role NOT NULL,
    completed       BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_session_items_session ON session_items(session_id, position);

-- ============================================
-- EXERCISE RESULTS
-- ============================================

CREATE TYPE error_type AS ENUM (
    'transfer', 'overgeneralization', 'avoidance', 'fossilization', 'general'
);

CREATE TABLE exercise_results (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    content_id          UUID NOT NULL REFERENCES content_atoms(id),
    learner_id          UUID NOT NULL REFERENCES learner_profiles(id),
    response            TEXT NOT NULL,
    correct_answer      TEXT NOT NULL,
    is_correct          BOOLEAN NOT NULL,
    error_type          error_type,
    response_time_ms    INT NOT NULL,
    hint_level_used     INT DEFAULT 0,
    pronunciation_score DECIMAL(4,3),
    xp_earned           INT DEFAULT 0,
    timestamp           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_session ON exercise_results(session_id);
CREATE INDEX idx_results_learner ON exercise_results(learner_id, timestamp DESC);
CREATE INDEX idx_results_skill_analysis ON exercise_results(learner_id, content_id, error_type);

-- ============================================
-- SUBSCRIPTIONS
-- ============================================

CREATE TYPE subscription_tier AS ENUM ('free', 'core', 'premium', 'institutional');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing');

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier                subscription_tier NOT NULL DEFAULT 'free',
    status              subscription_status NOT NULL DEFAULT 'active',
    stripe_customer_id  VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    canceled_at         TIMESTAMPTZ
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_customer_id);

-- Add foreign key from users to subscriptions
ALTER TABLE users ADD CONSTRAINT fk_users_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);

-- ============================================
-- STREAKS & GAMIFICATION
-- ============================================

CREATE TABLE learner_streaks (
    learner_id      UUID PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
    current_streak  INT DEFAULT 0,
    longest_streak  INT DEFAULT 0,
    last_activity   DATE,
    streak_shields  INT DEFAULT 0,
    total_xp        INT DEFAULT 0,
    level           INT DEFAULT 1
);

-- ============================================
-- TEACHER & INSTITUTIONAL
-- ============================================

CREATE TABLE cohorts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id      UUID NOT NULL REFERENCES users(id),
    name            VARCHAR(255) NOT NULL,
    institution_id  UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cohort_members (
    cohort_id       UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    learner_id      UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (cohort_id, learner_id)
);

CREATE TABLE assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id       UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    teacher_id      UUID NOT NULL REFERENCES users(id),
    title           VARCHAR(255) NOT NULL,
    target_skills   TEXT[] NOT NULL DEFAULT '{}',
    min_exercises   INT DEFAULT 10,
    deadline        TIMESTAMPTZ,
    difficulty_min  DECIMAL(3,2) DEFAULT 0.00,
    difficulty_max  DECIMAL(3,2) DEFAULT 1.00,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_cohort ON assignments(cohort_id);
