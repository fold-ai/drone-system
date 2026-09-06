"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Planform, PlanformSpec } from "@/lib/types";
import { buildAct1, disposeParts } from "./geometry";
import { ensureFieldAttribute } from "./materials";

const MODEL_URL = "/models/act1.glb";

/** Parts the outline pass must leave alone: thin plates and anything inside a duct. */
const NO_HULL = new Set(["spike", "tip_L", "tip_R", "fin_L", "fin_R", "nozzle"]);

export type AirframeSource = "cad" | "parametric";

/** True once the CAD mesh has been confirmed present. */
export function useModelAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((r) => alive && setOk(r.ok && (r.headers.get("content-type") ?? "").indexOf("html") < 0))
      .catch(() => alive && setOk(false));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

/**
 * CAD mesh.
 *
 * Named parts from the export contract in public/models/README.md are honoured
 * when present, so the field shader can address the radome, the wing and the
 * engine separately. An unnamed single mesh still loads; it just colours as one
 * surface.
 */
function CadAirframe({
  lengthM,
  material,
  accent,
  hull,
}: {
  lengthM: number;
  material: THREE.Material;
  accent: THREE.Material;
  hull: THREE.Material;
}) {
  const { scene } = useGLTF(MODEL_URL);

  const model = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const k = lengthM / longest;
    root.scale.setScalar(k);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    root.position.sub(centre.multiplyScalar(k));

    const shells: { mesh: THREE.Mesh; parent: THREE.Object3D }[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      ensureFieldAttribute(m.geometry);
      const name = m.name || "";
      const isAccent = /spike|centrebody|tip_|elevon|flap/i.test(name);
      m.material = isAccent ? accent : material;
      if (!NO_HULL.has(name) && !/spike|centrebody/i.test(name)) {
        const shell = new THREE.Mesh(m.geometry, hull);
        shell.renderOrder = -1;
        shells.push({ mesh: shell, parent: m.parent ?? root });
      }
    });
    shells.forEach(({ mesh, parent }) => parent.add(mesh));
    return root;
  }, [scene, lengthM, material, accent, hull]);

  return <primitive object={model} />;
}

/**
 * Parametric airframe.
 *
 * Lofted from the planform stations the solver publishes, so span, length,
 * sweep, crank, thickness and twist in the specification all move the shape on
 * screen. It is built from the specification, not measured from the CAD, and the
 * viewport badge says so.
 */
function ParametricAirframe({
  planform,
  planformSpec,
  material,
  accent,
  hull,
}: {
  planform: Planform;
  planformSpec: PlanformSpec;
  material: THREE.Material;
  accent: THREE.Material;
  hull: THREE.Material;
}) {
  const parts = useMemo(() => {
    const built = buildAct1(planform, planformSpec);
    built.forEach((p) => ensureFieldAttribute(p.geometry));
    return built;
  }, [planform, planformSpec]);

  useEffect(() => () => disposeParts(parts), [parts]);

  return (
    <group>
      {parts.map((p) => (
        <group key={p.name} name={p.name}>
          <mesh geometry={p.geometry} material={p.accent ? accent : material} />
          {!NO_HULL.has(p.name) && (
            <mesh geometry={p.geometry} material={hull} renderOrder={-1} />
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * The ACT-1 airframe. Attitude is the solved flight-path angle and heading,
 * with no cosmetic banking added; a bank angle only appears when a commanded
 * turn produces one.
 */
export function Act1({
  lengthM,
  source,
  planform,
  planformSpec,
  material,
  accent,
  hull,
}: {
  lengthM: number;
  source: AirframeSource;
  planform: Planform | null;
  planformSpec: PlanformSpec;
  material: THREE.ShaderMaterial;
  accent: THREE.ShaderMaterial;
  hull: THREE.ShaderMaterial;
}) {
  const exhaust = useRef<THREE.Mesh>(null);
  const exhaustMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const el = exhaust.current;
    const mat = exhaustMat.current;
    if (!el || !mat) return;
    const t = (el.userData.throttle as number | undefined) ?? 0;
    el.scale.set(1, Math.max(0.001, t * 1.6 + 0.15), 1);
    mat.opacity = 0.1 + t * 0.45;
  });

  return (
    <group>
      {source === "cad" ? (
        <CadAirframe lengthM={lengthM} material={material} accent={accent} hull={hull} />
      ) : planform ? (
        <ParametricAirframe
          planform={planform}
          planformSpec={planformSpec}
          material={material}
          accent={accent}
          hull={hull}
        />
      ) : null}
      <mesh
        ref={exhaust}
        name="exhaust"
        position={[-lengthM * 0.5, lengthM * 0.05, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[lengthM * 0.05, lengthM * 0.5, 14, 1, true]} />
        <meshBasicMaterial
          ref={exhaustMat}
          color="#8FD8FF"
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

useGLTF.preload?.(MODEL_URL);
