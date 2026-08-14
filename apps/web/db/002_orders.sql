CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  session_hash text NOT NULL,
  status_token_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('awaiting_payment','paid','printing','completed','failed','expired')),
  payment_status text NOT NULL CHECK (payment_status IN ('pending','paid','failed')),
  copies integer NOT NULL CHECK (copies BETWEEN 1 AND 10),
  color_mode text NOT NULL CHECK (color_mode = 'bw'),
  duplex boolean NOT NULL CHECK (duplex = false),
  paper_size text NOT NULL CHECK (paper_size = 'A4'),
  selected_page_count integer NOT NULL CHECK (selected_page_count BETWEEN 1 AND 100),
  total_price_minor integer NOT NULL CHECK (total_price_minor >= 0),
  currency text NOT NULL CHECK (currency = 'TJS'),
  print_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_session_idx ON orders(session_hash, created_at);
CREATE INDEX IF NOT EXISTS orders_device_idx ON orders(device_id, status, created_at);

CREATE TABLE IF NOT EXISTS order_documents (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  blob_pathname text,
  page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 100),
  selected_pages integer[] NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE(order_id, position),
  UNIQUE(blob_pathname)
);
CREATE INDEX IF NOT EXISTS order_documents_order_idx ON order_documents(order_id, position);

ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_order_idx ON print_jobs(order_id) WHERE order_id IS NOT NULL;
