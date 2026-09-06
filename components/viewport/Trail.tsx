"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Run } from "@/lib/playback";

/**
 * Trajectory ribbon.
 *
 * The whole solved path is drawn dim, the part already flown is drawn in a
 * Mach-mapped white ramp, and the boundary between them is the playback cursor.
 * Both come straight from the trajectory columns.
 */
export function Trail({
  run,
  colour = "flown",
  getIndex,
}: {
  run: Run;
  colour?: "flown" | "ghost";
  getIndex: () => number;
}) {
  const line = useRef<THREE.Line>(null);

  const { object, geometry, material } = useMemo(() => {
    const n = run.n;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const x = run.cols.x_m;
    const y = run.cols.y_m;
    const h = run.cols.h_m;
    const mach = run.cols.mach;
    let mMax = 0.001;
    if (mach) for (let i = 0; i < n; i += 1) mMax = Math.max(mMax, mach[i]);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = x ? x[i] : 0;
      pos[i * 3 + 1] = h ? h[i] : 0;
      pos[i * 3 + 2] = y ? -y[i] : 0;
      const f = mach ? Math.min(1, mach[i] / mMax) : 0;
      const v = colour === "ghost" ? 0.22 : 0.35 + 0.65 * f;
      col[i * 3] = v;
      col[i * 3 + 1] = v;
      col[i * 3 + 2] = v;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: colour === "flown",
      color: colour === "ghost" ? "#262626" : "#ffffff",
      transparent: true,
      opacity: colour === "ghost" ? 0.7 : 1,
    });
    return { object: new THREE.Line(g, m), geometry: g, material: m };
  }, [run, colour]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const l = line.current;
    if (!l) return;
    if (colour === "ghost") {
      l.geometry.setDrawRange(0, run.n);
      return;
    }
    l.geometry.setDrawRange(0, Math.max(2, getIndex() + 1));
  });

  return <primitive ref={line} object={object} />;
}
