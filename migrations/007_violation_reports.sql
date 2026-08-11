BEGIN;

CREATE TABLE IF NOT EXISTS kol_gov.violation_reports (
  report_id uuid PRIMARY KEY,
  reporter_name text NOT NULL,
  reporter_phone varchar(10) NOT NULL,
  reporter_email text,
  report_group text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'resolved', 'rejected')),
  assigned_to uuid REFERENCES kol_gov.admin_users(user_id),
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violation_reports_queue ON kol_gov.violation_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS kol_gov.violation_report_reviews (
  review_id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES kol_gov.violation_reports(report_id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES kol_gov.admin_users(user_id),
  previous_status text NOT NULL,
  next_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
