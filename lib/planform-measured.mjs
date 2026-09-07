// GENERATED FILE - DO NOT EDIT.
// Written by scripts/gen_types.py from api/_core/geometry_ratios.py.
//
// The ACT-1 planform, measured from the plan-view CAD render. Nose at x/L = 0,
// every value a ratio of overall length: the render carries no dimensions, so
// the absolute scale is unknown and overall length is the one dimensional input.
//
// The integrals below are recomputed here in JavaScript rather than copied, and
// PYTHON carries what api/_core produced from the same tables. Two
// implementations that agree by construction are worth more than one that is
// trusted, and tests/test_physics.py asserts they do.

/** Half-span against station. Monotonic, so it inverts to give the leading edge. */
export const HALF_SPAN_BY_STATION = [
  [0.0, 0.0],
  [0.05, 0.045],
  [0.1, 0.059],
  [0.2, 0.08],
  [0.3, 0.099],
  [0.4, 0.127],
  [0.5, 0.179],
  [0.6, 0.243],
  [0.7, 0.306],
  [0.75, 0.337],
  [0.8, 0.351],
  [0.9, 0.36],
  [0.95, 0.361],
];

/** Chord against span fraction. The render's outermost measurement is at 0.96. */
export const CHORD_BY_ETA = [
  [0.0, 0.827],
  [0.2, 0.795],
  [0.4, 0.518],
  [0.6, 0.405],
  [0.8, 0.309],
  [0.96, 0.232],
];

export const SWEEP_FOREBODY_DEG = 77.4;
export const SWEEP_INNER_DEG = 59.0;
export const SWEEP_TIP_DEG = 84.8;
export const CRANK_STATION = 0.78;
export const RADOME_STATION = 0.24;
export const INLET_START = 0.28;
export const INLET_END = 0.45;
export const ENGINE_START = 0.45;
export const ENGINE_END = 0.6;

/** Piecewise-linear with linear extrapolation off the ends. */
function interp(table, x) {
  if (x <= table[0][0]) {
    if (table.length < 2 || x === table[0][0]) return table[0][1];
    const [x0, y0] = table[0];
    const [x1, y1] = table[1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  for (let i = 1; i < table.length; i += 1) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  const [x0, y0] = table[table.length - 2];
  const [x1, y1] = table[table.length - 1];
  return y1 + ((y1 - y0) * (x - x1)) / (x1 - x0);
}

/** Chord at span fraction eta, as a fraction of overall length. */
export function chordOverL(eta) {
  return Math.max(0, interp(CHORD_BY_ETA, Math.min(1, Math.max(0, eta))));
}

/** Leading-edge station at span fraction eta, inverting the half-span table. */
export function leStation(eta) {
  const target = eta * (SPAN_OVER_L / 2);
  const t = HALF_SPAN_BY_STATION;
  if (target <= t[0][1]) return t[0][0];
  for (let i = 1; i < t.length; i += 1) {
    const [x0, h0] = t[i - 1];
    const [x1, h1] = t[i];
    if (target <= h1) {
      if (h1 - h0 < 1e-12) return x1;
      return x0 + ((x1 - x0) * (target - h0)) / (h1 - h0);
    }
  }
  return t[t.length - 1][0];
}

/** Midpoint rule over eta from 0 to 1. The same rule api/_core uses. */
function integrate(f, n = 2000) {
  let total = 0;
  const step = 1 / n;
  for (let i = 0; i < n; i += 1) total += f((i + 0.5) * step);
  return total * step;
}

export const SPAN_OVER_L = 2 * Math.max(...HALF_SPAN_BY_STATION.map((r) => r[1]));
export const CHORD_INTEGRAL = integrate(chordOverL);
export const CHORD_SQ_INTEGRAL = integrate((e) => chordOverL(e) ** 2);
export const AREA_OVER_L2 = SPAN_OVER_L * CHORD_INTEGRAL;
export const MAC_OVER_L = (SPAN_OVER_L / AREA_OVER_L2) * CHORD_SQ_INTEGRAL;
export const ASPECT_RATIO = (SPAN_OVER_L * SPAN_OVER_L) / AREA_OVER_L2;

/** What api/_core computed from the same tables, for the cross-check. */
export const PYTHON = {
  SPAN_OVER_L: 0.722,
  AREA_OVER_L2: 0.36776875,
  MAC_OVER_L: 0.591424280367676,
  ASPECT_RATIO: 1.4174233128834355,
};

/**
 * Overall length is the only dimensional input. Everything else is a measured
 * ratio of it, and none of it came from CAD dimensions.
 */
export function deriveGeometry(lengthM) {
  const l = Math.max(1e-6, lengthM);
  return {
    lengthM: l,
    spanM: SPAN_OVER_L * l,
    areaM2: AREA_OVER_L2 * l * l,
    macM: MAC_OVER_L * l,
    aspectRatio: ASPECT_RATIO,
  };
}
