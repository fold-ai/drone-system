"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MODEL_URL = "/models/reaper.glb";

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

function GlbAirframe({ lengthM }: { lengthM: number }) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(lengthM / longest);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    root.position.sub(centre.multiplyScalar(lengthM / longest));
    return root;
  }, [scene, lengthM]);
  return <primitive object={model} />;
}

/**
 * Procedural blended delta used when the GLB is absent. Same span and length as
 * the configured airframe, and labelled as a placeholder wherever it is shown.
 */
function PlaceholderAirframe({ lengthM, spanM }: { lengthM: number; spanM: number }) {
  const geo = useMemo(() => {
    const L = lengthM;
    const b = spanM / 2;
    const shape = new THREE.Shape();
    shape.moveTo(L * 0.5, 0);
    shape.lineTo(-L * 0.34, b);
    shape.lineTo(-L * 0.5, b * 0.62);
    shape.lineTo(-L * 0.5, -b * 0.62);
    shape.lineTo(-L * 0.34, -b);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: L * 0.045, bevelEnabled: false });
    g.translate(0, 0, -L * 0.0225);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [lengthM, spanM]);

  const fin = useMemo(() => new THREE.BoxGeometry(lengthM * 0.2, lengthM * 0.16, 0.012), [lengthM]);

  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>
      <mesh geometry={fin} position={[-lengthM * 0.4, lengthM * 0.08, 0]}>
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <lineSegments position={[-lengthM * 0.4, lengthM * 0.08, 0]}>
        <edgesGeometry args={[fin]} />
        <lineBasicMaterial color="#6b6b6b" />
      </lineSegments>
      <mesh position={[lengthM * 0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[lengthM * 0.07, lengthM * 0.075, lengthM * 0.62, 16]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  );
}

/**
 * The aircraft. Attitude is the solved flight-path angle and heading, with no
 * cosmetic banking added; a bank angle only appears when a commanded turn
 * produces one.
 */
export function Reaper({
  lengthM,
  spanM,
  hasModel,
}: {
  lengthM: number;
  spanM: number;
  hasModel: boolean;
}) {
  const exhaust = useRef<THREE.Mesh>(null);
  const exhaustMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const el = exhaust.current;
    const mat = exhaustMat.current;
    if (!el || !mat) return;
    const th = el.userData.throttle as number | undefined;
    const t = th ?? 0;
    el.scale.set(1, Math.max(0.001, t * 1.6 + 0.15), 1);
    mat.opacity = 0.12 + t * 0.5;
  });

  return (
    <group>
      {hasModel ? (
        <GlbAirframe lengthM={lengthM} />
      ) : (
        <PlaceholderAirframe lengthM={lengthM} spanM={spanM} />
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
          color="#ffffff"
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
