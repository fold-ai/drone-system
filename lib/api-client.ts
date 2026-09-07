/**
 * Transport to the Python solver.
 *
 * One shape of call in development and in production: `next dev` rewrites
 * /api/* to scripts/dev_api.py, Vercel serves the same paths as Python
 * serverless functions.
 */
import type {
  ApiError,
  FeasibilityResponse,
  MissionSpec,
  ResumeState,
  SimulationResponse,
  StudyOp,
  StudyResponse,
} from "@/lib/types";
import { type Run, toRun } from "@/lib/playback";

export class SolverError extends Error {
  detail: string;
  constructor(message: string, detail = "") {
    super(message);
    this.name = "SolverError";
    this.detail = detail;
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SolverError(
      `Solver returned ${res.status} with a non-JSON body`,
      text.slice(0, 400),
    );
  }
  if (!res.ok || (parsed as ApiError).ok === false) {
    const err = parsed as ApiError;
    throw new SolverError(err.error ?? `Solver returned ${res.status}`, err.detail ?? "");
  }
  return parsed as T;
}

export interface SolveOptions {
  label?: string;
  resume?: ResumeState | null;
  signal?: AbortSignal;
}

/** Full trajectory solve. Returns the decoded run and the wall-clock round trip. */
export async function solve(spec: MissionSpec, opts: SolveOptions = {}): Promise<Run> {
  const t0 = performance.now();
  const payload: MissionSpec = opts.resume ? { ...spec, resume: opts.resume } : { ...spec, resume: null };
  const res = await post<SimulationResponse>("/api/simulate", payload, opts.signal);
  const run = await toRun(res, opts.label ?? spec.label, performance.now() - t0);
  return run;
}

export interface FeasibilityOptions {
  solve_booster?: boolean;
  rail_trade?: boolean;
  rail_lengths?: number[];
  sweep_altitude_m?: number;
  sweep_mass_kg?: number;
  target_margin?: number;
}

/**
 * Airframe study.
 *
 * Results are cached by the exact request, because a sweep costs hundreds of
 * solves and the study page re-renders far more often than its inputs change.
 * The cache is per session and bounded; it holds analysis, not state.
 */
const studyCache = new Map<string, StudyResponse>();
const STUDY_CACHE_LIMIT = 40;

export function studyCacheKey(spec: MissionSpec, op: StudyOp, args: unknown): string {
  return JSON.stringify({ op, args, spec: { ...spec, resume: null } });
}

export function peekStudy(key: string): StudyResponse | undefined {
  return studyCache.get(key);
}

export async function study(
  spec: MissionSpec,
  op: StudyOp,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<StudyResponse> {
  const key = studyCacheKey(spec, op, args);
  const hit = studyCache.get(key);
  if (hit) return hit;
  const res = await post<StudyResponse>("/api/study", { ...spec, resume: null, op, args }, signal);
  if (studyCache.size >= STUDY_CACHE_LIMIT) {
    const oldest = studyCache.keys().next().value;
    if (oldest !== undefined) studyCache.delete(oldest);
  }
  studyCache.set(key, res);
  return res;
}

/** Sizing, launch feasibility and the performance envelope, with no trajectory
 *  integration. Fast enough to call while a slider is moving. */
export async function feasibility(
  spec: MissionSpec,
  options: FeasibilityOptions = {},
  signal?: AbortSignal,
): Promise<FeasibilityResponse> {
  return post<FeasibilityResponse>("/api/feasibility", { ...spec, resume: null, options }, signal);
}
