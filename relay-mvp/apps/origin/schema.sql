-- Relay MVP origin schema (durable log + state)

CREATE TABLE IF NOT EXISTS actors (
  actor_id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  public_key_b64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_docs (
  actor_id TEXT PRIMARY KEY REFERENCES actors(actor_id) ON DELETE CASCADE,
  doc JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS state_objects (
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  schema TEXT NOT NULL,
  version INTEGER NOT NULL,
  storage_class TEXT NOT NULL,
  content_class TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (actor_id, object_id)
);

CREATE TABLE IF NOT EXISTS log_events (
  seq BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  target TEXT,
  type TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  prev TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  signature TEXT,
  raw JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS log_events_actor_seq ON log_events (actor_id, seq);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_refs (
  channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
  post_object_id TEXT NOT NULL,
  submitter_actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, post_object_id)
);

CREATE TABLE IF NOT EXISTS labels (
  label_id TEXT PRIMARY KEY,
  issuer_actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  target_object_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT,
  channel_id TEXT REFERENCES channels(channel_id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  raw JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS labels_target ON labels (target_object_id);
CREATE INDEX IF NOT EXISTS labels_channel ON labels (channel_id);

/** Like/reaction rollup for testing; kept in sync with reaction.add / reaction.remove on actor logs. */
CREATE TABLE IF NOT EXISTS reactions (
  reactor_actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
  target_object_id TEXT NOT NULL,
  reaction_kind TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reactor_actor_id, target_object_id, reaction_kind)
);

CREATE INDEX IF NOT EXISTS reactions_target ON reactions (target_object_id);

CREATE INDEX IF NOT EXISTS state_objects_reply_to ON state_objects ((payload->>'reply_to'))
  WHERE schema = 'post' AND deleted = false;
