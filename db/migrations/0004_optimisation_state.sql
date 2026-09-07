-- Resumable search state.
--
-- A few thousand evaluations take longer than any request may run, so the
-- search is a job: each call advances it by a batch and writes the state back.
-- Differential evolution's entire state is a population and its fitnesses,
-- which is why it was chosen over CMA-ES - that serialises to JSON exactly,
-- where a covariance matrix and step-size controller do not.

ALTER TABLE optimisations
  ADD COLUMN state_json jsonb,
  ADD COLUMN population integer NOT NULL DEFAULT 24,
  ADD COLUMN seed integer NOT NULL DEFAULT 0,
  ADD COLUMN base_spec_json jsonb,
  ADD COLUMN weights_json jsonb,
  ADD COLUMN feasible_evals integer NOT NULL DEFAULT 0;

-- Every evaluation is recorded, so a search can be audited after the fact. The
-- run table gets one row per evaluation, and this is how they are found.
CREATE INDEX runs_optimisation_objective ON runs (optimisation_id)
  WHERE optimisation_id IS NOT NULL;
