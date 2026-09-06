/**
 * Application state.
 *
 * The solver owns the physics. This store owns the mission specification, the
 * solved runs, and the playback cursor. It never derives a flight quantity of
 * its own: every number the interface shows is read out of a trajectory column.
 */
"use client";

import { create } from "zustand";
import { feasibility, solve, SolverError, type FeasibilityOptions } from "@/app/api-client";
import * as bc from "./broadcast";
import { indexAt, sampleAt, spliceRun, type Run } from "./playback";
import {
  DEFAULT_MISSION_SPEC,
  type FeasibilityResponse,
  type MissionSpec,
  type ResumeState,
  type ScheduleNode,
} from "./types";

export type CameraPreset = "chase" | "rail" | "side" | "top" | "cockpit" | "orbit";
export const CAMERA_PRESETS: CameraPreset[] = [
  "chase",
  "rail",
  "side",
  "top",
  "cockpit",
  "orbit",
];
export const SPEEDS = [0.25, 1, 2, 10] as const;

export type Status = "idle" | "solving" | "ready" | "error";

interface State {
  spec: MissionSpec;
  run: Run | null;
  ghost: Run | null;
  feas: FeasibilityResponse | null;
  status: Status;
  spliceStatus: "idle" | "solving";
  lastRoundTripMs: number;
  error: string | null;
  errorDetail: string;

  t: number;
  playing: boolean;
  speed: number;
  scrubbing: boolean;

  camera: CameraPreset;
  showGhost: boolean;
  aeroDetached: boolean;
  paramsOpen: boolean;
  fieldMode: string;
  showStreamlines: boolean;

  /** Round-trip times of the last few solves, newest last. Drives the sparkline. */
  roundTrips: number[];
  solveStartedAt: number | null;
  /** Field the interface should scroll to and highlight, set by a diagnostic. */
  focusField: string | null;
  /** Configuration tab to show; a diagnostic can switch it. */
  configTab: "mission" | "launch" | "model";
  collapsed: { left: boolean; right: boolean; track: boolean };
  keymapOpen: boolean;
  diagnosticsOpen: boolean;

  setSpec: (patch: Partial<MissionSpec>) => void;
  setField: (path: string, value: number | boolean | string) => void;
  resetField: (path: string) => void;
  resetSpec: () => void;
  loadSpec: (spec: MissionSpec) => void;

  run_: () => Promise<void>;
  refreshFeasibility: (options?: FeasibilityOptions) => Promise<void>;
  setThrottleAt: (t: number, value: number) => Promise<void>;
  setThrottleSchedule: (nodes: ScheduleNode[]) => void;
  setAltitudeSchedule: (nodes: ScheduleNode[] | null) => void;

  setT: (t: number) => void;
  advance: (dt: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (s: number) => void;
  setScrubbing: (v: boolean) => void;

  setCamera: (c: CameraPreset) => void;
  setFieldMode: (m: string) => void;
  setShowStreamlines: (v: boolean) => void;
  focusOn: (path: string | null) => void;
  setConfigTab: (t: "mission" | "launch" | "model") => void;
  toggleCollapsed: (which: "left" | "right" | "track") => void;
  setKeymapOpen: (v: boolean) => void;
  setDiagnosticsOpen: (v: boolean) => void;
  promoteToGhost: () => void;
  clearGhost: () => void;
  setAeroDetached: (v: boolean) => void;
  setParamsOpen: (v: boolean) => void;
  connectBroadcast: () => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Read or write a dotted path inside the spec, e.g. "launch.booster.thrust_n". */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = node[parts[i]] as Record<string, unknown>;
    if (!node) return;
  }
  node[parts[parts.length - 1]] = value;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
    obj,
  );
}

/** Insert or replace a schedule breakpoint at `t`, keeping the nodes ordered. */
export function writeNode(nodes: ScheduleNode[], t: number, value: number): ScheduleNode[] {
  const eps = 1e-3;
  const out = nodes.filter((n) => Math.abs(n.t - t) > eps);
  out.push({ t, value });
  out.sort((a, b) => a.t - b.t);
  return out;
}

let feasTimer: ReturnType<typeof setTimeout> | null = null;
let feasAbort: AbortController | null = null;
let channel: BroadcastChannel | null = null;

/**
 * Open the shared channel and answer detached windows.
 *
 * A window opened after a solve has missed the broadcast, so it announces
 * itself with `hello` and whoever holds a run replies with it. A
 * BroadcastChannel never delivers a sender its own message, so this cannot loop.
 */
