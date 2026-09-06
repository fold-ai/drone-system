"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fixed } from "@/lib/format";
import { sampleAt } from "@/lib/playback";
import { type CameraPreset, CAMERA_PRESETS, useSim } from "@/lib/store";
import { Act1, useModelAvailable } from "./Act1";
import { Gnomon } from "./Gnomon";
import { MachCone } from "./MachCone";
import { makeAirframeMaterial, makeHullMaterial } from "./materials";
import { RANGE_RING_SPACING_M, Rail } from "./Rail";
import { ReferenceTrail, Trail } from "./Trail";

const DEG = Math.PI / 180;

/** Smallest the airframe is allowed to appear, in CSS pixels of its length. */
const TARGET_PX = 40;
const MAX_EXAGGERATION = 8;

/** Solver frame (east, north, up) into the scene frame (x, y up, z). */
function place(v: THREE.Vector3, x: number, north: number, h: number) {
  v.set(x, h, -north);
}

/** User orbit applied on top of whichever preset is active. */
interface OrbitState {
  yaw: number;
  pitch: number;
  zoom: number;
}
const orbit: OrbitState = { yaw: 0, pitch: 0, zoom: 1 };
export function recentreView() {
  orbit.yaw = 0;
  orbit.pitch = 0;
  orbit.zoom = 1;
}

