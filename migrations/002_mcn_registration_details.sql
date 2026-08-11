BEGIN;

ALTER TABLE kol_gov.registration_organization_details
  ADD COLUMN IF NOT EXISTS declared_channel_count integer,
  ADD COLUMN IF NOT EXISTS content_manager_name text,
  ADD COLUMN IF NOT EXISTS content_manager_phone text;

COMMIT;
