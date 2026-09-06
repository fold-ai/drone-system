"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ensureFieldAttribute } from "./materials";

const MODEL_URL = "/models/act1.glb";

/** True once the airframe model has been confirmed present. */
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

/** Every geometry in the airframe, so the field colouring can address them. */
export type GeometrySink = (geometries: THREE.BufferGeometry[]) => void;

function GlbAirframe({
  lengthM,
  material,
  hull,
  onGeometries,
}: {
  lengthM: number;
  material: THREE.Material;
  hull: THREE.Material;
  onGeometries?: GeometrySink;
}) {
  const { scene } = useGLTF(MODEL_URL);

  const { model, geometries } = useMemo(() => {
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

    const geos: THREE.BufferGeometry[] = [];
    const hulls: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      ensureFieldAttribute(m.geometry);
      m.material = material;
      geos.push(m.geometry);
      const shell = new THREE.Mesh(m.geometry, hull);
      shell.renderOrder = -1;
      hulls.push(shell);
    });
    hulls.forEach((h, i) => {
      const src = geos[i];
      const owner = root.getObjectByProperty("geometry", src as never);
      (owner?.parent ?? root).add(h);
      if (owner) h.applyMatrix4(owner.matrix);
    });
    return { model: root, geometries: geos };
  }, [scene, lengthM, material, hull]);

  useEffect(() => onGeometries?.(geometries), [geometries, onGeometries]);
  return <primitive object={model} />;
}

/**
 * Procedural blended delta used when the GLB is absent. Same span and length as
 * the configured airframe, and labelled as a placeholder wherever it is shown.
 */
function PlaceholderAirframe({
  lengthM,
  spanM,
  material,
  hull,
  onGeometries,
}: {
  lengthM: number;
  spanM: number;
  material: THREE.Material;
  hull: THREE.Material;
  onGeometries?: GeometrySink;
}) {
  const parts = useMemo(() => {
    const L = lengthM;
    const b = spanM / 2;

    const shape = new THREE.Shape();
    shape.moveTo(L * 0.5, 0);
    shape.lineTo(-L * 0.34, b);
    shape.lineTo(-L * 0.5, b * 0.62);
    shape.lineTo(-L * 0.5, -b * 0.62);
    shape.lineTo(-L * 0.34, -b);
    shape.closePath();
    const wing = new THREE.ExtrudeGeometry(shape, { depth: L * 0.045, bevelEnabled: false });
    wing.translate(0, 0, -L * 0.0225);
    wing.rotateX(-Math.PI / 2);
    wing.computeVertexNormals();

    const body = new THREE.CylinderGeometry(L * 0.07, L * 0.075, L * 0.62, 18);
    body.rotateZ(Math.PI / 2);
    body.translate(L * 0.18, 0, 0);

    const nose = new THREE.ConeGeometry(L * 0.07, L * 0.2, 18);
    nose.rotateZ(-Math.PI / 2);
    nose.translate(L * 0.59, 0, 0);

    const fin = new THREE.BoxGeometry(L * 0.2, L * 0.16, L * 0.012);
    fin.translate(-L * 0.4, L * 0.11, 0);

    const all = [wing, body, nose, fin];
    all.forEach(ensureFieldAttribute);
    return all;
  }, [lengthM, spanM]);

  const edges = useMemo(() => new THREE.EdgesGeometry(parts[0], 20), [parts]);

  useEffect(() => {
    onGeometries?.(parts);
    return () => {
      parts.forEach((g) => g.dispose());
      edges.dispose();
    };
  }, [parts, edges, onGeometries]);

  return (
    <group>
      {parts.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} material={material} />
          <mesh geometry={g} material={hull} renderOrder={-1} />
        </group>
      ))}
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </lineSegments>
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
  spanM,
  hasModel,
  material,
  hull,
  onGeometries,
}: {
  lengthM: number;
  spanM: number;
  hasModel: boolean;
  material: THREE.ShaderMaterial;
  hull: THREE.ShaderMaterial;
  onGeometries?: GeometrySink;
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
      {hasModel ? (
        <GlbAirframe
          lengthM={lengthM}
          material={material}
          hull={hull}
          onGeometries={onGeometries}
        />
      ) : (
        <PlaceholderAirframe
          lengthM={lengthM}
          spanM={spanM}
          material={material}
          hull={hull}
          onGeometries={onGeometries}
        />
      )}
      <mesh
        ref={exhaust}
        name="exhaust"
        position={[-lengthM * 0.56, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[lengthM * 0.055, lengthM * 0.5, 14, 1, true]} />
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
