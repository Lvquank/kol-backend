BEGIN;

ALTER TABLE kol_gov.registration_applications
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMIT;
