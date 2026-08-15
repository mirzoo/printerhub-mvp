ALTER TABLE devices ADD COLUMN IF NOT EXISTS scanner_state text NOT NULL DEFAULT 'unavailable'
  CHECK (scanner_state IN ('idle','busy','unavailable'));
ALTER TABLE devices ADD COLUMN IF NOT EXISTS scanner_state_reason text;

CREATE TABLE IF NOT EXISTS copy_sessions (
  id uuid PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  status_token_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('collecting','submitted','cancelled','expired')),
  order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_sessions_device_idx ON copy_sessions(device_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS copy_sessions_order_idx ON copy_sessions(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS copy_pages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES copy_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
  status text NOT NULL CHECK (status IN ('queued','scanning','ready','failed','deleted')),
  preview_pathname text,
  pdf_pathname text,
  error_code text CHECK (error_code IN ('SCANNER_UNAVAILABLE','SCANNER_BUSY','SCAN_TIMEOUT','SCAN_FAILED','INVALID_SCAN')),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, position)
);
CREATE INDEX IF NOT EXISTS copy_pages_claim_idx ON copy_pages(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS copy_pages_preview_idx ON copy_pages(preview_pathname) WHERE preview_pathname IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS copy_pages_pdf_idx ON copy_pages(pdf_pathname) WHERE pdf_pathname IS NOT NULL;
