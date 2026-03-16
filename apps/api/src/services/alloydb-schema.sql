-- AlloyDB Schema for Content Storyteller
-- Three-Tier Storage Architecture: AlloyDB (relational metadata) + Firestore (real-time state) + Cloud Storage (file payloads)

-- Users and Projects
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs
CREATE TABLE jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id),
  user_id UUID REFERENCES users(user_id),
  correlation_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'queued',
  platform VARCHAR(50),
  tone VARCHAR(50),
  output_preference VARCHAR(50) DEFAULT 'auto',
  prompt_text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets (core table)
CREATE TABLE assets (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id),
  job_id UUID REFERENCES jobs(job_id) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  mime_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  signed_url TEXT,
  public_url TEXT,
  preview_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  source_model VARCHAR(100),
  generation_prompt TEXT,
  derived_from_asset_id UUID REFERENCES assets(asset_id),
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(10,2),
  file_size_bytes BIGINT,
  checksum VARCHAR(128),
  is_fallback BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_job_id ON assets(job_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_status ON assets(status);

-- Asset Versions (for re-generation tracking)
CREATE TABLE asset_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(asset_id) NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  checksum VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packages
CREATE TABLE packages (
  package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(job_id) NOT NULL,
  storage_path TEXT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE package_assets (
  package_id UUID REFERENCES packages(package_id),
  asset_id UUID REFERENCES assets(asset_id),
  filename_in_zip VARCHAR(255),
  PRIMARY KEY (package_id, asset_id)
);

-- Trend Reports
CREATE TABLE trend_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT,
  platform VARCHAR(50),
  domain VARCHAR(100),
  region VARCHAR(50),
  results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Live Agent Sessions (durable records)
CREATE TABLE live_agent_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  extracted_direction JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE live_agent_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_agent_sessions(session_id) NOT NULL,
  role VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generation Events (audit trail)
CREATE TABLE generation_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(job_id),
  stage VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool Invocations (Live Agent tool usage)
CREATE TABLE tool_invocations (
  invocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_agent_sessions(session_id),
  tool_name VARCHAR(100) NOT NULL,
  input_params JSONB,
  output_result JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
