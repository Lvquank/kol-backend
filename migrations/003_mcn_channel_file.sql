BEGIN;

ALTER TABLE kol_gov.registration_organization_details
  ADD COLUMN IF NOT EXISTS channel_detail_file_name text;

COMMIT;
