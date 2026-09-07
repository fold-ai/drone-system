/**
 * Parametric ACT-1 surface.
 *
 * The spanwise definition - leading edge, trailing edge, chord, thickness and
 * twist at each station - comes from api/_core/planform.py and is not
 * recomputed here. This module only turns those stations into a lofted surface:
 * a symmetric section is swept along the span, the centre body is closed with an
 * ogive radome, and the dorsal inlet, centrebody spike and engine casing are
 * added as separate named parts.
 *
 * It is a parametric surface built from the specification, not the CAD mesh, and
 * the viewport says which of the two it is showing.
 *
 * Model frame: +X toward the nose, +Y up, +Z to starboard. Planform x is
 * measured aft from the nose, so model x = L/2 - planform x puts the aircraft
 * centred on its own length.
 */
import * as THREE from "three";
import { deriveGeometry } from "@/lib/planform-measured.mjs";
import type { Planform, PlanformSpec } from "@/lib/types";

/**
 * Overall length is the only dimensional input; span, area and mean chord are
 * measured ratios of it. Re-exported here so the viewport can show what it is
 * assuming rather than implying the numbers came from CAD.
 */
export { deriveGeometry };

export interface AirframePart {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Control surfaces and the spike read paler than the body. */
  accent?: boolean;
}

/** NACA four-digit symmetric thickness, closed at the trailing edge. */
function halfThickness(xi: number, tc: number): number {
  const x = Math.min(1, Math.max(0, xi));
  return (
    (tc / 0.2) *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x * x * x -
      0.1036 * x * x * x * x)
  );
}

/** Cosine spacing: points cluster at the leading edge where curvature is. */
function cosineSpacing(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) out.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  return out;
}

interface Loft {
  positions: number[];
  indices: number[];
}

function pushQuad(idx: number[], a: number, b: number, c: number, d: number) {
  idx.push(a, b, c, a, c, d);
}

/**
 * Blended wing body.
 *
 * One loft from the centreline to the tip. The section is a symmetric aerofoil
 * whose thickness ratio and twist come from the planform stations, so the centre
 * body is thick and the tip is thin without the two being separate objects -
 * which is what "blended" means.
 */
