CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS official_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization TEXT NOT NULL,
  url TEXT NOT NULL,
  format TEXT NOT NULL,
  update_frequency TEXT NOT NULL,
  reliability TEXT NOT NULL,
  coverage TEXT NOT NULL,
  key_fields TEXT[] NOT NULL DEFAULT '{}',
  integration_difficulty TEXT NOT NULL,
  expected_impact TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jurisdictions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id TEXT REFERENCES jurisdictions(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  geom GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jurisdictions_geom_gix ON jurisdictions USING GIST (geom);
CREATE INDEX IF NOT EXISTS jurisdictions_priority_ix ON jurisdictions (priority DESC);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  official_source_id TEXT REFERENCES official_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  organization TEXT,
  file_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  jurisdiction_code TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_text TEXT NOT NULL,
  ocr_confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  crop_url TEXT,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS document_pages_document_ix ON document_pages (document_id, page_number);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  search_vector tsvector NOT NULL,
  ocr_confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  jurisdiction_ids TEXT[] NOT NULL DEFAULT '{}',
  crop_url TEXT,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_number, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_search_gix ON document_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS document_chunks_jurisdiction_gix ON document_chunks USING GIN (jurisdiction_ids);
CREATE INDEX IF NOT EXISTS document_chunks_document_ix ON document_chunks (document_id, page_number);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  offense_code TEXT NOT NULL,
  description TEXT NOT NULL,
  state_code TEXT NOT NULL,
  vehicle_class TEXT NOT NULL DEFAULT '*',
  base_fine INTEGER NOT NULL,
  compounding_fine INTEGER NOT NULL DEFAULT 0,
  demerit_points INTEGER NOT NULL DEFAULT 0,
  source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_page_number INTEGER NOT NULL,
  source_clause TEXT NOT NULL,
  effective_date DATE NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'needs-review',
  verification_notes TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rules_state_ix ON rules (state_code, offense_code, vehicle_class, effective_date DESC);
CREATE INDEX IF NOT EXISTS rules_search_gix ON rules USING GIN (to_tsvector('english', description || ' ' || offense_code || ' ' || source_clause));

CREATE TABLE IF NOT EXISTS provenance_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source_page_number INTEGER,
  source_clause TEXT,
  source_url TEXT,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_logs (
  id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  lat NUMERIC,
  lon NUMERIC,
  state_code TEXT,
  answer_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  official_source_id TEXT NOT NULL REFERENCES official_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  document_id TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
