/**
 * Checking that a review only cites numbers it was given.
 *
 * The model is asked to explain results, not to produce them. That instruction
 * is not enforceable by asking politely, so every numeric literal in its output
 * is extracted and looked for in the source JSON it was handed. Anything that is
 * not there is flagged, and the interface shows the flag next to the text.
 *
 * Matching is loose in the ways that are legitimate - rounding, thousands
 * separators, a fraction quoted as a percentage - and strict about everything
 * else. A false flag is cheap; a fabricated number presented as computed is not.
 */

export interface NumberCheck {
  text: string;
  value: number;
  found: boolean;
  nearest?: number;
}

/** Ordinals and counts, not claims about the aircraft. */
const SKIP = new Set([0, 1, 2, 3, 100]);

export function collectSourceNumbers(source: unknown, out: Set<number> = new Set()): Set<number> {
  const add = (v: number) => {
    if (!Number.isFinite(v)) return;
    out.add(v);
    // The same quantity is legitimately quoted rounded, as a percentage, or in
    // the neighbouring unit.
    out.add(Math.round(v));
    out.add(Math.round(v * 10) / 10);
    out.add(Math.round(v * 100) / 100);
    out.add(Math.round(v * 1000) / 1000);
    out.add(v * 100);
    out.add(Math.round(v * 100));
    out.add(v / 1000);
    out.add(Math.round(v / 1000));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") return add(v);
    if (typeof v === "string") {
      // Numbers inside strings count as given: labels like "1.20 m" are source.
      for (const m of v.matchAll(/-?\d+(?:\.\d+)?/g)) add(Number.parseFloat(m[0]));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(source);
  return out;
}

export function extractNumbers(text: string): { text: string; value: number }[] {
  const out: { text: string; value: number }[] = [];
  const re = /-?\d[\d,]*(?:\.\d+)?(?:e[-+]?\d+)?/gi;
  for (const m of text.matchAll(re)) {
    const value = Number.parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(value)) out.push({ text: m[0], value });
  }
  return out;
}

export function verifyNumbers(text: string, source: unknown): NumberCheck[] {
  const known = [...collectSourceNumbers(source)];
  const checks: NumberCheck[] = [];
  for (const { text: raw, value } of extractNumbers(text)) {
    if (Number.isInteger(value) && SKIP.has(Math.abs(value))) continue;
    let best = Number.POSITIVE_INFINITY;
    let nearest: number | undefined;
    for (const k of known) {
      const d = Math.abs(k - value);
      if (d < best) {
        best = d;
        nearest = k;
      }
      if (d <= Math.max(Math.abs(k) * 0.01, 1e-6)) {
        best = 0;
        nearest = k;
        break;
      }
    }
    checks.push({ text: raw, value, found: best === 0, nearest });
  }
  return checks;
}

export function unverified(checks: NumberCheck[]): NumberCheck[] {
  return checks.filter((c) => !c.found);
}
