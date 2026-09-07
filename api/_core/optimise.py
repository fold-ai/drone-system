"""Design search.

Search and interpretation are different jobs and this module only does the
first. It proposes designs, evaluates each one with the real solver, and reports
what it found. It never decides anything: the objective and the constraints come
in from the caller and the numbers come out.

Differential evolution rather than CMA-ES, for one reason that matters here: a
serverless function cannot hold a search in memory for the twenty minutes a few
thousand evaluations take, so the search has to be resumable across calls, and
DE's entire state is a population and its fitnesses. That serialises to JSON
exactly. CMA-ES carries a covariance matrix and step-size controller whose
pickled state is version-fragile, which is the wrong thing to be storing in a
database between HTTP requests.

Every evaluation is a real solver call through _core.study.metrics, which is the
sizing model rather than a surrogate: an integrated climb, a Breguet cruise, a
rail integration and the closed-form polar. A full trajectory integration is
about thirty times the cost and buys nothing the objective reads.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import random
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from .constants import SOLVER_VERSION
from .planform import GeometryMismatch
from .schema import MissionSpec, from_dict, to_dict
from .study import metrics, read_param, write_param


# --------------------------------------------------------------------------
# The design vector, declared
# --------------------------------------------------------------------------

@dataclass
class DesignVariable:
    key: str
    label: str
    unit: str
    lo: float
    hi: float
    #: Dotted MissionSpec path, or a virtual key handled by apply().
    path: str
    note: str = ""


DESIGN_VARIABLES: Tuple[DesignVariable, ...] = (
    DesignVariable("length_m", "Overall length", "m", 1.2, 3.2, "airframe.length_m",
                   "The only dimensional input; span and area follow as measured ratios"),
    DesignVariable("aspect_ratio", "Aspect ratio", "", 1.0, 8.0, "virtual.aspect_ratio",
                   "At constant reference area, by re-lofting the measured planform: "
                   "span times the stretch, chords divided by it"),
    DesignVariable("cd0_sub", "Parasite drag CD0", "", 0.012, 0.040, "airframe.cd0_sub"),
    DesignVariable("mach_dd", "Drag divergence Mach", "M", 0.60, 0.92, "airframe.mach_dd"),
    DesignVariable("oswald_e", "Oswald efficiency", "", 0.55, 0.95, "airframe.oswald_e"),
    DesignVariable("mass_payload_kg", "Payload", "kg", 0.0, 3.0, "airframe.mass_payload_kg"),
    DesignVariable("fuel_capacity_kg", "Tank capacity", "kg", 0.5, 6.0,
                   "airframe.fuel_capacity_kg"),
    DesignVariable("rail_length_m", "Rail length", "m", 1.5, 10.0, "launch.rail_length_m"),
    DesignVariable("booster_impulse_ns", "Booster impulse", "N s", 0.0, 900.0,
                   "virtual.booster_impulse",
                   "Applied at the burn time already in the specification, so impulse "
                   "sets thrust"),
)

VARIABLES_BY_KEY = {v.key: v for v in DESIGN_VARIABLES}


def apply_vector(base: MissionSpec, values: Dict[str, float]) -> MissionSpec:
    """Build a specification from a design vector. Pure: `base` is not touched."""
    spec = copy.deepcopy(base)
    for key, value in values.items():
        var = VARIABLES_BY_KEY.get(key)
        if var is None:
            continue
        if var.path == "virtual.aspect_ratio":
            # Aspect ratio is a measured property of the drawn shape, so asking
            # for another one means re-lofting it. AR goes as stretch squared.
            from .geometry_ratios import ASPECT_RATIO
            spec.airframe.planform.span_stretch = math.sqrt(
                max(1e-6, value / ASPECT_RATIO))
        elif var.path == "virtual.booster_impulse":
            burn = max(0.02, spec.launch.booster.burn_time_s)
            spec.launch.booster.thrust_n = max(0.0, value) / burn
            spec.launch.booster.enabled = value > 1.0
        else:
            write_param(spec, var.path, value)
    # Span, area, mean chord and all six balance stations follow from length
    # and the stretch, so they are re-derived together. Clearing only the first
    # three leaves the mass stations at the previous length and quietly reports
    # a static margin for an aircraft that was never built.
    spec.airframe.rescale()
    return spec


def read_vector(spec: MissionSpec) -> Dict[str, float]:
    from .geometry_ratios import ASPECT_RATIO
    out: Dict[str, float] = {}
    for v in DESIGN_VARIABLES:
        if v.path == "virtual.aspect_ratio":
            k = spec.airframe.planform.span_stretch
            out[v.key] = ASPECT_RATIO * k * k
        elif v.path == "virtual.booster_impulse":
            out[v.key] = spec.launch.booster.thrust_n * spec.launch.booster.burn_time_s
        else:
            out[v.key] = read_param(spec, v.path)
    return out


# --------------------------------------------------------------------------
# Objectives and constraints
# --------------------------------------------------------------------------

OBJECTIVES = {
    "range_km": ("Maximum range", "km", 1.0),
    "endurance_s": ("Endurance", "s", 1.0),
    "ld_max": ("L/D max", "", 1.0),
}


@dataclass
class ConstraintSpec:
    exit_margin_min: float = 1.15
    static_margin_min: float = 0.03
    fuel_capacity_max_kg: float = 6.0
    n_max: float = 4.0
    cl_max_fraction: float = 0.90
    max_length_m: float = 3.2


@dataclass
class Evaluation:
    values: Dict[str, float]
    spec_hash: str
    objective: float
    penalised: float
    feasible: bool
    violations: List[str]
    range_km: float
    endurance_s: float
    ld_max: float
    max_level_mach: float
    fuel_required_kg: float
    exit_margin: float
    min_static_margin: float
    error: Optional[str] = None


# A design that cannot be built at all. Finite, because this value is written
# to Postgres and returned as JSON, and because the search compares against it:
# an infinite score would make a rejected candidate beat every real one.
REJECTED = -1.0e9


def spec_hash(spec: MissionSpec) -> str:
    blob = json.dumps(to_dict(spec, ndigits=8), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


def evaluate(base: MissionSpec, values: Dict[str, float], objective: str,
             weights: Optional[Dict[str, float]], cons: ConstraintSpec) -> Evaluation:
    """One real solver call, with the constraint violations reported rather than
    hidden inside a penalty the caller cannot see."""
    spec = apply_vector(base, values)
    try:
        m = metrics(spec, full=True)
    except GeometryMismatch as exc:
        return Evaluation(values, spec_hash(spec), REJECTED, REJECTED, False,
                          ["geometry"], 0, 0, 0, 0, 0, 0, 0, str(exc))

    if weights:
        total = sum(abs(w) for w in weights.values()) or 1.0
        raw = sum(
            w * _normalised(k, getattr(m, k, 0.0)) for k, w in weights.items()
        ) / total
    else:
        raw = float(getattr(m, objective, 0.0))

    violations: List[str] = []
    penalty = 0.0
    if m.exit_margin < cons.exit_margin_min:
        violations.append("rail exit")
        penalty += (cons.exit_margin_min - m.exit_margin) / max(1e-6, cons.exit_margin_min)
    if m.min_static_margin < cons.static_margin_min:
        violations.append("static margin")
        penalty += (cons.static_margin_min - m.min_static_margin) / max(
            1e-6, cons.static_margin_min)
    if m.fuel_required_kg > spec.airframe.fuel_capacity_kg:
        violations.append("tank volume")
        penalty += (m.fuel_required_kg - spec.airframe.fuel_capacity_kg) / max(
            1e-6, spec.airframe.fuel_capacity_kg)
    if m.cruise_cl_fraction > cons.cl_max_fraction:
        violations.append("cruise CL against CL_max")
        penalty += m.cruise_cl_fraction - cons.cl_max_fraction

    # A death penalty would make the landscape flat outside the feasible set and
    # give the search nothing to follow back in. This is proportional, so an
    # infeasible design still knows which way is better.
    penalised = raw - abs(raw if raw else 1.0) * penalty - penalty
    if not math.isfinite(raw) or not math.isfinite(penalised):
        # A degenerate design that produced a non-finite metric is rejected
        # rather than propagated: neither JSON nor jsonb can hold it, and a NaN
        # compares false against everything, which would quietly freeze the
        # population member it landed on.
        violations = violations + ["non-finite result"]
        raw = penalised = REJECTED
    return Evaluation(
        values=values, spec_hash=spec_hash(spec), objective=raw, penalised=penalised,
        feasible=not violations, violations=violations,
        range_km=m.range_km, endurance_s=m.endurance_s, ld_max=m.ld_max,
        max_level_mach=m.max_level_mach, fuel_required_kg=m.fuel_required_kg,
        exit_margin=m.exit_margin, min_static_margin=m.min_static_margin,
    )


def _normalised(key: str, value: float) -> float:
    """Rough scaling so a weighted mix is not dominated by whichever metric has
    the largest units."""
    scale = {"range_km": 100.0, "endurance_s": 1200.0, "ld_max": 10.0,
             "max_level_mach": 1.0}.get(key, 1.0)
    return value / scale


# --------------------------------------------------------------------------
# Differential evolution, resumable
# --------------------------------------------------------------------------

@dataclass
class SearchState:
    keys: List[str]
    lo: List[float]
    hi: List[float]
    population: List[List[float]]
    # None means "not scored yet". Infinity is not JSON and is not jsonb
    # either, and this state is written to Postgres between batches, so the
    # sentinel has to be something both can hold.
    fitness: List[Optional[float]]
    generation: int = 0
    evaluations: int = 0
    best_x: List[float] = field(default_factory=list)
    best_fitness: Optional[float] = None
    seed: int = 0
    f: float = 0.7          # differential weight
    cr: float = 0.9         # crossover probability
    done: bool = False


def init_state(keys: Sequence[str], population: int = 24, seed: int = 0) -> SearchState:
    rng = random.Random(seed)
    lo = [VARIABLES_BY_KEY[k].lo for k in keys]
    hi = [VARIABLES_BY_KEY[k].hi for k in keys]
    pop = [[rng.uniform(lo[j], hi[j]) for j in range(len(keys))] for _ in range(population)]
    return SearchState(keys=list(keys), lo=lo, hi=hi, population=pop,
                       fitness=[None] * population, seed=seed)


def step(state: SearchState, base: MissionSpec, objective: str,
         weights: Optional[Dict[str, float]], cons: ConstraintSpec,
         budget: int, deadline_s: float) -> Tuple[SearchState, List[Evaluation]]:
    """Advance the search by up to `budget` evaluations or until `deadline_s`.

    Returns the new state and every evaluation performed, so the caller can
    write all of them to the run table. Nothing is discarded: a search whose
    rejected candidates are not recorded cannot be audited afterwards.
    """
    rng = random.Random(state.seed * 1_000_003 + state.generation)
    started = time.perf_counter()
    out: List[Evaluation] = []
    n = len(state.population)
    d = len(state.keys)

    def as_dict(x: Sequence[float]) -> Dict[str, float]:
        return {k: x[i] for i, k in enumerate(state.keys)}

    # First pass: score the initial population.
    for i in range(n):
        if state.fitness[i] is not None:
            continue
        if len(out) >= budget or time.perf_counter() - started > deadline_s:
            return state, out
        ev = evaluate(base, as_dict(state.population[i]), objective, weights, cons)
        out.append(ev)
        state.fitness[i] = ev.penalised
        state.evaluations += 1
        if state.best_fitness is None or ev.penalised > state.best_fitness:
            state.best_fitness = ev.penalised
            state.best_x = list(state.population[i])

    while len(out) < budget and time.perf_counter() - started < deadline_s:
        for i in range(n):
            if len(out) >= budget or time.perf_counter() - started > deadline_s:
                break
            # rand/1/bin
            a, b, c = rng.sample([j for j in range(n) if j != i], 3)
            jrand = rng.randrange(d)
            trial = []
            for j in range(d):
                if j == jrand or rng.random() < state.cr:
                    v = state.population[a][j] + state.f * (
                        state.population[b][j] - state.population[c][j])
                else:
                    v = state.population[i][j]
                trial.append(min(state.hi[j], max(state.lo[j], v)))
            ev = evaluate(base, as_dict(trial), objective, weights, cons)
            out.append(ev)
            state.evaluations += 1
            incumbent = state.fitness[i]
            if incumbent is None or ev.penalised >= incumbent:
                state.population[i] = trial
                state.fitness[i] = ev.penalised
                if state.best_fitness is None or ev.penalised > state.best_fitness:
                    state.best_fitness = ev.penalised
                    state.best_x = list(trial)
        state.generation += 1

    return state, out


def state_to_json(state: SearchState) -> Dict[str, Any]:
    return asdict(state)


def state_from_json(raw: Dict[str, Any]) -> SearchState:
    return SearchState(**raw)


def best_vector(state: SearchState) -> Dict[str, float]:
    if not state.best_x:
        return {}
    return {k: state.best_x[i] for i, k in enumerate(state.keys)}


SEARCH_VERSION = f"de-1.0/solver-{SOLVER_VERSION}"
