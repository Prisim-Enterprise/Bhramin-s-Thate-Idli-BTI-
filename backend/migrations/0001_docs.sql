-- One table for everything the dashboard saves today: day entries, ledgers, vouchers, bills.
-- Each row is one record, stored as JSON, with a few columns pulled out for filtering.
CREATE TABLE IF NOT EXISTS docs (
  kind       TEXT NOT NULL,          -- dayEntries | ledgers | manualVouchers | bills
  id         TEXT NOT NULL,
  branch     TEXT,
  date       TEXT,                   -- yyyy-mm-dd
  data       TEXT NOT NULL,          -- the full record as JSON
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS docs_kind_branch_date ON docs (kind, branch, date);

-- Who changed what, for the auditor.
CREATE TABLE IF NOT EXISTS audit_log (
  at     TEXT NOT NULL,
  email  TEXT NOT NULL,
  action TEXT NOT NULL,              -- save | delete | upload
  kind   TEXT NOT NULL,
  id     TEXT NOT NULL
);
