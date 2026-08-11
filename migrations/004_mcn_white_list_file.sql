BEGIN;

ALTER TABLE kol_gov.registration_organization_details
  ADD COLUMN IF NOT EXISTS white_list_request_file_name text;

COMMIT;
