/**
 * Fixed-width number formatting.
 *
 * Every readout reserves the same character count whatever the value, so a
 * digit changing at 50 Hz never shifts the glyphs beside it. Values are padded,
 * never truncated: an out-of-range number gets wider rather than lying.
 */

const NBSP = " "; // figure space - same advance as a digit in tabular fonts

export function fixed(value: number | null | undefined, decimals = 2, width = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return pad("--", width);
  }
  return pad(value.toFixed(decimals), width);
}

export function signed(value: number | null | undefined, decimals = 2, width = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return pad("--", width);
  const s = value.toFixed(decimals);
  return pad(value >= 0 ? `+${s}` : s, width);
}

export function pad(s: string, width: number): string {
  return width > s.length ? NBSP.repeat(width - s.length) + s : s;
}

/** Seconds as t+MMM.S, the clock used across the timeline and the events list. */
export function clock(t: number): string {
  if (!Number.isFinite(t)) return "t+---.-";
  const sign = t < 0 ? "-" : "+";
  const a = Math.abs(t);
  return `t${sign}${a.toFixed(1).padStart(5, "0")}`;
}

export function metres(v: number, decimals = 0): string {
  return fixed(v, decimals);
}

/** Compact SI-ish rendering for values that span decades, e.g. Reynolds number. */
export function sci(value: number, digits = 3): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mant = value / 10 ** exp;
  return `${mant.toFixed(digits - 1)}e${exp >= 0 ? "+" : "-"}${String(Math.abs(exp)).padStart(2, "0")}`;
}

export function kilo(value: number, decimals = 2): string {
  return fixed(value / 1000, decimals);
}

export function pct(value: number, decimals = 1): string {
  return fixed(value * 100, decimals);
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--:--";
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}
