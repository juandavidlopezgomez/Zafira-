-- ============================================================
-- BattleFlirt — Migración inicial
-- 25 tablas | Versión 1.0 | Marzo 2026
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE (8 tablas)
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(32)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url    TEXT,
  age           SMALLINT,
  is_premium    BOOLEAN      NOT NULL DEFAULT FALSE,
  charisma_pts  INTEGER      NOT NULL DEFAULT 0,
  referral_code VARCHAR(16)  UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         VARCHAR(8)  NOT NULL UNIQUE,
  host_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode         VARCHAR(32) NOT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'waiting'
                           CHECK (status IN ('waiting','active','finished')),
  max_players  SMALLINT    NOT NULL DEFAULT 12,
  is_premium   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE room_players (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    UUID        NOT NULL REFERENCES rooms(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (room_id, user_id)
);

CREATE TABLE game_sessions (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id       UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  mode          VARCHAR(32) NOT NULL,
  state         JSONB       NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  turn_player   UUID        REFERENCES users(id),
  round_number  INTEGER     NOT NULL DEFAULT 1
);

CREATE TABLE interest_matches (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  from_user_id UUID        NOT NULL REFERENCES users(id),
  to_user_id   UUID        NOT NULL REFERENCES users(id),
  -- reveal solo al final si ambos marcaron interés (Regla 1 + 4)
  revealed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, from_user_id, to_user_id)
);

