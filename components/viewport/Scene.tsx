"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fixed } from "@/lib/format";
import { indexAt, sampleAt } from "@/lib/playback";
import { type CameraPreset, useSim } from "@/lib/store";
import { MachCone } from "./MachCone";
import { Rail } from "./Rail";
import { Reaper, useModelAvailable } from "./Reaper";
import { Trail } from "./Trail";

const DEG = Math.PI / 180;

/** Solver frame (east, north, up) into the scene frame (x, y up, z). */
function place(v: THREE.Vector3, x: number, north: number, h: number) {
  v.set(x, h, -north);
}

function Aircraft({ hasModel }: { hasModel: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cone = useRef<THREE.Group>(null);
  const booster = useRef<THREE.Group>(null);
  const jettisoned = useRef<THREE.Group>(null);
  const spec = useSim((s) => s.spec);
  const reduced = usePrefersReducedMotion();

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
      }
    }
  });

  const L = spec.airframe.length_m;
  return (
    <>
      <group ref={group}>
        <Reaper lengthM={L} spanM={spec.airframe.span_m} hasModel={hasModel} />
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
            <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
          </mesh>
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

function CameraRig() {
  const { camera } = useThree();
  const controls = useRef<never>(null);
  const preset = useSim((s) => s.camera);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const { run, t, spec } = useSim.getState();
    if (!run) return;
    const s = sampleAt(run, t);
    place(target, s.x_m, s.y_m, s.h_m);
    const psi = -s.psi_deg * DEG;
    const gam = s.gamma_deg * DEG;
    fwd.set(Math.cos(gam) * Math.cos(psi), Math.sin(gam), -Math.cos(gam) * Math.sin(psi));

    if (preset === "orbit") {
      const c = controls.current as unknown as { target: THREE.Vector3; update: () => void } | null;
      if (c) {
        c.target.copy(target);
        c.update();
      }
      return;
    }

    const ground = spec.atmosphere.ground_altitude_m;
    if (preset === "chase") {
      // Offset to one side as well as behind. Sitting exactly in the plane of
      // flight shows the trajectory ribbon edge-on, as a single line.
      pos.copy(target).addScaledVector(fwd, -30).add(new THREE.Vector3(0, 8, 11));
      // On the rail the flight path is 45 degrees up, so a straight chase offset
      // puts the camera under the ground. Hold it above the surface instead.
      pos.y = Math.max(pos.y, ground + 4);
      camera.position.lerp(pos, 0.14);
      camera.lookAt(target);
    } else if (preset === "rail") {
      camera.position.set(-26, ground + 12, 30);
      camera.lookAt(target);
    } else if (preset === "side") {
      const d = Math.max(45, s.v_tas_ms * 0.35);
      pos.set(target.x, Math.max(target.y + 4, ground + 5), target.z + d);
      camera.position.lerp(pos, 0.2);
      camera.lookAt(target);
    } else if (preset === "top") {
      const span = Math.max(2000, run.summary.ground_range_km * 1000);
      camera.position.set(span * 0.5, ground + span * 0.62, 1);
      camera.lookAt(new THREE.Vector3(span * 0.5, ground, 0));
    }
  });

  return <OrbitControls ref={controls as never} enabled={preset === "orbit"} makeDefault={preset === "orbit"} />;
}

function TrailLayer() {
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  const showGhost = useSim((s) => s.showGhost);
  const getIndex = useMemo(() => {
    return () => {
      const st = useSim.getState();
      return st.run ? indexAt(st.run, st.t) : 0;
    };
  }, []);
  if (!run) return null;
  return (
    <>
      <Trail key={`full-${run.id}`} run={run} colour="ghost" getIndex={getIndex} />
      <Trail key={`flown-${run.id}`} run={run} colour="flown" getIndex={getIndex} />
      {showGhost && ghost && (
        <Trail key={`ref-${ghost.id}`} run={ghost} colour="ghost" getIndex={() => ghost.n} />
      )}
    </>
  );
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

/** The 3D viewport. Everything positioned here is read from the trajectory. */
export function Scene() {
  const spec = useSim((s) => s.spec);
  const run = useSim((s) => s.run);
  const camera = useSim((s) => s.camera);
  const setCamera = useSim((s) => s.setCamera);
  const hasModel = useModelAvailable();

  return (
    <div className="relative h-full w-full bg-void">
      <Canvas
        gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
        camera={{ fov: 46, near: 0.4, far: 400000, position: [-30, 18, 34] }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={1.6} />
        <directionalLight position={[1, 2, 1]} intensity={0.9} />
        <Rail
          lengthM={spec.launch.rail_length_m}
          angleDeg={spec.launch.rail_angle_deg}
          groundAltitude={spec.atmosphere.ground_altitude_m}
        />
        <Suspense fallback={null}>
          <Aircraft hasModel={hasModel === true} />
        </Suspense>
        <TrailLayer />
        <CameraRig />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 p-2">
        <div className="pointer-events-auto flex gap-px">
          {(["chase", "rail", "side", "top", "orbit"] as CameraPreset[]).map((c, i) => (
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
        </div>
        {hasModel === false && (
          <div className="pointer-events-none absolute bottom-2 left-2 border border-rule bg-void px-2 py-1 text-[10px] text-dim">
            Placeholder airframe. Drop reaper.glb into /public/models/ for the real geometry.
          </div>
        )}
        {run && <ViewportHud />}
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
      rows.forEach((el) => {
        const k = el.dataset.k as string;
        const map: Record<string, string> = {
          mach: fixed(s.mach, 3, 6),
          alt: fixed(s.h_m, 0, 6),
          tas: fixed(s.v_tas_ms, 1, 6),
          gam: fixed(s.gamma_deg, 1, 6),
          rng: fixed(s.s_ground_m / 1000, 2, 6),
          thr: fixed(s.throttle_act * 100, 0, 4),
        };
        el.textContent = map[k] ?? "";
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
