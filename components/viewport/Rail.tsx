"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";

/**
 * Launch rail and ground plane.
 *
 * Rail length and angle come from the configuration, so the geometry on screen
 * is the geometry the solver integrated along. The grid is metric: 10 m minor,
 * 100 m major.
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
  // makes a new instance on every render, and the old ones are dropped from the
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

  // The launch site is a fixed point; at cruise it is tens of kilometres behind.
  // The metric grid therefore follows the aircraft downrange, snapped to its own
  // spacing so the lines read as ground moving past rather than sliding with it.
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
      <mesh position={[1200, groundAltitude - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80000, 80000]} />
        <meshBasicMaterial color="#050505" />
      </mesh>
      <group ref={grid}>
        <gridHelper args={[6000, 600, "#141414", "#0d0d0d"]} position={[0, groundAltitude, 0]} />
        <gridHelper args={[6000, 60, "#2a2a2a", "#1c1c1c"]} position={[0, groundAltitude + 0.02, 0]} />
      </group>
      <primitive object={beam} />
      <primitive object={strut} />
      <mesh position={[tip.x * 0.5, groundAltitude + tip.y * 0.5 - groundAltitude * 0.5, 0]} rotation={[0, 0, a]}>
        <boxGeometry args={[lengthM, 0.06, 0.22]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0, groundAltitude + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 1.5, 48]} />
        <meshBasicMaterial color="#6b6b6b" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
