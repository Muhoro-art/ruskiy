-- Auditable clickwrap consent to the legal documents (Terms, Privacy Policy, Cookie
-- Policy), captured at registration. This is the evidence trail a regulator (e.g.
-- Roskomnadzor under 152-FZ) would ask for: WHO agreed to WHICH VERSION, WHEN, and from
-- WHERE. Version strings pin exactly which document text was agreed (the text lives in
-- the app, versioned); ip/user_agent are evidence of the affirmative act.
CREATE TABLE IF NOT EXISTS legal_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version   VARCHAR(32) NOT NULL,
    privacy_version VARCHAR(32) NOT NULL,
    cookie_version  VARCHAR(32) NOT NULL,
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address      VARCHAR(64),
    user_agent      VARCHAR(512)
);
CREATE INDEX IF NOT EXISTS idx_legal_consents_user ON legal_consents (user_id);

-- NOTE for counsel: this table CASCADE-deletes with the user (right-to-erasure). If your
-- lawyer advises retaining consent proof beyond account deletion as a legal obligation,
-- change the FK (e.g. keep the row, null the user_id, and anonymize ip/user_agent).