CREATE TABLE charisma_events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  VARCHAR(32) NOT NULL,
  points      INTEGER     NOT NULL,
  session_id  UUID        REFERENCES game_sessions(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE badges (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type  VARCHAR(64) NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE referrals (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     UUID        NOT NULL REFERENCES users(id),
  referred_id     UUID        NOT NULL REFERENCES users(id),
  rewarded        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_id)
);

-- ============================================================
-- LLAMAS — economía virtual (2 tablas)
-- Regla 2: balance SIEMPRE derivado del ledger
-- ============================================================

CREATE TABLE llamas_transactions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER     NOT NULL,  -- positivo = crédito, negativo = débito
  reason      VARCHAR(64) NOT NULL,
  session_id  UUID        REFERENCES game_sessions(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger append-only: prohibir UPDATE y DELETE
CREATE OR REPLACE FUNCTION llamas_transactions_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'llamas_transactions is append-only: % on row %', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER trg_llamas_no_update
  BEFORE UPDATE ON llamas_transactions
  FOR EACH ROW EXECUTE FUNCTION llamas_transactions_immutable();

CREATE TRIGGER trg_llamas_no_delete
  BEFORE DELETE ON llamas_transactions
  FOR EACH ROW EXECUTE FUNCTION llamas_transactions_immutable();

-- Vista materializada para consultas rápidas de balance
CREATE MATERIALIZED VIEW llamas_balances AS
  SELECT user_id, COALESCE(SUM(amount), 0) AS balance
  FROM   llamas_transactions
  GROUP  BY user_id
WITH DATA;

CREATE UNIQUE INDEX ON llamas_balances (user_id);

-- Refrescar la vista tras cada inserción en llamas_transactions
CREATE OR REPLACE FUNCTION refresh_llamas_balances()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY llamas_balances;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refresh_llamas
  AFTER INSERT ON llamas_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_llamas_balances();

-- ============================================================
-- RETOS (2 tablas)
-- ============================================================

CREATE TABLE challenges (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode         VARCHAR(32) NOT NULL,
  category     VARCHAR(32),
  intensity    SMALLINT    NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 5),
  text_es      TEXT        NOT NULL,
  is_premium   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_ai        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dark_challenges (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  intensity   SMALLINT    NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 5),
  text_es     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ARENA (3 tablas)
-- ============================================================

CREATE TABLE arena_stadiums (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  feature     VARCHAR(32) NOT NULL,  -- el_estadio, silla_caliente, etc.
  status      VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','finished')),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ
);

CREATE TABLE arena_events (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  stadium_id   UUID        NOT NULL REFERENCES arena_stadiums(id) ON DELETE CASCADE,
  event_type   VARCHAR(32) NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE arena_votes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  stadium_id   UUID        NOT NULL REFERENCES arena_stadiums(id) ON DELETE CASCADE,
  voter_id     UUID        NOT NULL REFERENCES users(id),
  target_id    UUID        REFERENCES users(id),
  vote_type    VARCHAR(32) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stadium_id, voter_id, vote_type)
);

-- ============================================================
-- EL HILO (4 tablas)
-- ============================================================

CREATE TABLE hilos (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  type        VARCHAR(16) NOT NULL CHECK (type IN ('directo','secreto','anonimo','ardiente')),
  tension     SMALLINT    NOT NULL DEFAULT 1 CHECK (tension BETWEEN 1 AND 5),
  is_premium  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hilo_messages (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id      UUID        NOT NULL REFERENCES hilos(id) ON DELETE CASCADE,
  -- Regla 8: alias_id en lugar de user_id para modo anónimo
  user_id      UUID        REFERENCES users(id),
  alias_id     VARCHAR(32),
  content      TEXT        NOT NULL,
  moderated    BOOLEAN     NOT NULL DEFAULT FALSE,
  rejected     BOOLEAN     NOT NULL DEFAULT FALSE,
  reaction     VARCHAR(16),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR alias_id IS NOT NULL)
);

CREATE TABLE hilo_tension_history (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id     UUID        NOT NULL REFERENCES hilos(id) ON DELETE CASCADE,
  tension     SMALLINT    NOT NULL CHECK (tension BETWEEN 1 AND 5),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hilo_confessions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id     UUID        NOT NULL REFERENCES hilos(id) ON DELETE CASCADE,
  alias_id    VARCHAR(32) NOT NULL,
  content     TEXT        NOT NULL,
  revealed    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAGOS + MODERACIÓN (4 tablas)
-- ============================================================

CREATE TABLE premium_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_sub_id    VARCHAR(128) UNIQUE,
  status           VARCHAR(16) NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','canceled','past_due')),
  plan             VARCHAR(16) NOT NULL CHECK (plan IN ('monthly','annual')),
  current_period_end TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  content      TEXT        NOT NULL,
  result       JSONB       NOT NULL DEFAULT '{}',
  flagged      BOOLEAN     NOT NULL DEFAULT FALSE,
  user_id      UUID        REFERENCES users(id),
  message_id   UUID        REFERENCES hilo_messages(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE beta_codes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(32) NOT NULL UNIQUE,
  used_by     UUID        REFERENCES users(id),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  keys        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- ============================================================
-- GAMIFICACIÓN (2 tablas)
-- ============================================================

CREATE TABLE charisma_ranks (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(32) NOT NULL UNIQUE,
  min_pts    INTEGER     NOT NULL,
  max_pts    INTEGER,
  color_hex  VARCHAR(7)
);

CREATE TABLE epic_moments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID        NOT NULL REFERENCES game_sessions(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  type        VARCHAR(32) NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  votes       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES en todas las Foreign Keys
-- ============================================================

CREATE INDEX idx_rooms_host_id             ON rooms(host_id);
CREATE INDEX idx_room_players_room_id      ON room_players(room_id);
CREATE INDEX idx_room_players_user_id      ON room_players(user_id);
CREATE INDEX idx_game_sessions_room_id     ON game_sessions(room_id);
CREATE INDEX idx_interest_matches_session  ON interest_matches(session_id);
CREATE INDEX idx_interest_matches_from     ON interest_matches(from_user_id);
CREATE INDEX idx_interest_matches_to       ON interest_matches(to_user_id);
CREATE INDEX idx_charisma_events_user      ON charisma_events(user_id);
CREATE INDEX idx_badges_user_id            ON badges(user_id);
CREATE INDEX idx_llamas_txn_user_id        ON llamas_transactions(user_id);
CREATE INDEX idx_llamas_txn_created_at     ON llamas_transactions(created_at);
CREATE INDEX idx_challenges_mode           ON challenges(mode);
CREATE INDEX idx_arena_stadiums_room       ON arena_stadiums(room_id);
CREATE INDEX idx_arena_events_stadium      ON arena_events(stadium_id);
CREATE INDEX idx_arena_votes_stadium       ON arena_votes(stadium_id);
CREATE INDEX idx_hilos_room_id             ON hilos(room_id);
CREATE INDEX idx_hilo_messages_hilo_id     ON hilo_messages(hilo_id);
CREATE INDEX idx_hilo_tension_hilo_id      ON hilo_tension_history(hilo_id);
CREATE INDEX idx_hilo_confessions_hilo_id  ON hilo_confessions(hilo_id);
CREATE INDEX idx_premium_subs_user_id      ON premium_subscriptions(user_id);
CREATE INDEX idx_moderation_logs_user_id   ON moderation_logs(user_id);
CREATE INDEX idx_push_subs_user_id         ON push_subscriptions(user_id);
CREATE INDEX idx_epic_moments_session      ON epic_moments(session_id);
CREATE INDEX idx_epic_moments_user         ON epic_moments(user_id);

-- ============================================================
-- Datos iniciales: rangos de carisma
-- ============================================================

INSERT INTO charisma_ranks (name, min_pts, max_pts, color_hex) VALUES
  ('Frío',        0,    499,  '#6B7280'),
  ('Cálido',      500,  1499, '#F59E0B'),
  ('Ardiente',    1500, 2999, '#F97316'),
  ('En Llamas',   3000, 4999, '#EF4444'),
  ('Legendario',  5000, NULL, '#FF2D55');
