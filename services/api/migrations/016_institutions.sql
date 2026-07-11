-- Migration 016: multi-tenant institutions (row-level tenancy).
-- Universities are tenants. A user belongs to at most one institution
-- (users.institution_id NULL = independent/consumer). Roles stay in users.role;
-- institution_id scopes every teacher/dean query so a university only ever sees
-- its own people. cohorts.institution_id (already present) tags a cohort's tenant.

CREATE TABLE IF NOT EXISTS institutions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(200) NOT NULL,
    slug       VARCHAR(80) UNIQUE,
    join_code  VARCHAR(16) UNIQUE NOT NULL,   -- students self-enrol with this
    status     VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant membership. NULL = independent teacher / consumer learner.
ALTER TABLE users ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);

-- Email invites for provisioning teachers/deans into an institution.
CREATE TABLE IF NOT EXISTS institution_invites (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    email          VARCHAR(255) NOT NULL,
    role           VARCHAR(20) NOT NULL,             -- teacher | dean
    token          VARCHAR(64) UNIQUE NOT NULL,
    accepted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    accepted_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);
CREATE INDEX IF NOT EXISTS idx_invites_institution ON institution_invites(institution_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON institution_invites(lower(email));