function usePrefersReducedMotion(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setV(mq.matches);
    const on = () => setV(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return v;
}

function Aircraft({
  hasModel,
  material,
  hull,
  onScale,
  onLocator,
}: {
  hasModel: boolean;
  material: THREE.ShaderMaterial;
  hull: THREE.ShaderMaterial;
  onScale: (factor: number) => void;
  onLocator: (x: number, y: number, visible: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const cone = useRef<THREE.Group>(null);
  const booster = useRef<THREE.Group>(null);
  const jettisoned = useRef<THREE.Group>(null);
  const spec = useSim((s) => s.spec);
  const reduced = usePrefersReducedMotion();
  const { camera, size } = useThree();

  const toCam = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  const light = useMemo(() => new THREE.Vector3(), []);
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);
  const lastFactor = useRef(1);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { run, t } = useSim.getState();
    if (!run) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const s = sampleAt(run, t);
    place(g.position, s.x_m, s.y_m, s.h_m);
    g.rotation.set(-s.bank_deg * DEG, -s.psi_deg * DEG, s.gamma_deg * DEG, "YZX");

    // --- apparent-size floor ------------------------------------------
    // At 40 km the airframe is a couple of pixels. Scale it up only as far as
    // it takes to stay readable, clamp the exaggeration, and report the factor
    // so the view never quietly misrepresents how big the aircraft is.
    const cam = camera as THREE.PerspectiveCamera;
    const dist = Math.max(0.5, cam.position.distanceTo(g.position));
    const worldPerPx = (2 * dist * Math.tan((cam.fov * DEG) / 2)) / Math.max(1, size.height);
    const naturalPx = spec.airframe.length_m / worldPerPx;
    const factor = Math.min(MAX_EXAGGERATION, Math.max(1, TARGET_PX / Math.max(1e-6, naturalPx)));
    if (model.current) model.current.scale.setScalar(factor);
    if (Math.abs(factor - lastFactor.current) > 0.02) {
      lastFactor.current = factor;
      onScale(factor);
    }

    // Once the exaggeration cap bites, the airframe is under the readable size
    // and no honest scaling will fix it. A locator ring marks where it is; it
    // is explicitly a marker, not the aircraft drawn bigger.
    const shownPx = naturalPx * factor;
    ndc.copy(g.position).project(cam);
    onLocator(
      (ndc.x * 0.5 + 0.5) * size.width,
      (-ndc.y * 0.5 + 0.5) * size.height,
      shownPx < TARGET_PX * 0.85 && ndc.z < 1,
    );

    // --- key light from camera up-right --------------------------------
    toCam.copy(cam.position).sub(g.position).normalize();
    right.crossVectors(toCam, worldUp).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    up.crossVectors(right, toCam).normalize();
    light.copy(toCam).addScaledVector(right, 0.55).addScaledVector(up, 0.75).normalize();
    material.uniforms.uLightDir.value.copy(light);

    const ex = g.getObjectByName("exhaust");
    if (ex) ex.userData.throttle = s.throttle_act;

    const coneGroup = cone.current?.children[0];
    if (coneGroup) coneGroup.userData.mach = s.mach;

    const b = spec.launch.booster;
    const burning = b.enabled && t < b.burn_time_s;
    if (booster.current) booster.current.visible = burning;

    // Jettisoned motor: free fall from the release point with the release
    // velocity. Drag on a tumbling case is not modelled, so it is shown for
    // four seconds and then removed rather than flown to the ground.
    const jg = jettisoned.current;
    if (jg) {
      const dt = t - b.burn_time_s;
      const show = b.enabled && b.jettison && dt > 0 && dt < 4;
      jg.visible = show;
      if (show) {
        const r = sampleAt(run, b.burn_time_s);
        const vx = r.v_tas_ms * Math.cos(r.gamma_deg * DEG);
        const vh = r.v_tas_ms * Math.sin(r.gamma_deg * DEG);
        place(jg.position, r.x_m + vx * dt, r.y_m, r.h_m + vh * dt - 0.5 * 9.80665 * dt * dt);
        jg.rotation.x = dt * 5;
        jg.rotation.z = dt * 3;
        jg.scale.setScalar(lastFactor.current);
      }
    }
  });

  const L = spec.airframe.length_m;
  return (
    <>
      <group ref={group}>
        <group ref={model}>
          <Act1
            lengthM={L}
            spanM={spec.airframe.span_m}
            hasModel={hasModel}
            material={material}
            hull={hull}
          />
          <group ref={cone}>
            <MachCone lengthM={L} machDd={spec.airframe.mach_dd} reducedMotion={reduced} />
          </group>
          <group ref={booster} position={[-L * 0.2, -L * 0.09, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[L * 0.05, L * 0.05, L * 0.34, 12]} />
              <meshBasicMaterial color="#1c1c1c" />
            </mesh>
            <mesh position={[-L * 0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[L * 0.075, L * 0.62, 14, 1, true]} />
              <meshBasicMaterial color="#E8862E" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>
      <group ref={jettisoned} visible={false}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[L * 0.05, L * 0.05, L * 0.34, 10]} />
          <meshBasicMaterial color="#6b6b6b" wireframe />
        </mesh>
      </group>
    </>
  );
}

/**
 * Camera rig.
 *
 * Every preset produces a target position and a target look point; the camera
 * damps toward both with a frame-rate independent time constant instead of
 * snapping. Chase distance follows airspeed so the framing opens up as the
 * aircraft accelerates. A drag orbits any preset, and recentre clears it.
 */
function CameraRig() {
  const { camera } = useThree();
  const preset = useSim((s) => s.camera);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const smoothLook = useMemo(() => new THREE.Vector3(), []);
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const lastPreset = useRef<CameraPreset | null>(null);

  useFrame((_, delta) => {
    const { run, t, spec } = useSim.getState();
    if (!run) return;
    const s = sampleAt(run, t);
    place(look, s.x_m, s.y_m, s.h_m);
    const psi = -s.psi_deg * DEG;
    const gam = s.gamma_deg * DEG;
    fwd.set(Math.cos(gam) * Math.cos(psi), Math.sin(gam), -Math.cos(gam) * Math.sin(psi));
    const ground = spec.atmosphere.ground_altitude_m;
    const L = spec.airframe.length_m;

    let tau = 0.16;
    let lookAhead = 0;

    if (preset === "chase") {
      // Distance follows speed so the aircraft holds roughly constant framing.
      const d = Math.min(60, Math.max(16, 15 + s.v_tas_ms * 0.11));
      offset.copy(fwd).multiplyScalar(-d).add(new THREE.Vector3(0, d * 0.26, d * 0.34));
      lookAhead = d * 0.25;
    } else if (preset === "rail") {
      offset.set(-26 - look.x, ground + 12 - look.y, 30 - look.z);
      tau = 0.05;
    } else if (preset === "side") {
      const d = Math.max(45, s.v_tas_ms * 0.42);
      offset.set(0, Math.max(6, d * 0.1), d);
    } else if (preset === "top") {
      const span = Math.max(3000, run.summary.ground_range_km * 1000);
      offset.set(span * 0.5 - look.x, ground + span * 0.6 - look.y, 1 - look.z);
      tau = 0.05;
    } else if (preset === "cockpit") {
      offset.copy(fwd).multiplyScalar(L * 0.42).add(new THREE.Vector3(0, L * 0.12, 0));
      lookAhead = 4000;
      tau = 0.06;
    } else {
      offset.set(-34, 14, 30);
    }

    // User orbit, applied around the look point (or around the view direction
    // in the cockpit, where orbiting the position would leave the aircraft).
    if (preset === "cockpit") {
      const q = new THREE.Quaternion().setFromAxisAngle(worldUp, orbit.yaw);
      fwd.applyQuaternion(q);
      axis.crossVectors(fwd, worldUp).normalize();
      fwd.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, orbit.pitch));
    } else if (orbit.yaw !== 0 || orbit.pitch !== 0 || orbit.zoom !== 1) {
      offset.applyAxisAngle(worldUp, orbit.yaw);
      axis.copy(offset).cross(worldUp).normalize();
      if (axis.lengthSq() > 1e-8) offset.applyAxisAngle(axis, orbit.pitch);
      offset.multiplyScalar(orbit.zoom);
    }

    pos.copy(look).add(offset);
    if (preset !== "cockpit" && preset !== "top") {
      pos.y = Math.max(pos.y, ground + 3);
    }
    look.addScaledVector(fwd, lookAhead);

    const snap = lastPreset.current !== preset;
    lastPreset.current = preset;
    const k = snap ? 1 : 1 - Math.exp(-Math.max(1e-4, delta) / tau);
    camera.position.lerp(pos, k);
    if (snap) smoothLook.copy(look);
    else smoothLook.lerp(look, k);
    camera.lookAt(smoothLook);
  });

  return null;
}

