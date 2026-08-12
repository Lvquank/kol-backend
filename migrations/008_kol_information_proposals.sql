BEGIN;

CREATE TABLE IF NOT EXISTS kol_gov.kol_information_proposals (
  proposal_id uuid PRIMARY KEY,
  influencer_key text NOT NULL REFERENCES kol_gov.influencers(influencer_key) ON DELETE CASCADE,
  proposal_type text NOT NULL,
  details text NOT NULL,
  submitter_email text,
  declaration_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'resolved', 'rejected')),
  assigned_to uuid REFERENCES kol_gov.admin_users(user_id),
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_gov.kol_information_proposal_reviews (
  review_id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES kol_gov.kol_information_proposals(proposal_id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES kol_gov.admin_users(user_id),
  previous_status text NOT NULL,
  next_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kol_information_proposals_influencer
  ON kol_gov.kol_information_proposals (influencer_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kol_information_proposals_status
  ON kol_gov.kol_information_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kol_information_proposal_reviews_proposal
  ON kol_gov.kol_information_proposal_reviews (proposal_id, created_at DESC);

COMMIT;
