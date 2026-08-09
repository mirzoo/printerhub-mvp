CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  token_hash text NOT NULL,
  cups_queue text NOT NULL,
  last_seen timestamptz,
  print_mode text CHECK (print_mode IN ('dry-run','real')),
  printer_state text NOT NULL DEFAULT 'unavailable' CHECK (printer_state IN ('idle','processing','stopped','unavailable')),
  printer_state_reasons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  status text NOT NULL CHECK (status IN ('queued','claimed','printing','completed','failed','expired')),
  page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 100),
  copies integer NOT NULL CHECK (copies BETWEEN 1 AND 10),
  blob_pathname text,
  status_token_hash text NOT NULL,
  session_hash text NOT NULL,
  cups_job_id text,
  error_code text,
  lease_expires_at timestamptz,
  cleanup_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS print_jobs_device_queue_idx ON print_jobs(device_id, status, created_at);
CREATE INDEX IF NOT EXISTS print_jobs_session_idx ON print_jobs(session_hash, created_at);

CREATE TABLE IF NOT EXISTS access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_hash text NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_events_rate_idx ON access_events(requester_hash, created_at);
