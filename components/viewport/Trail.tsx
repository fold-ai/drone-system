"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rampLUT } from "@/lib/colormap";
import type { Run } from "@/lib/playback";
import { useSim } from "@/lib/store";

/**
 * Trajectory ribbon.
 *
 * A one-pixel line disappears at range and looks identical whatever the
 * aircraft was doing. This is a ribbon instead: width held constant in screen
 * space by a vertex shader, colour taken from the shared ramp by Mach, and
 * opacity fading behind the playback cursor so recent flight reads brighter
 * than old. The path still ahead of the cursor is drawn dim and desaturated, so
 * the whole solved trajectory is visible without competing with what has
 * actually been flown.
 *
 * Geometry is built once per run from the existing Float32Array columns and
 * never rebuilt. Playback only moves a uniform, so scrubbing costs nothing.
 */

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aField;
  attribute float aT;
  uniform vec2 uResolution;
  uniform float uWidthPx;
  varying float vField;
  varying float vT;

  void main() {
    vField = aField;
    vT = aT;
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
    vec2 s0 = c0.xy / max(abs(c0.w), 1e-6);
    vec2 s1 = c1.xy / max(abs(c1.w), 1e-6);
    vec2 delta = (s1 - s0) * uResolution;
    // Coincident samples give no direction; fall back to horizontal rather
    // than emitting a NaN that would blank the whole strip.
    vec2 dir = length(delta) > 1e-6 ? normalize(delta) : vec2(1.0, 0.0);
    // Clip space spans two units across uResolution pixels, hence the factor
    // of two: uWidthPx is then the ribbon width in real pixels.
    vec2 offset = vec2(-dir.y, dir.x) * aSide * uWidthPx * 2.0 / uResolution;
    c0.xy += offset * abs(c0.w);
    gl_Position = c0;
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uRamp;
  uniform float uCursorT;
  uniform float uFadeSpan;
  uniform float uAheadAlpha;
  uniform float uOldAlpha;
  varying float vField;
  varying float vT;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 col = texture2D(uRamp, vec2(clamp(vField, 0.0, 1.0), 0.5)).rgb;
    float alpha;
    if (vT > uCursorT) {
      // Not flown yet: dim and pulled toward neutral so it reads as context.
      col = mix(col, vec3(0.20), 0.6);
      alpha = uAheadAlpha;
    } else {
      float age = smoothstep(uCursorT - uFadeSpan, uCursorT, vT);
      alpha = mix(uOldAlpha, 1.0, age);
    }
    gl_FragColor = vec4(col, alpha);
  }
`;

const TICK_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aField;
  attribute float aT;
  uniform float uSizePx;
  uniform float uPixelRatio;
  varying float vField;
  varying float vT;
  void main() {
    vField = aField;
    vT = aT;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSizePx * uPixelRatio;
    #include <logdepthbuf_vertex>
  }
`;

const TICK_FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uRamp;
  uniform float uCursorT;
  varying float vField;
  varying float vT;
  void main() {
    #include <logdepthbuf_fragment>
    // Square ticks, not dots: a tick reads as a mark on a scale.
    vec2 d = abs(gl_PointCoord - 0.5);
    if (max(d.x, d.y) > 0.42) discard;
    vec3 col = texture2D(uRamp, vec2(clamp(vField, 0.0, 1.0), 0.5)).rgb;
    float ahead = step(uCursorT, vT);
    gl_FragColor = vec4(mix(col, vec3(0.2), ahead * 0.7), mix(0.95, 0.3, ahead));
  }
