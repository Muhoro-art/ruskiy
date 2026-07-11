-- Date of birth collected at registration → the authoritative age signal for the
-- under-18 (minor) determination and guardian consent, instead of relying on the
-- self-selected learning segment. Nullable so pre-existing accounts are unaffected.
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
