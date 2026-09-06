"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Compressibility indicator.
 *
 * Hidden entirely below the drag-divergence Mach number. Between M_dd and M 1
 * the disturbance front is effectively normal to the flight path, so it is
 * drawn as a near-flat disc; above M 1 it becomes the true Mach cone with a
 * half angle of arcsin(1/M) and tightens as Mach rises. It is a physical
 * indicator, not decoration, and it never renders when the aircraft is not in
 * that regime.
 */
export function MachCone({
  lengthM,
  machDd,
  reducedMotion,
}: {
  lengthM: number;
  machDd: number;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const g = group.current;
    const m = mat.current;
    const me = mesh.current;
    if (!g || !m || !me) return;
    // The cursor Mach is written onto this group by the aircraft each frame.
    const mach = (g.userData.mach as number) ?? 0;
    const mdd = machDd;
    const reduced = reducedMotion;
    if (mach <= mdd) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const halfAngle = mach > 1 ? Math.asin(Math.min(1, 1 / mach)) : Math.PI / 2 - 1e-3;
    const len = lengthM * 5;
    const radius = Math.min(len * 3, len * Math.tan(reduced ? Math.PI / 4 : halfAngle));
    const rScale = Math.max(0.01, radius) / (lengthM * 0.5);
    me.scale.set(rScale, len, rScale);
    m.opacity = 0.06 + 0.22 * Math.min(1, (mach - mdd) / Math.max(0.05, 1 - mdd));
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} position={[-lengthM * 2.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[lengthM * 0.5, 1, 40, 1, true]} />
        <meshBasicMaterial
          ref={mat}
          color="#ffffff"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