function buildBody(pl: Planform, length: number, nChord = 26): THREE.BufferGeometry {
  const stations = pl.stations;
  const half = pl.span_m * 0.5;
  const xi = cosineSpacing(nChord);
  const ring = xi.length * 2 - 2; // upper LE->TE then lower TE->LE, LE and TE shared
  const loft: Loft = { positions: [], indices: [] };

  const section = (s: Planform["stations"][number], mirror: number) => {
    const chord = Math.max(1e-5, s.chord_m);
    const twist = (s.twist_deg * Math.PI) / 180;
    const cosT = Math.cos(twist);
    const sinT = Math.sin(twist);
    const pivot = 0.25; // twist about the quarter chord
    const pts: number[] = [];
    const add = (u: number, sign: number) => {
      const t = halfThickness(u, s.thickness_frac) * chord * sign;
      // rotate (chordwise, vertical) about the quarter-chord point
      const cx = (u - pivot) * chord;
      const rx = cx * cosT - t * sinT;
      const ry = cx * sinT + t * cosT;
      const planX = s.le_x_m + pivot * chord + rx;
      pts.push(length * 0.5 - planX, ry, mirror * s.y_m);
    };
    for (let i = 0; i < xi.length; i += 1) add(xi[i], +1);
    for (let i = xi.length - 2; i >= 1; i -= 1) add(xi[i], -1);
    return pts;
  };

  // Starboard side then port, each lofted root to tip; the root ring is shared
  // in position so the two halves meet without a seam.
  for (const mirror of [1, -1]) {
    const base = loft.positions.length / 3;
    for (let j = 0; j < stations.length; j += 1) {
      loft.positions.push(...section(stations[j], mirror));
    }
    for (let j = 0; j < stations.length - 1; j += 1) {
      for (let i = 0; i < ring; i += 1) {
        const i2 = (i + 1) % ring;
        const a = base + j * ring + i;
        const b = base + j * ring + i2;
        const c = base + (j + 1) * ring + i2;
        const d = base + (j + 1) * ring + i;
        if (mirror > 0) pushQuad(loft.indices, a, b, c, d);
        else pushQuad(loft.indices, a, d, c, b);
      }
    }
    // Squared tip: cap the outermost ring with a fan.
    const tipBase = base + (stations.length - 1) * ring;
    const centre = loft.positions.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < ring; i += 1) {
      cx += loft.positions[(tipBase + i) * 3];
      cy += loft.positions[(tipBase + i) * 3 + 1];
      cz += loft.positions[(tipBase + i) * 3 + 2];
    }
    loft.positions.push(cx / ring, cy / ring, cz / ring);
    for (let i = 0; i < ring; i += 1) {
      const i2 = (i + 1) % ring;
      if (mirror > 0) loft.indices.push(centre, tipBase + i2, tipBase + i);
      else loft.indices.push(centre, tipBase + i, tipBase + i2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(loft.positions, 3));
  g.setIndex(loft.indices);
  g.computeVertexNormals();
  void half;
  return g;
}

/**
 * Ogive radome.
 *
 * A tangent ogive of revolution over the forward part of the centreline, sized
 * so its maximum radius matches the local half-thickness of the root section.
 * The flat loft alone gives the nose no width; this is what makes the forebody
 * round and the chine read as a blend rather than an edge.
 */
function buildRadome(
  pl: Planform,
  pf: PlanformSpec,
  length: number,
  radial = 20,
  axial = 18,
): THREE.BufferGeometry {
  const root = pl.stations[0];
  const noseLen = pf.radome_frac * length;
  const rMax = Math.max(
    1e-4,
    halfThickness(Math.min(1, noseLen / Math.max(1e-5, root.chord_m)), root.thickness_frac) *
      root.chord_m,
  );
  const rho = (rMax * rMax + noseLen * noseLen) / (2 * rMax); // tangent-ogive radius

  const positions: number[] = [];
  const indices: number[] = [];
  for (let a = 0; a <= axial; a += 1) {
    const x = (a / axial) * noseLen; // aft from the nose tip
    const inner = rho * rho - (noseLen - x) * (noseLen - x);
    const r = Math.max(0, Math.sqrt(Math.max(0, inner)) + rMax - rho);
    for (let i = 0; i <= radial; i += 1) {
      const th = (i / radial) * Math.PI * 2;
      positions.push(length * 0.5 - x, r * Math.sin(th), r * Math.cos(th));
    }
  }
  for (let a = 0; a < axial; a += 1) {
    for (let i = 0; i < radial; i += 1) {
      const p = a * (radial + 1) + i;
      const q = p + radial + 1;
      pushQuad(indices, p, p + 1, q + 1, q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A tube of revolution along the centreline, used for the inlet and the casing. */
function tube(
  length: number,
  xFrom: number,
  xTo: number,
  rFrom: number,
  rTo: number,
  yOffset: number,
  widthScale = 1,
  radial = 18,
  open = true,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const axial = 10;
  for (let a = 0; a <= axial; a += 1) {
    const f = a / axial;
    const x = xFrom + (xTo - xFrom) * f;
    const r = rFrom + (rTo - rFrom) * f;
    for (let i = 0; i <= radial; i += 1) {
      const th = (i / radial) * Math.PI * 2;
      positions.push(length * 0.5 - x, yOffset + r * Math.sin(th), r * widthScale * Math.cos(th));
    }
  }
  for (let a = 0; a < axial; a += 1) {
    for (let i = 0; i < radial; i += 1) {
      const p = a * (radial + 1) + i;
      const q = p + radial + 1;
      pushQuad(indices, p, p + 1, q + 1, q);
    }
  }
  if (!open) {
    const c0 = positions.length / 3;
    positions.push(length * 0.5 - xTo, yOffset, 0);
    const last = axial * (radial + 1);
    for (let i = 0; i < radial; i += 1) indices.push(c0, last + i, last + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Flat plate in the XY plane of the model, used for fins and control surfaces. */
function plate(pts: [number, number, number][]): THREE.BufferGeometry {
  const positions: number[] = [];
  pts.forEach((p) => positions.push(p[0], p[1], p[2]));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/**
 * The whole aircraft as named parts, so the field shader can address the
 * radome, the wing and the engine separately and the outline pass can skip the
 * centrebody spike rather than swallowing it.
 */
export function buildAct1(pl: Planform, pf: PlanformSpec): AirframePart[] {
  const L = pl.length_m;
  const half = pl.span_m * 0.5;
  const parts: AirframePart[] = [];

  parts.push({ name: "body", geometry: buildBody(pl, L) });
  parts.push({ name: "radome", geometry: buildRadome(pl, pf, L) });

  // --- dorsal propulsion, at the measured stations ------------------------
  // Inlet x/L 0.28 to 0.45, engine casing 0.45 to 0.60, exhaust at the
  // trailing-edge notch.
  const inletX = pf.inlet_start_frac * L;
  const inletLen = pf.inlet_length_frac * L;
  const rEng = pf.engine_radius_frac * L;
  const rootTop =
    halfThickness(inletX / Math.max(1e-5, pl.stations[0].chord_m), pl.stations[0].thickness_frac) *
    pl.stations[0].chord_m;
  const yTop = rootTop * 0.72;

  parts.push({
    name: "inlet",
    geometry: tube(L, inletX, inletX + inletLen, rEng * 1.15, rEng, yTop, 1.45),
  });
  parts.push({
    name: "engine",
    geometry: tube(L, pf.engine_start_frac * L, pf.engine_end_frac * L, rEng, rEng * 0.9, yTop, 1.0),
  });
  // Centrebody spike: a long cone pointing forward out of the inlet lip.
  parts.push({
    name: "spike",
    accent: true,
    geometry: tube(L, inletX - inletLen * 0.85, inletX + inletLen * 0.2, 0.001, rEng * 0.52, yTop, 1.0, 14, false),
  });
  // Exhaust nozzle running from the casing back to the trailing-edge notch,
  // which the measured chord table puts at the root chord, x/L 0.827.
  const notchX = pl.stations[0].te_x_m;
  parts.push({
    name: "nozzle",
    geometry: tube(L, pf.engine_end_frac * L, notchX, rEng * 0.9, rEng * 0.95, yTop, 1.0),
  });

  // --- outboard control surfaces on the trailing edge --------------------
  const inb = pl.stations[Math.round((pl.stations.length - 1) * 0.66)];
  const tip = pl.stations[pl.stations.length - 1];
  const hingeFrac = 0.78;
  for (const mirror of [1, -1]) {
    const hingeIn = inb.le_x_m + inb.chord_m * hingeFrac;
    const hingeOut = tip.le_x_m + tip.chord_m * hingeFrac;
    parts.push({
      name: mirror > 0 ? "tip_R" : "tip_L",
      accent: true,
      geometry: plate([
        [L * 0.5 - hingeIn, 0.004, mirror * inb.y_m],
        [L * 0.5 - inb.te_x_m, 0.004, mirror * inb.y_m],
        [L * 0.5 - tip.te_x_m, 0.004, mirror * tip.y_m],
        [L * 0.5 - hingeOut, 0.004, mirror * tip.y_m],
      ]),
    });
  }

  // --- blade surfaces on the upper aft body ------------------------------
  const finY = pf.fin_station_frac * half;
  const finStation =
    pl.stations[
      Math.min(pl.stations.length - 1, Math.round(pf.fin_station_frac * (pl.stations.length - 1)))
    ];
  const finH = pf.fin_span_frac * half;
  const finRoot = halfThickness(0.55, finStation.thickness_frac) * finStation.chord_m;
  for (const mirror of [1, -1]) {
    const xa = finStation.le_x_m + finStation.chord_m * 0.5;
    const xb = finStation.te_x_m;
    parts.push({
      name: mirror > 0 ? "fin_R" : "fin_L",
      geometry: plate([
        [L * 0.5 - xa, finRoot, mirror * finY],
        [L * 0.5 - xb, finRoot, mirror * finY],
        [L * 0.5 - xb, finRoot + finH, mirror * finY],
        [L * 0.5 - (xa + (xb - xa) * 0.45), finRoot + finH, mirror * finY],
      ]),
    });
  }

  return parts;
}

export function disposeParts(parts: AirframePart[]): void {
  parts.forEach((p) => p.geometry.dispose());
}