function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  channel = bc.open();
  if (!channel) return null;
  channel.onmessage = (ev: MessageEvent<bc.Message>) => {
    if (ev.data?.kind !== "hello") return;
    const s = useSim.getState();
    if (!s.run || !channel) return;
    channel.postMessage({ kind: "run", payload: bc.serialiseRun(s.run) } satisfies bc.Message);
    channel.postMessage({
      kind: "cursor",
      t: s.t,
      playing: s.playing,
      speed: s.speed,
    } satisfies bc.Message);
  };
  return channel;
}

function publishCursor(t: number, playing: boolean, speed: number): void {
  ensureChannel()?.postMessage({ kind: "cursor", t, playing, speed } satisfies bc.Message);
}

function publishRun(run: Run | null): void {
  ensureChannel()?.postMessage({
    kind: "run",
    payload: run ? bc.serialiseRun(run) : null,
  } satisfies bc.Message);
}

export const useSim = create<State>((set, get) => ({
  spec: clone(DEFAULT_MISSION_SPEC),
  run: null,
  ghost: null,
  feas: null,
  status: "idle",
  spliceStatus: "idle",
  lastRoundTripMs: 0,
  error: null,
  errorDetail: "",

  t: 0,
  playing: false,
  speed: 1,
  scrubbing: false,

  camera: "chase",
  showGhost: true,
  aeroDetached: false,
  paramsOpen: false,
  fieldMode: "cp",
  showStreamlines: true,

  roundTrips: [],
  solveStartedAt: null,
  focusField: null,
  configTab: "mission",
  collapsed: { left: false, right: false, track: false },
  keymapOpen: false,
  diagnosticsOpen: false,

  setSpec: (patch) => {
    set({ spec: { ...get().spec, ...patch } });
    void get().refreshFeasibility();
  },

  setField: (path, value) => {
    const spec = clone(get().spec) as unknown as Record<string, unknown>;
    setPath(spec, path, value);
    set({ spec: spec as unknown as MissionSpec });
    void get().refreshFeasibility();
  },

  resetField: (path) => {
    const spec = clone(get().spec) as unknown as Record<string, unknown>;
    setPath(spec, path, getPath(DEFAULT_MISSION_SPEC, path));
    set({ spec: spec as unknown as MissionSpec });
    void get().refreshFeasibility();
  },

  resetSpec: () => {
    set({ spec: clone(DEFAULT_MISSION_SPEC), run: null, t: 0, playing: false, error: null });
    publishRun(null);
    void get().refreshFeasibility();
  },

  loadSpec: (spec) => {
    set({ spec: clone(spec), run: null, t: 0, playing: false, error: null });
    publishRun(null);
    void get().refreshFeasibility();
  },

  run_: async () => {
    set({ status: "solving", error: null, errorDetail: "", solveStartedAt: Date.now() });
    try {
      const run = await solve(get().spec, { label: get().spec.label });
      set({
        run,
        status: "ready",
        t: run.t0,
        playing: false,
        lastRoundTripMs: run.roundTripMs,
        roundTrips: [...get().roundTrips, run.roundTripMs].slice(-3),
        solveStartedAt: null,
        error: null,
      });
      publishRun(run);
      publishCursor(run.t0, false, get().speed);
    } catch (err) {
      const e = err as SolverError;
      set({
        status: "error",
        solveStartedAt: null,
        error: e.message ?? String(err),
        errorDetail: e.detail ?? "",
      });
    }
  },

  /** Debounced: a slider drag fires this on every frame, and the answer is only
   *  worth having once the operator pauses. */
  refreshFeasibility: async (options) => {
    if (feasTimer !== null) clearTimeout(feasTimer);
    feasAbort?.abort();
    return new Promise<void>((resolve) => {
      feasTimer = setTimeout(async () => {
        feasTimer = null;
        const ctrl = new AbortController();
        feasAbort = ctrl;
        try {
          const feas = await feasibility(get().spec, options ?? {}, ctrl.signal);
          set({ feas });
        } catch {
          /* the sizing preview is advisory; a failure here must not block RUN */
        } finally {
          if (feasAbort === ctrl) feasAbort = null;
          resolve();
        }
      }, 90);
    });
  },

  /**
   * Interactive throttle change at playback time `t`.
   *
   * Writes a breakpoint into the throttle schedule, re-solves from the state at
   * `t` rather than from the rail, and splices the new tail onto the flight
   * already flown. Only the remainder is integrated, so the round trip stays
   * short enough to feel live.
   */
  setThrottleAt: async (t, value) => {
    const { run, spec } = get();
    if (!run) return;
    const nodes = run.resolved?.throttle_schedule ?? spec.control.throttle_schedule ?? [];
    const next = writeNode(nodes, Math.max(0, t), Math.min(1, Math.max(0, value)));
    const nextSpec: MissionSpec = {
      ...spec,
      control: { ...spec.control, throttle_schedule: next },
      mission: {
        ...spec.mission,
        auto_profile: false,
        descent_start_s: run.resolved.plan.t_descent_start_s,
        duration_s: run.resolved.plan.duration_s,
      },
    };
    if (!nextSpec.control.altitude_schedule) {
      nextSpec.control = { ...nextSpec.control, altitude_schedule: run.resolved.altitude_schedule };
    }

    const s = sampleAt(run, t);
    const resume: ResumeState = {
      t: run.cols.t ? run.cols.t[indexAt(run, t)] : t,
      v_tas_ms: s.v_tas_ms,
      gamma_deg: s.gamma_deg,
      h_m: s.h_m,
      x_m: s.x_m,
      y_m: s.y_m,
      s_ground_m: s.s_ground_m,
      fuel_kg: s.fuel_kg,
      throttle_act: s.throttle_act,
      psi_deg: s.psi_deg,
    };
    set({ spec: nextSpec, spliceStatus: "solving" });
    try {
      const tail = await solve(nextSpec, { resume, label: nextSpec.label });
      const merged = spliceRun(run, tail, resume.t);
      set({
        run: merged,
        spliceStatus: "idle",
        lastRoundTripMs: tail.roundTripMs,
        roundTrips: [...get().roundTrips, tail.roundTripMs].slice(-3),
        error: null,
      });
      publishRun(merged);
    } catch (err) {
      const e = err as SolverError;
      set({ spliceStatus: "idle", error: e.message ?? String(err), errorDetail: e.detail ?? "" });
    }
  },

  setThrottleSchedule: (nodes) => {
    const spec = get().spec;
    set({ spec: { ...spec, control: { ...spec.control, throttle_schedule: nodes } } });
  },

  setAltitudeSchedule: (nodes) => {
    const spec = get().spec;
    set({ spec: { ...spec, control: { ...spec.control, altitude_schedule: nodes } } });
  },

  setT: (t) => {
    const run = get().run;
    const clamped = run ? Math.min(run.t1, Math.max(run.t0, t)) : 0;
    set({ t: clamped });
    publishCursor(clamped, get().playing, get().speed);
  },

  advance: (dt) => {
    const { run, t, playing, speed } = get();
    if (!run || !playing) return;
    const next = t + dt * speed;
    if (next >= run.t1) {
      set({ t: run.t1, playing: false });
      publishCursor(run.t1, false, speed);
      return;
    }
    set({ t: next });
    publishCursor(next, true, speed);
  },

  play: () => {
    const { run, t } = get();
    if (!run) return;
    set({ playing: true, t: t >= run.t1 - 1e-6 ? run.t0 : t });
    publishCursor(get().t, true, get().speed);
  },
  pause: () => {
    set({ playing: false });
    publishCursor(get().t, false, get().speed);
  },
  toggle: () => (get().playing ? get().pause() : get().play()),
  setSpeed: (s) => {
    set({ speed: s });
    publishCursor(get().t, get().playing, s);
  },
  setScrubbing: (v) => set({ scrubbing: v }),

  setCamera: (c) => set({ camera: c }),
  setFieldMode: (m) => set({ fieldMode: m }),
  setShowStreamlines: (v) => set({ showStreamlines: v }),
  focusOn: (path) => set({ focusField: path }),
  setConfigTab: (t) => set({ configTab: t }),
  toggleCollapsed: (which) =>
    set({ collapsed: { ...get().collapsed, [which]: !get().collapsed[which] } }),
  setKeymapOpen: (v) => set({ keymapOpen: v }),
  setDiagnosticsOpen: (v) => set({ diagnosticsOpen: v }),
  promoteToGhost: () => {
    const run = get().run;
    if (run) set({ ghost: { ...run, label: `${run.label} (ref)` }, showGhost: true });
  },
  clearGhost: () => set({ ghost: null }),
  connectBroadcast: () => {
    ensureChannel();
  },
  setAeroDetached: (v) => set({ aeroDetached: v }),
  setParamsOpen: (v) => set({ paramsOpen: v }),
}));
