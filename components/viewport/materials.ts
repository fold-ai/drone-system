/**
 * Airframe shading.
 *
 * On a black field an unlit body is a silhouette-free smudge. This material
 * gives it three things at once: a soft key from the camera side so form reads,
 * a fresnel rim so the outline separates from the background, and an optional
 * vertex-coloured scalar field sampled from the shared ramp.
 *
 * `uFieldMix` at 0 leaves the body neutral. Above 0 the ramp carries the field
 * and the body colour steps back, which is what keeps the aerodynamic data
 * legible rather than fighting the shading.
 */
import * as THREE from "three";
import { rampLUT } from "@/lib/colormap";

export interface AirframeUniforms {
  uFieldMix: { value: number };
  uFieldMode: { value: number };
  uRamp: { value: THREE.DataTexture };
  uBase: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uRimPower: { value: number };
  uRimStrength: { value: number };
  uLightDir: { value: THREE.Vector3 };
  uOpacity: { value: number };
  uMach: { value: number };
  uQ: { value: number };
  uQMax: { value: number };
  uMachDd: { value: number };
  uCpLo: { value: number };
  uCpHi: { value: number };
  [key: string]: { value: unknown };
}

/** Selectable surface scalar. Keep in step with FIELD_MODES below. */
export const FIELD_OFF = 0;
export const FIELD_CP = 1;
export const FIELD_MACH_LOCAL = 2;
export const FIELD_Q = 3;

export interface FieldMode {
  id: number;
  key: string;
  label: string;
  unit: string;
  /** How the value is arrived at, shown under the colourbar. */
  method: string;
}

export const FIELD_MODES: FieldMode[] = [
  { id: FIELD_OFF, key: "off", label: "off", unit: "", method: "Neutral body shading." },
  {
    id: FIELD_CP,
    key: "cp",
    label: "Cp",
    unit: "",
    method:
      "Potential flow over a sphere, Cp = 1 - 2.25 sin2(theta) from the local " +
      "surface incidence, corrected by Prandtl-Glauert. An illustration of where " +
      "pressure rises and falls, not a panel solution.",
  },
  {
    id: FIELD_MACH_LOCAL,
    key: "mach",
    label: "local Mach",
    unit: "M",
    method:
      "M_local = M_inf * sqrt(1 - Cp) from the Cp estimate above. Shows where the " +
      "flow accelerates over the body relative to the freestream.",
  },
  {
    id: FIELD_Q,
    key: "q",
    label: "dynamic pressure",
    unit: "kPa",
    method:
      "Freestream dynamic pressure from the solver, uniform over the airframe. " +
      "The body colour is the flight condition itself.",
  },
];

// Every custom shader here has to opt into logarithmic depth. The renderer runs
// with logarithmicDepthBuffer on so a scene spanning half a metre to two hundred
// kilometres does not z-fight; three injects the log-depth writes into its own
// materials but a hand-written shader has to include the chunks itself, and one
// that does not is drawn and then silently rejected by the depth test.
const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aField;
  varying float vField;
  varying vec3 vNormalW;
  varying vec3 vNormalM;
  varying vec3 vViewDir;

  void main() {
    vField = aField;
    vNormalM = normal;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uFieldMix;
  uniform int uFieldMode;
  uniform sampler2D uRamp;
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform vec3 uLightDir;
  uniform float uOpacity;
  uniform float uMach;
  uniform float uQ;
  uniform float uQMax;
  uniform float uMachDd;
  uniform float uCpLo;
  uniform float uCpHi;
  varying float vField;
  varying vec3 vNormalW;
  varying vec3 vNormalM;
  varying vec3 vViewDir;

  // Surface pressure coefficient from the local incidence to the freestream.
  //
  // Potential flow over a sphere gives Cp = 1 - 2.25 sin2(theta) exactly, where
  // theta is measured from the stagnation point. Applied to an arbitrary surface
  // normal it is an illustration of where pressure rises and falls, not a panel
  // solution, and the legend says so. Prandtl-Glauert carries it up in Mach.
  float pressureCoefficient(vec3 nModel) {
    vec3 flow = vec3(-1.0, 0.0, 0.0);   // nose is +X, freestream runs aft
    float cosT = clamp(dot(normalize(nModel), -flow), -1.0, 1.0);
    float sin2 = 1.0 - cosT * cosT;
    float cp0 = 1.0 - 2.25 * sin2;
    float beta = sqrt(max(0.06, 1.0 - uMach * uMach));
    return cp0 / beta;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);

    // Soft key plus a floor, so a face turned away is dim but never black.
    float key = max(dot(n, normalize(uLightDir)), 0.0);
    float shade = 0.30 + 0.70 * key;

    float t = vField;
    if (uFieldMode == 1) {
      float cp = pressureCoefficient(vNormalM);
      t = (cp - uCpLo) / max(1e-4, uCpHi - uCpLo);
    } else if (uFieldMode == 2) {
      float cp = pressureCoefficient(vNormalM);
      float local = uMach * sqrt(max(0.0, 1.0 - cp));
      t = local / max(1e-4, uMachDd);
    } else if (uFieldMode == 3) {
      t = uQ / max(1e-4, uQMax);
    }

    vec3 field = texture2D(uRamp, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
    vec3 body = mix(uBase, field, uFieldMix);

    // With a field on, flatten the key light: shading must not be mistaken for
    // data. The rim still carries the silhouette.
    float lit = mix(shade, 0.62 + 0.38 * key, uFieldMix);

    // Fresnel rim: the silhouette edge lights up, the facing surface does not.
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), uRimPower);
    vec3 col = body * lit + uRim * fres * uRimStrength;

    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function makeAirframeMaterial(opts?: {
  base?: string;
  rim?: string;
  opacity?: number;
}): THREE.ShaderMaterial {
  const uniforms: AirframeUniforms = {
    uFieldMix: { value: 0 },
    uFieldMode: { value: FIELD_OFF },
    uRamp: { value: rampLUT() },
    uBase: { value: new THREE.Color(opts?.base ?? "#242A31") },
    uRim: { value: new THREE.Color(opts?.rim ?? "#FFFFFF") },
    uRimPower: { value: 3.2 },
    uRimStrength: { value: 0.62 },
    uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
    uOpacity: { value: opts?.opacity ?? 1 },
    uMach: { value: 0 },
    uQ: { value: 0 },
    uQMax: { value: 20000 },
    uMachDd: { value: 0.82 },
    uCpLo: { value: -2.0 },
    uCpHi: { value: 1.0 },
  };
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: (opts?.opacity ?? 1) < 1,
  });
}

/**
 * Inverted hull. A slightly grown copy of the mesh drawn back-faces-only
 * produces a hard outline with no post-processing pass and no extra dependency,
 * which matters because the silhouette has to survive the aircraft being forty
 * pixels wide.
 */
export function makeHullMaterial(colour = "#FFFFFF", opacity = 0.4): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(colour) },
      uOpacity: { value: opacity },
      uGrow: { value: 0.045 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uGrow;
      void main() {
        // Grow along the normal in view space so the outline keeps an even
        // thickness whatever the viewing angle.
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mv.xyz += n * uGrow * -mv.z * 0.06;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColour;
      uniform float uOpacity;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(uColour, uOpacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

/** Give a geometry a zeroed `aField` attribute so the shader can bind. */
export function ensureFieldAttribute(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute("aField")) return;
  const n = geo.getAttribute("position")?.count ?? 0;
  geo.setAttribute("aField", new THREE.BufferAttribute(new Float32Array(n), 1));
}
