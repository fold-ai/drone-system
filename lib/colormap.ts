/**
 * The one colour ramp in the product.
 *
 * Colour is a data channel, not decoration. Chrome stays neutral - black,
 * white, grey - and only quantities are coloured, using this ramp everywhere:
 * the 3D surface field, the streamlines, the trajectory ribbon, the charts and
 * the panel swatches. A colour therefore means the same thing in every view.
 *
 * The ramp is monotonic in lightness, so it survives being read as greyscale
 * and it survives deuteranopia: blue to green to yellow separates on the
 * blue-yellow axis, which is the axis red-green colour blindness leaves intact.
 * Red is never part of the ramp. It is reserved for exceedance, and a limit is
 * never signalled by hue alone - every alert carries a glyph or a position too.
 */
import * as THREE from "three";

export interface Stop {
  at: number;
  hex: string;
  label: string;
}

/** Perceptually ordered, monotonic in lightness. */
export const STOPS: Stop[] = [
  { at: 0.0, hex: "#0B1F4B", label: "deep blue" },
  { at: 0.25, hex: "#1E7FB5", label: "blue" },
  { at: 0.45, hex: "#21B5A8", label: "cyan-teal" },
  { at: 0.6, hex: "#4FC24A", label: "green" },
  { at: 0.8, hex: "#E3D24A", label: "yellow" },
  { at: 1.0, hex: "#E8862E", label: "amber" },
];

/** Exceedance only. Never used to encode a magnitude. */
export const ALERT = "#FF3B1F";
export const NEUTRAL = "#6B6B6B";
export const BRIGHT = "#FFFFFF";

const RGB = STOPS.map((s) => {
  const c = new THREE.Color(s.hex); // sRGB in, linear out under colour management
  return { at: s.at, r: c.r, g: c.g, b: c.b };
});

const HEX_RGB = STOPS.map((s) => ({
  at: s.at,
  r: Number.parseInt(s.hex.slice(1, 3), 16),
  g: Number.parseInt(s.hex.slice(3, 5), 16),
  b: Number.parseInt(s.hex.slice(5, 7), 16),
}));

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : Number.isFinite(t) ? t : 0;
}

/** Linear-space RGB, for shaders and three.js materials. */
export function sampleLinear(t: number): [number, number, number] {
  const x = clamp01(t);
  for (let i = 1; i < RGB.length; i += 1) {
    const a = RGB[i - 1];
    const b = RGB[i];
    if (x <= b.at) {
      const f = (x - a.at) / (b.at - a.at || 1);
      return [a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f];
    }
  }
  const last = RGB[RGB.length - 1];
  return [last.r, last.g, last.b];
}

/** CSS colour, for the DOM: charts, swatches, legends. */
export function css(t: number): string {
  const x = clamp01(t);
  for (let i = 1; i < HEX_RGB.length; i += 1) {
    const a = HEX_RGB[i - 1];
    const b = HEX_RGB[i];
    if (x <= b.at) {
      const f = (x - a.at) / (b.at - a.at || 1);
      const r = Math.round(a.r + (b.r - a.r) * f);
      const g = Math.round(a.g + (b.g - a.g) * f);
      const bl = Math.round(a.b + (b.b - a.b) * f);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return STOPS[STOPS.length - 1].hex;
}

/** `linear-gradient(...)` for colourbar backgrounds. */
export function cssGradient(direction = "to top"): string {
  return `linear-gradient(${direction}, ${STOPS.map((s) => `${s.hex} ${(s.at * 100).toFixed(0)}%`).join(", ")})`;
}

let rampTexture: THREE.DataTexture | null = null;

/** 256x1 lookup used by every shader that reads the ramp. Built once. */
export function rampLUT(): THREE.DataTexture {
  if (rampTexture) return rampTexture;
  const n = 256;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    // The LUT is sampled in a shader that writes linear values, so store linear.
    const [r, g, b] = sampleLinear(t);
    data[i * 4] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  rampTexture = tex;
  return tex;
}

/**
 * Fixed positions on the ramp for the recurring quantities, so a trace, a
 * swatch and a 3D field all agree. Chosen for separation on the ramp rather
 * than for meaning; the legend carries the meaning.
 */
export const CHANNEL: Record<string, number> = {
  mach: 0.62,
  altitude: 0.3,
  thrust: 0.58,
  drag: 0.82,
  fuel: 0.42,
  mass: 0.18,
  throttle_cmd: 0.66,
  throttle_act: 0.36,
  q: 0.5,
  cl: 0.45,
  cd: 0.78,
  ps: 0.7,
};

export function channelCss(key: string): string {
  return css(CHANNEL[key] ?? 0.5);
}

/** Normalise a value onto the ramp against a domain, guarding a zero span. */
export function normalise(v: number, lo: number, hi: number): number {
  const span = hi - lo;
  return clamp01(span > 1e-12 ? (v - lo) / span : 0);
}
