"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rampLUT } from "@/lib/colormap";

/**
 * Illustrative flow.
 *
 * These streamlines are the analytic potential-flow solution for a sphere, not
 * a solve over the ACT-1 geometry:
 *
 *     v = U - (a^3 / r^3) [ 1.5 (U . rhat) rhat - 0.5 U ]
 *
 * which is exact for a sphere in incompressible, irrotational flow. It gives an
 * honest picture of streamtube contraction and acceleration around a blunt
 * body, and nothing more. It is labelled "illustrative flow, not CFD" wherever
 * it appears, because a picture like this is easy to mistake for a
 * Navier-Stokes result and it is not one.
 *
 * Geometry is built once as a single instanced mesh - one cylinder per segment,
 * one draw call - and playback only advances a phase uniform, so there is no
 * per-frame allocation.
 */

const LINES = 52;
const STEPS = 44;

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aField;
  attribute float aParam;
  varying float vField;
  varying float vParam;
  void main() {
    vField = aField;
    vParam = aParam;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uRamp;
  uniform float uPhase;
  uniform float uOpacity;
  varying float vField;
  varying float vParam;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 col = texture2D(uRamp, vec2(clamp(vField, 0.0, 1.0), 0.5)).rgb;
    // A band travelling downstream reads as motion without moving geometry.
    float pulse = fract(vParam * 3.0 - uPhase);
    float bright = 0.45 + 0.6 * smoothstep(0.72, 1.0, pulse);
    // Fade the tails so the seeding plane does not read as a hard edge.
    float ends = smoothstep(0.0, 0.08, vParam) * (1.0 - smoothstep(0.88, 1.0, vParam));
    gl_FragColor = vec4(col * bright, uOpacity * ends);
  }
`;

interface Built {
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;
}

function build(lengthM: number): Built {
  const a = lengthM * 0.42;
  const centre = new THREE.Vector3(lengthM * 0.06, 0, 0);
  const U = new THREE.Vector3(-1, 0, 0); // nose is +X, freestream runs aft
  const ds = a * 0.16;

  const v = new THREE.Vector3();
  const rvec = new THREE.Vector3();
  const rhat = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const velocity = (p: THREE.Vector3, out: THREE.Vector3) => {
    rvec.copy(p).sub(centre);
    const r = Math.max(a * 1.02, rvec.length());
    rhat.copy(rvec).divideScalar(rvec.length() || 1);
    const k = (a * a * a) / (r * r * r);
    const udotr = U.dot(rhat);
    out.copy(rhat).multiplyScalar(1.5 * udotr);
    out.addScaledVector(U, -0.5);
    out.multiplyScalar(-k);
    out.add(U);
    return out;
  };

  const positions: THREE.Vector3[][] = [];
  const speeds: number[][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < LINES; i += 1) {
    // Even coverage of the upstream disc: a sunflower spiral, so no seam.
    const f = (i + 0.5) / LINES;
    const radius = a * (0.18 + 2.05 * Math.sqrt(f));
    const angle = i * golden;
    const p = new THREE.Vector3(
      centre.x + a * 3.1,
      centre.y + Math.cos(angle) * radius,
      centre.z + Math.sin(angle) * radius,
    );
    const line: THREE.Vector3[] = [p.clone()];
    const spd: number[] = [];
    for (let s = 0; s < STEPS; s += 1) {
      velocity(p, v);
      spd.push(v.length());
      // RK2, so the streamline curves correctly around the shoulder instead of
      // cutting the corner.
      tmp.copy(p).addScaledVector(v, ds * 0.5);
      velocity(tmp, v);
      p.addScaledVector(v.normalize(), ds);
      line.push(p.clone());
    }
    spd.push(spd[spd.length - 1]);
    positions.push(line);
    speeds.push(spd);
  }

  const segments = LINES * STEPS;
  const geo = new THREE.CylinderGeometry(lengthM * 0.0045, lengthM * 0.0045, 1, 6, 1, true);
  geo.translate(0, 0.5, 0); // base at the origin so scaling stretches forward

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRamp: { value: rampLUT() },
      uPhase: { value: 0 },
      uOpacity: { value: 0.6 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geo, material, segments);
  mesh.frustumCulled = false;
  const field = new Float32Array(segments);
  const param = new Float32Array(segments);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < LINES; i += 1) {
    for (let s = 0; s < STEPS; s += 1) {
      const p0 = positions[i][s];
      const p1 = positions[i][s + 1];
      dir.copy(p1).sub(p0);
      const len = dir.length() || 1e-4;
      q.setFromUnitVectors(up, dir.divideScalar(len));
      scale.set(1, len, 1);
      m.compose(p0, q, scale);
      mesh.setMatrixAt(k, m);
      // Speed ratio against the freestream: 1.5 at the shoulder for a sphere,
      // zero at stagnation. Mapped over [0, 1.6] so the shoulder sits high.
      field[k] = Math.min(1, speeds[i][s] / 1.6);
      param[k] = s / (STEPS - 1);
      k += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute("aField", new THREE.InstancedBufferAttribute(field, 1));
  geo.setAttribute("aParam", new THREE.InstancedBufferAttribute(param, 1));
  return { mesh, material };
}

export function Streamlines({
  lengthM,
  visible,
  speed = 1,
}: {
  lengthM: number;
  visible: boolean;
  speed?: number;
}) {
  const built = useMemo(() => build(lengthM), [lengthM]);
  const phase = useRef(0);

  useEffect(
    () => () => {
      built.mesh.geometry.dispose();
      built.material.dispose();
      built.mesh.dispose();
    },
    [built],
  );

  useFrame((_, delta) => {
    if (!visible) return;
    phase.current = (phase.current + delta * 0.55 * speed) % 1;
    built.material.uniforms.uPhase.value = phase.current;
  });

  return <primitive object={built.mesh} visible={visible} />;
}
