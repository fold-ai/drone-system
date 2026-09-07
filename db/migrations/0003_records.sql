-- Test records: airframes, runs, trajectories, bench data, optimisations and
-- AI reviews.
--
-- No ORM. The schema is small and the queries are analytical, and the one
-- decision that matters here is not expressible in an ORM anyway: a trajectory
-- is 18 000 samples across 41 columns, and storing it as rows would be three
-- quarters of a million rows per run. It is stored as the encoded float buffer
-- the solver already produces, in a bytea, exactly as it crosses the wire.

-- --------------------------------------------------------------------------
-- Airframes
-- --------------------------------------------------------------------------

CREATE TABLE airframes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- Overall length is the single dimensional input; span, area and mean chord
  -- are measured ratios of it. Stored alongside the spec so a run can be read
  -- back without reconstructing the geometry.
  length_m      double precision NOT NULL,
  spec_json     jsonb NOT NULL,
  -- Hash of the measured planform tables. When the geometry definition changes,
  -- this changes, and airframes from before are visibly a different shape.
  planform_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  created_by    uuid REFERENCES operators (id),
  -- Derivation, not deletion: an airframe is usually a tweak of another one.
  parent_id     uuid REFERENCES airframes (id),
  notes         text
);

CREATE INDEX airframes_created ON airframes (created_at DESC);
CREATE INDEX airframes_parent ON airframes (parent_id) WHERE parent_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- Runs
-- --------------------------------------------------------------------------

CREATE TABLE runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airframe_id    uuid REFERENCES airframes (id) ON DELETE SET NULL,
  -- Hash of the specification. Identical work is served from here instead of
  -- being recomputed.
  spec_hash      text NOT NULL,
  spec_json      jsonb NOT NULL,
  kind           text NOT NULL DEFAULT 'single'
                 CHECK (kind IN ('single', 'sweep', 'optimisation', 'monte_carlo')),
  name           text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  created_by     uuid REFERENCES operators (id),
  -- Without these the stored history becomes uninterpretable the first time the
  -- physics changes. It changed in the commit before this one: the planform was
  -- remeasured and the reference area moved by a factor of five, so runs either
  -- side of it are not comparable and these columns are how you tell.
  solver_version text NOT NULL,
  git_sha        text,
  wall_ms        integer,
  -- Set when a run came from an optimiser rather than an operator.
  optimisation_id uuid
);

CREATE INDEX runs_airframe_created ON runs (airframe_id, created_at DESC);
CREATE INDEX runs_spec_hash ON runs (spec_hash);
CREATE INDEX runs_created ON runs (created_at DESC);
CREATE INDEX runs_kind ON runs (kind, created_at DESC);

-- --------------------------------------------------------------------------
-- Summaries and diagnostics
-- --------------------------------------------------------------------------

CREATE TABLE run_summary (
  run_id           uuid PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  range_km         double precision,
  endurance_s      double precision,
  ld_max           double precision,
  max_mach         double precision,
  fuel_burn_kg     double precision,
  v_rail_exit_ms   double precision,
  max_load_factor  double precision,
  max_altitude_m   double precision,
  max_q_pa         double precision,
  min_static_margin double precision,
  feasible         boolean NOT NULL DEFAULT TRUE,
  warning_count    integer NOT NULL DEFAULT 0
);

-- The run library sorts by any of these, so they are indexed as a group rather
-- than one by one.
CREATE INDEX run_summary_metrics ON run_summary (feasible, range_km DESC, endurance_s DESC);

