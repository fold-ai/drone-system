"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";

const RING_SPACING_M = 5000;
const RING_COUNT = 34;
const POST_SPACING_M = 10000;
const POST_HEIGHT_M = 4500;
const POST_TICK_M = 500;

/**
 * Ground reference.
 *
 * Without a scale cue the aircraft is a shape on a black field and there is no
 * telling whether it is a hundred metres downrange or forty kilometres. Three
 * things fix that: a metric grid that follows the aircraft so there is always
 * texture underneath, range rings every 5 km measured from the launch point,
 * and altitude posts every 10 km ticked at 500 m. Exponential fog fades all of
 * it with distance, which is what turns spacing into depth.
 */
export function Rail({
  lengthM,
  angleDeg,
  groundAltitude,
}: {
  lengthM: number;
  angleDeg: number;
  groundAltitude: number;
}) {
  const a = THREE.MathUtils.degToRad(angleDeg);
  const tip = useMemo(
    () => new THREE.Vector3(Math.cos(a) * lengthM, groundAltitude + Math.sin(a) * lengthM, 0),
    [a, lengthM, groundAltitude],
  );

  // Objects handed to <primitive> must be stable. Building them inline in JSX
  // makes a new instance on every render and the old ones are dropped from the
  // scene without ever being drawn.
  const beam = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, groundAltitude, 0), tip]),
        new THREE.LineBasicMaterial({ color: "#ffffff" }),
      ),
    [tip, groundAltitude],
  );

  const strut = useMemo(() => {
    const mid = tip.clone().multiplyScalar(0.62);
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mid.x, groundAltitude, 0),
        new THREE.Vector3(mid.x, mid.y * 0.62 + groundAltitude * 0.38, 0),
      ]),
      new THREE.LineBasicMaterial({ color: "#6b6b6b" }),
    );
  }, [tip, groundAltitude]);

  /** Range rings, 5 km apart, centred on the launch point. */
  const rings = useMemo(() => {
    const seg = 180;
    const verts: number[] = [];
    const cols: number[] = [];
    const major = new THREE.Color("#3A4048");
    const minor = new THREE.Color("#1E2228");
    for (let r = 1; r <= RING_COUNT; r += 1) {
      const radius = r * RING_SPACING_M;
      const c = r % 5 === 0 ? major : minor;
      for (let i = 0; i < seg; i += 1) {
        const t0 = (i / seg) * Math.PI * 2;
        const t1 = ((i + 1) / seg) * Math.PI * 2;
        verts.push(Math.cos(t0) * radius, groundAltitude + 0.4, Math.sin(t0) * radius);
        verts.push(Math.cos(t1) * radius, groundAltitude + 0.4, Math.sin(t1) * radius);
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    );
  }, [groundAltitude]);

  /** Altitude posts every 10 km downrange, ticked every 500 m. */
  const posts = useMemo(() => {
    const verts: number[] = [];
    const cols: number[] = [];
    const stem = new THREE.Color("#2A3038");
    const tick = new THREE.Color("#454D57");
    const count = Math.floor((RING_COUNT * RING_SPACING_M) / POST_SPACING_M);
    for (let p = 1; p <= count; p += 1) {
      const x = p * POST_SPACING_M;
      verts.push(x, groundAltitude, 0, x, groundAltitude + POST_HEIGHT_M, 0);
      cols.push(stem.r, stem.g, stem.b, stem.r, stem.g, stem.b);
      for (let h = POST_TICK_M; h <= POST_HEIGHT_M; h += POST_TICK_M) {
        const w = h % 1000 === 0 ? 320 : 150;
        verts.push(x, groundAltitude + h, -w, x, groundAltitude + h, w);
        cols.push(tick.r, tick.g, tick.b, tick.r, tick.g, tick.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
    );
  }, [groundAltitude]);

  useEffect(
    () => () => {
      [beam, strut, rings, posts].forEach((o) => {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
    },
    [beam, strut, rings, posts],
  );

  // The launch site is a fixed point; at cruise it is tens of kilometres behind.
  // The near grid therefore follows the aircraft, snapped to its own spacing so
  // the lines read as ground moving past rather than sliding with it.
  const grid = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = grid.current;
    if (!g) return;
    const { run, t } = useSim.getState();
    if (!run) return;
    const s = sampleAt(run, t);
    g.position.x = Math.round(s.x_m / 100) * 100;
    g.position.z = -Math.round(s.y_m / 100) * 100;
  });

  return (
    <group>
      <mesh position={[0, groundAltitude - 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400000, 400000]} />
        <meshBasicMaterial color="#050608" fog={false} />
      </mesh>
      <group ref={grid}>
        <gridHelper args={[6000, 600, "#141A20", "#0D1116"]} position={[0, groundAltitude, 0]} />
        <gridHelper args={[6000, 60, "#252D36", "#171D24"]} position={[0, groundAltitude + 0.02, 0]} />
      </group>
      <primitive object={rings} />
      <primitive object={posts} />
      <primitive object={beam} />
      <primitive object={strut} />
      <mesh position={[0, groundAltitude + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 1.5, 48]} />
        <meshBasicMaterial color="#6b6b6b" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export const RANGE_RING_SPACING_M = RING_SPACING_M;
export const ALTITUDE_POST_SPACING_M = POST_SPACING_M;
export const ALTITUDE_TICK_M = POST_TICK_M;
