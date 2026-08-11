BEGIN;

CREATE TABLE IF NOT EXISTS kol_gov.activity_categories (
  category_key text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO kol_gov.activity_categories (category_key, name, sort_order) VALUES
  ('real_estate', 'Bất động sản', 1),
  ('technology', 'Công nghệ', 2),
  ('travel', 'Du lịch', 3),
  ('gaming', 'Game & Thể thao điện tử', 4),
  ('education', 'Giáo dục', 5),
  ('entertainment', 'Giải trí', 6),
  ('business_marketing', 'Kinh doanh, Truyền thông & Marketing', 7)
ON CONFLICT (category_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS kol_gov.registration_applications (
  application_id uuid PRIMARY KEY,
  applicant_type text NOT NULL CHECK (applicant_type IN ('individual', 'organization')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'withdrawn')),
  display_name text NOT NULL,
  nationality text NOT NULL,
  address text NOT NULL,
  phone text,
  email text NOT NULL,
  violation_alert_zalo text NOT NULL,
  avatar_file_name text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_individual_details (
  application_id uuid PRIMARY KEY REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  livestream_cert_verified boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_organization_details (
  application_id uuid PRIMARY KEY REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  business_license_no text NOT NULL,
  license_issued_at date NOT NULL,
  license_issued_by text NOT NULL,
  legal_representative text NOT NULL
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_application_categories (
  application_id uuid NOT NULL REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  category_key text NOT NULL REFERENCES kol_gov.activity_categories(category_key),
  PRIMARY KEY (application_id, category_key)
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_channels (
  channel_id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  platform text NOT NULL,
  channel_name text NOT NULL,
  channel_url text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_declarations (
  application_id uuid PRIMARY KEY REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  accuracy_confirmed boolean NOT NULL,
  terms_confirmed boolean NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_gov.registration_reviews (
  review_id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES kol_gov.registration_applications(application_id) ON DELETE CASCADE,
  previous_status text,
  next_status text NOT NULL CHECK (next_status IN ('in_review', 'approved', 'rejected', 'withdrawn')),
  reviewer_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_applications_status ON kol_gov.registration_applications (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_applications_email ON kol_gov.registration_applications (email);
CREATE INDEX IF NOT EXISTS idx_registration_channels_application ON kol_gov.registration_channels (application_id);

COMMIT;
