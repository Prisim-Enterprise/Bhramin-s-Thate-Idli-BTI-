-- Company-wide settings set from the Prisim Control Panel (dashboards on/off, role permissions).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,         -- JSON
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Faster activity lists in the Control Panel.
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_email ON audit_log (email, at);
