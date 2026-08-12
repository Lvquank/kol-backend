BEGIN;

ALTER TABLE kol_gov.influencers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES kol_gov.admin_users(user_id) ON DELETE SET NULL;

ALTER TABLE kol_gov.mcn_owners
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES kol_gov.admin_users(user_id) ON DELETE SET NULL;

COMMIT;
