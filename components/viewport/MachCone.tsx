"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rampLUT } from "@/lib/colormap";

/**
 * Compressibility indicator.
 *
 * Hidden entirely below the drag-divergence Mach number. Between M_dd and M 1
 * the disturbance front is effectively normal to the flight path, so it is
 * drawn as a near-flat disc; above M 1 it becomes the true Mach cone with a
 * half angle of arcsin(1/M) and tightens as Mach rises.
 *
 * It fades in on the shared ramp, blue at the divergence Mach through to yellow
 * as the aircraft runs out of margin, with opacity tracking M - M_dd. It is a
 * physical indicator, not decoration, and it never renders when the aircraft is
 * not in that regime.
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

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRamp: { value: rampLUT() },
          uLevel: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying float vEdge;
          void main() {
            // Brighten toward the rim of the cone, where the shock front reads.
            vEdge = clamp(length(position.xz) / 0.5, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #include <logdepthbuf_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform sampler2D uRamp;
          uniform float uLevel;
          uniform float uOpacity;
          varying float vEdge;
          void main() {
            #include <logdepthbuf_fragment>
            // Blue at the divergence Mach, running to yellow as margin is lost.
            float t = mix(0.28, 0.86, clamp(uLevel, 0.0, 1.0));
            vec3 col = texture2D(uRamp, vec2(t, 0.5)).rgb;
            gl_FragColor = vec4(col, uOpacity * (0.35 + 0.65 * vEdge));
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useFrame(() => {
    const g = group.current;
    const me = mesh.current;
    if (!g || !me) return;
    const mach = (g.userData.mach as number) ?? 0;
    if (mach <= machDd) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const halfAngle = mach > 1 ? Math.asin(Math.min(1, 1 / mach)) : Math.PI / 2 - 1e-3;
    const len = lengthM * 5;
    const radius = Math.min(len * 3, len * Math.tan(reducedMotion ? Math.PI / 4 : halfAngle));
    const rScale = Math.max(0.01, radius) / (lengthM * 0.5);
    me.scale.set(rScale, len, rScale);
    const level = Math.min(1, (mach - machDd) / Math.max(0.05, 1 - machDd));
    material.uniforms.uLevel.value = level;
    material.uniforms.uOpacity.value = 0.08 + 0.3 * level;
  });

  return (
    <group ref={group} visible={false}>
      <mesh
        ref={mesh}
        material={material}
        position={[-lengthM * 2.5, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[lengthM * 0.5, 1, 40, 1, true]} />
      </mesh>
    </group>
  );
}