`;

/**
 * Mach domain for the ribbon.
 *
 * Normalising against the run's own maximum would put a nominal cruise at the
 * amber end of the ramp, and amber means "at the limit". The domain is the
 * drag-divergence Mach instead, which is the aerodynamic limit this airframe
 * actually has, so green is nominal and amber means the aircraft is running out
 * of drag margin. The colour then means the same thing across runs.
 */
function machDomain(run: Run): [number, number] {
  const mdd = run.spec?.airframe?.mach_dd;
  const top = Number.isFinite(mdd) && mdd > 0.05 ? mdd : 0.85;
  return [0, top];
}

export function Trail({ run, widthPx = 2.5 }: { run: Run; widthPx?: number }) {
  const { size, viewport } = useThree();
  const mesh = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);

  const { ribbon, ticks, material, tickMaterial } = useMemo(() => {
    const n = run.n;
    const x = run.cols.x_m;
    const y = run.cols.y_m;
    const h = run.cols.h_m;
    const mach = run.cols.mach;
    const t = run.cols.t;
    const [mLo, mHi] = machDomain(run);
    const span = mHi - mLo || 1;

    const pos = new Float32Array(n * 2 * 3);
    const nxt = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2);
    const field = new Float32Array(n * 2);
    const time = new Float32Array(n * 2);

    const px = (i: number) => (x ? x[i] : 0);
    const py = (i: number) => (h ? h[i] : 0);
    const pz = (i: number) => (y ? -y[i] : 0);

    for (let i = 0; i < n; i += 1) {
      const j = Math.min(i + 1, n - 1);
      const f = mach ? (mach[i] - mLo) / span : 0;
      for (let s = 0; s < 2; s += 1) {
        const k = i * 2 + s;
        pos[k * 3] = px(i);
        pos[k * 3 + 1] = py(i);
        pos[k * 3 + 2] = pz(i);
        nxt[k * 3] = px(j);
        nxt[k * 3 + 1] = py(j);
        nxt[k * 3 + 2] = pz(j);
        side[k] = s === 0 ? -1 : 1;
        field[k] = f;
        time[k] = t ? t[i] : 0;
      }
    }

    const index = new Uint32Array(Math.max(0, (n - 1) * 6));
    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 2;
      index[i * 6] = a;
      index[i * 6 + 1] = a + 1;
      index[i * 6 + 2] = a + 2;
      index[i * 6 + 3] = a + 1;
      index[i * 6 + 4] = a + 3;
      index[i * 6 + 5] = a + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aNext", new THREE.BufferAttribute(nxt, 3));
    geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geo.setAttribute("aField", new THREE.BufferAttribute(field, 1));
    geo.setAttribute("aT", new THREE.BufferAttribute(time, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uRamp: { value: rampLUT() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uWidthPx: { value: widthPx },
        uCursorT: { value: 0 },
        uFadeSpan: { value: 45 },
        uAheadAlpha: { value: 0.4 },
        uOldAlpha: { value: 0.34 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // One tick every ten seconds of mission time.
    const tickIdx: number[] = [];
    if (t) {
      let next = Math.ceil(t[0] / 10) * 10;
      for (let i = 0; i < n; i += 1) {
        if (t[i] >= next) {
          tickIdx.push(i);
          next += 10;
        }
      }
    }
    const tp = new Float32Array(tickIdx.length * 3);
    const tf = new Float32Array(tickIdx.length);
    const tt = new Float32Array(tickIdx.length);
    tickIdx.forEach((i, k) => {
      tp[k * 3] = px(i);
      tp[k * 3 + 1] = py(i);
      tp[k * 3 + 2] = pz(i);
      tf[k] = mach ? (mach[i] - mLo) / span : 0;
      tt[k] = t ? t[i] : 0;
    });
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(tp, 3));
    tgeo.setAttribute("aField", new THREE.BufferAttribute(tf, 1));
    tgeo.setAttribute("aT", new THREE.BufferAttribute(tt, 1));
    tgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const tmat = new THREE.ShaderMaterial({
      uniforms: {
        uRamp: { value: rampLUT() },
        uCursorT: { value: 0 },
        uSizePx: { value: 4.5 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: TICK_VERT,
      fragmentShader: TICK_FRAG,
      transparent: true,
      depthWrite: false,
    });

    return { ribbon: geo, ticks: tgeo, material: mat, tickMaterial: tmat };
  }, [run, widthPx]);

  useEffect(
    () => () => {
      ribbon.dispose();
      ticks.dispose();
      material.dispose();
      tickMaterial.dispose();
    },
    [ribbon, ticks, material, tickMaterial],
  );

  useFrame(() => {
    material.uniforms.uResolution.value.set(size.width, size.height);
    tickMaterial.uniforms.uPixelRatio.value = viewport.dpr;
    const t = useSim.getState().t;
    material.uniforms.uCursorT.value = t;
    tickMaterial.uniforms.uCursorT.value = t;
  });

  return (
    <group>
      <mesh ref={mesh} name="trail-ribbon" geometry={ribbon} material={material} frustumCulled={false} />
      <points ref={points} geometry={ticks} material={tickMaterial} frustumCulled={false} />
    </group>
  );
}

/**
 * The held reference run, drawn as a dotted line so an A/B comparison reads as
 * two distinct things in the 3D view and not one thick smear.
 */
export function ReferenceTrail({ run }: { run: Run }) {
  const object = useMemo(() => {
    const n = run.n;
    const pos = new Float32Array(n * 3);
    const x = run.cols.x_m;
    const y = run.cols.y_m;
    const h = run.cols.h_m;
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = x ? x[i] : 0;
      pos[i * 3 + 1] = h ? h[i] : 0;
      pos[i * 3 + 2] = y ? -y[i] : 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({
        color: "#9AA3AD",
        dashSize: 120,
        gapSize: 90,
        transparent: true,
        opacity: 0.75,
      }),
    );
    line.computeLineDistances();
    line.frustumCulled = false;
    return line;
  }, [run]);

  useEffect(
    () => () => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  return <primitive object={object} />;
}