CREATE TABLE run_warnings (
  run_id   uuid NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq      integer NOT NULL,
  severity text NOT NULL CHECK (severity IN ('blocking', 'advisory', 'info')),
  code     text,
  message  text NOT NULL,
  t_s      double precision,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE run_events (
  run_id uuid NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq    integer NOT NULL,
  t_s    double precision NOT NULL,
  kind   text NOT NULL,
  label  text NOT NULL,
  detail text,
  PRIMARY KEY (run_id, seq)
);

-- --------------------------------------------------------------------------
-- Trajectories
-- --------------------------------------------------------------------------

CREATE TABLE trajectories (
  run_id       uuid PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  sample_hz    double precision NOT NULL DEFAULT 50,
  column_names text[] NOT NULL,
  -- The shuffled, deflated float32 buffer the solver already produces. Storing
  -- what crosses the wire means no re-encoding on read and no second format to
  -- keep in step.
  payload      bytea NOT NULL,
  encoding     text NOT NULL DEFAULT 'f32-le-shuffle-deflate',
  n_samples    integer NOT NULL,
  bytes        integer NOT NULL,
  -- Retention. Payloads are the only large thing here; a pinned one is never a
  -- candidate for pruning. See the note below.
  pinned       boolean NOT NULL DEFAULT FALSE,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX trajectories_prunable ON trajectories (created_at) WHERE pinned = FALSE;

COMMENT ON COLUMN trajectories.pinned IS
  'Retention policy. Unpinned payloads older than the retention window are '
  'candidates for pruning; pinned ones never are. Nothing deletes automatically '
  'yet, deliberately: the summary, warnings and events survive a pruned payload, '
  'so a pruned run stays readable in the library and only loses its charts. '
  'Pin anything that backs a decision, a validation point or an AI review.';

-- --------------------------------------------------------------------------
-- Bench data: the first thing here that checks the model against reality
-- --------------------------------------------------------------------------

CREATE TABLE bench_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,
  kind        text NOT NULL DEFAULT 'engine' CHECK (kind IN ('engine', 'flight', 'wind_tunnel')),
  recorded_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT NOW(),
  uploaded_by uuid REFERENCES operators (id),
  notes       text,
  csv         bytea NOT NULL,
  column_map  jsonb,
  row_count   integer
);

CREATE INDEX bench_runs_recorded ON bench_runs (recorded_at DESC NULLS LAST);

CREATE TABLE validation_points (
  id            bigserial PRIMARY KEY,
  bench_run_id  uuid NOT NULL REFERENCES bench_runs (id) ON DELETE CASCADE,
  run_id        uuid REFERENCES runs (id) ON DELETE SET NULL,
  quantity      text NOT NULL,
  condition_json jsonb,
  measured      double precision NOT NULL,
  model         double precision NOT NULL,
  residual      double precision NOT NULL,
  unit          text
);

CREATE INDEX validation_points_bench ON validation_points (bench_run_id, quantity);

-- --------------------------------------------------------------------------
-- Optimisation
-- --------------------------------------------------------------------------

CREATE TABLE optimisations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective        text NOT NULL,
  constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  design_vector_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  algorithm        text NOT NULL,
  n_evals          integer NOT NULL DEFAULT 0,
  n_evals_target   integer,
  best_run_id      uuid REFERENCES runs (id) ON DELETE SET NULL,
  best_objective   double precision,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  message          text,
  created_by       uuid REFERENCES operators (id),
  started_at       timestamptz,
  finished_at      timestamptz,
  heartbeat_at     timestamptz,
  airframe_id      uuid REFERENCES airframes (id) ON DELETE SET NULL,
  solver_version   text,
  git_sha          text
);

CREATE INDEX optimisations_status ON optimisations (status, started_at DESC);

ALTER TABLE runs
  ADD CONSTRAINT runs_optimisation_fk
  FOREIGN KEY (optimisation_id) REFERENCES optimisations (id) ON DELETE SET NULL;

CREATE INDEX runs_optimisation ON runs (optimisation_id, created_at)
  WHERE optimisation_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- AI reviews
-- --------------------------------------------------------------------------

CREATE TABLE ai_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid REFERENCES runs (id) ON DELETE CASCADE,
  optimisation_id uuid REFERENCES optimisations (id) ON DELETE CASCADE,
  model           text NOT NULL,
  -- The exact input is hashed so an identical question is not paid for twice,
  -- and so a claim can be traced back to the numbers it was given.
  prompt_hash     text NOT NULL,
  source_json     jsonb NOT NULL,
  response_json   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  created_by      uuid REFERENCES operators (id),
  prompt_tokens   integer,
  completion_tokens integer,
  token_cost      numeric(10, 6),
  CHECK (run_id IS NOT NULL OR optimisation_id IS NOT NULL)
);

CREATE INDEX ai_reviews_run ON ai_reviews (run_id, created_at DESC);
CREATE UNIQUE INDEX ai_reviews_prompt ON ai_reviews (prompt_hash);
