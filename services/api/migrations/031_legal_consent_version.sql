-- 152-FZ (amended 1 Sept 2025) requires consent to personal-data processing to be a
-- SEPARATE, standalone act from the Terms. Record which version of that standalone
-- "Consent to the processing of personal data" document (Art. 9) the user agreed to.
ALTER TABLE legal_consents ADD COLUMN IF NOT EXISTS consent_version VARCHAR(32);
