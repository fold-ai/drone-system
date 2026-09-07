-- Operators and login attempts.
--
-- Everything the gate needs and nothing it does not. Passwords are argon2id
-- encoded strings carrying their own parameters, so the cost can be raised
-- later without invalidating existing hashes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE operators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'operator'
                CHECK (role IN ('operator', 'admin', 'readonly')),
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  last_login    timestamptz,
  -- Disabling beats deleting: runs reference their author.
  disabled_at   timestamptz,
  notes         text
);

-- Case-insensitive uniqueness: an operator is one person, not one spelling.
CREATE UNIQUE INDEX operators_email_key ON operators (lower(email));

CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  scope      text NOT NULL CHECK (scope IN ('ip', 'account')),
  identifier text NOT NULL,
  succeeded  boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- The rate limiter counts recent failures per scope and identifier; this is the
-- index that makes that a lookup rather than a scan.
CREATE INDEX login_attempts_recent
  ON login_attempts (scope, identifier, created_at DESC)
  WHERE succeeded = FALSE;
