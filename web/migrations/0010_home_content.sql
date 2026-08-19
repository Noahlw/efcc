-- Migration number: 0010  2026-08-15T18:09:14.000Z
-- Home Content CMS: versioned A/B drafts, publication windows, and audit policy.

CREATE TABLE home_content (
  content_id        TEXT NOT NULL,
  version           INTEGER NOT NULL CHECK (version >= 1),
  template_type     TEXT NOT NULL CHECK (template_type IN ('A', 'B')),
  status            TEXT NOT NULL CHECK (status IN ('Draft', 'Published', 'Archived')),
  publish_mode      TEXT NOT NULL DEFAULT 'immediate'
                    CHECK (publish_mode IN ('immediate', 'scheduled')),
  start_at          TEXT,
  end_at            TEXT,
  title             TEXT,
  summary           TEXT,
  body_markdown     TEXT,
  cta_label         TEXT,
  cta_url           TEXT,
  image_url         TEXT,
  image_alt         TEXT,
  featured_event_id TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL,
  published_by      TEXT,
  published_at      TEXT,
  archived_by       TEXT,
  archived_at       TEXT,
  PRIMARY KEY (content_id, version),
  FOREIGN KEY (featured_event_id) REFERENCES events(event_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (published_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (archived_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX home_content_status_idx
  ON home_content(status, publish_mode, start_at, end_at);
CREATE UNIQUE INDEX home_content_version_idx
  ON home_content(version);
CREATE INDEX home_content_template_updated_idx
  ON home_content(template_type, updated_at DESC);

INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at) VALUES
  ('Admin', 'home.publish', NULL, '2026-08-15T18:09:14.000Z');