function TrailLayer() {
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  const showGhost = useSim((s) => s.showGhost);
  if (!run) return null;
  return (
    <>
      <Trail key={run.id} run={run} />
      {showGhost && ghost && <ReferenceTrail key={`ref-${ghost.id}`} run={ghost} />}
    </>
  );
}

/** The 3D viewport. Everything positioned here is read from the trajectory. */
export function Scene() {
  const spec = useSim((s) => s.spec);
  const run = useSim((s) => s.run);
  const camera = useSim((s) => s.camera);
  const setCamera = useSim((s) => s.setCamera);
  const hasModel = useModelAvailable();
  const scaleTag = useRef<HTMLSpanElement>(null);

  const material = useMemo(() => makeAirframeMaterial(), []);
  const hull = useMemo(() => makeHullMaterial(), []);
  useEffect(
    () => () => {
      material.dispose();
      hull.dispose();
    },
    [material, hull],
  );

  const onScale = useCallback((factor: number) => {
    if (scaleTag.current) {
      scaleTag.current.textContent = factor <= 1.01 ? "true size" : `x${factor.toFixed(1)} scale`;
    }
  }, []);

  const locator = useRef<SVGGElement>(null);
  const onLocator = useCallback((x: number, y: number, visible: boolean) => {
    const el = locator.current;
    if (!el) return;
    el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    el.setAttribute("opacity", visible ? "1" : "0");
  }, []);

  // Drag to orbit in any mode; wheel to pull in and out; R to recentre.
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    orbit.yaw -= (e.clientX - d.x) * 0.006;
    orbit.pitch = Math.max(-1.2, Math.min(1.2, orbit.pitch + (e.clientY - d.y) * 0.005));
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    dragging.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "r" || e.key === "R") recentreView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative h-full w-full bg-void"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={(e) => {
        orbit.zoom = Math.min(8, Math.max(0.25, orbit.zoom * (e.deltaY > 0 ? 1.12 : 0.89)));
      }}
    >
      <Canvas
        gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
        camera={{ fov: 46, near: 0.4, far: 400000, position: [-30, 18, 34] }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <color attach="background" args={["#000000"]} />
        {/* Exponential fog is the depth cue: the range rings and altitude posts
            fade with distance, which is what makes spacing read as depth. */}
        <fogExp2 attach="fog" args={["#000000", 0.0000185]} />
        <Rail
          lengthM={spec.launch.rail_length_m}
          angleDeg={spec.launch.rail_angle_deg}
          groundAltitude={spec.atmosphere.ground_altitude_m}
        />
        <Suspense fallback={null}>
          <Aircraft
            hasModel={hasModel === true}
            material={material}
            hull={hull}
            onScale={onScale}
            onLocator={onLocator}
          />
        </Suspense>
        <TrailLayer />
        <CameraRig />
      </Canvas>

      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <g ref={locator} opacity="0">
          <circle cx="0" cy="0" r="11" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.85" />
          <line x1="-17" y1="0" x2="-13" y2="0" stroke="#ffffff" strokeWidth="1" />
          <line x1="13" y1="0" x2="17" y2="0" stroke="#ffffff" strokeWidth="1" />
          <line x1="0" y1="-17" x2="0" y2="-13" stroke="#ffffff" strokeWidth="1" />
          <line x1="0" y1="13" x2="0" y2="17" stroke="#ffffff" strokeWidth="1" />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 p-2">
        <div className="pointer-events-auto flex flex-wrap gap-px">
          {CAMERA_PRESETS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setCamera(c)}
              title={`${c}  [${i + 1}]`}
              className={`hit h-5 border border-rule px-1.5 text-[10px] ${
                camera === c ? "bg-bright text-void" : "bg-void text-dim hover:text-bright"
              }`}
            >
              {i + 1} {c}
            </button>
          ))}
          <button
            type="button"
            onClick={recentreView}
            title="Recentre the view  [R]"
            className="hit ml-1 h-5 border border-rule bg-void px-1.5 text-[10px] text-dim hover:text-bright"
          >
            R recentre
          </button>
        </div>

        {run && (
          <>
            <div className="pointer-events-none absolute left-2 top-9">
              <Gnomon />
            </div>
            <ViewportHud />
          </>
        )}

        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          <div className="flex items-center gap-2 border border-rule bg-void/85 px-2 py-1">
            <span ref={scaleTag} className="num text-[10px] text-bright">
              true size
            </span>
            <span className="text-[9px] text-dim">
              airframe held to {TARGET_PX} px minimum, capped at x{MAX_EXAGGERATION}; beyond that a
              locator ring marks it
            </span>
          </div>
          <div className="border border-rule bg-void/85 px-2 py-1 text-[9px] text-dim">
            range rings {RANGE_RING_SPACING_M / 1000} km &middot; altitude posts every 10 km, ticked
            500 m &middot; drag to orbit, wheel to zoom
          </div>
          {hasModel === false && (
            <div className="border border-rule bg-void/85 px-2 py-1 text-[10px] text-dim">
              Placeholder airframe. Drop act1.glb into /public/models/ for the real geometry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Corner state block. Updated from the store without a React render. */
function ViewportHud() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rows = box.current?.querySelectorAll<HTMLSpanElement>("[data-k]");
    if (!rows) return undefined;
    const write = (t: number) => {
      const { run } = useSim.getState();
      if (!run) return;
      const s = sampleAt(run, t);
      const map: Record<string, string> = {
        mach: fixed(s.mach, 3, 6),
        alt: fixed(s.h_m, 0, 6),
        tas: fixed(s.v_tas_ms, 1, 6),
        gam: fixed(s.gamma_deg, 1, 6),
        rng: fixed(s.s_ground_m / 1000, 2, 6),
        thr: fixed(s.throttle_act * 100, 0, 4),
      };
      rows.forEach((el) => {
        el.textContent = map[el.dataset.k as string] ?? "";
      });
    };
    write(useSim.getState().t);
    return useSim.subscribe((s) => write(s.t));
  }, []);

  return (
    <div ref={box} className="absolute right-2 top-2 border border-rule bg-void/85 px-2 py-1.5">
      {[
        ["mach", "M", ""],
        ["alt", "ALT", "m"],
        ["tas", "TAS", "m/s"],
        ["gam", "FPA", "deg"],
        ["rng", "RNG", "km"],
        ["thr", "THR", "%"],
      ].map(([k, label, unit]) => (
        <div key={k} className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] text-dim">{label}</span>
          <span className="flex items-baseline gap-1">
            <span data-k={k} className="num text-[11px]">
              --
            </span>
            <span className="w-6 text-[9px] text-dim">{unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
