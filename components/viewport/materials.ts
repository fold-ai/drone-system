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
  uRamp: { value: THREE.DataTexture };
  uBase: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uRimPower: { value: number };
  uRimStrength: { value: number };
  uLightDir: { value: THREE.Vector3 };
  uOpacity: { value: number };
  [key: string]: { value: unknown };
}

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
  varying vec3 vViewDir;

  void main() {
    vField = aField;
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
  uniform sampler2D uRamp;
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform vec3 uLightDir;
  uniform float uOpacity;
  varying float vField;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);

    // Soft key plus a floor, so a face turned away is dim but never black.
    float key = max(dot(n, normalize(uLightDir)), 0.0);
    float shade = 0.30 + 0.70 * key;

    vec3 field = texture2D(uRamp, vec2(clamp(vField, 0.0, 1.0), 0.5)).rgb;
    vec3 body = mix(uBase, field, uFieldMix);

    // Fresnel rim: the silhouette edge lights up, the facing surface does not.
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), uRimPower);
    vec3 col = body * shade + uRim * fres * uRimStrength;

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
    uRamp: { value: rampLUT() },
    uBase: { value: new THREE.Color(opts?.base ?? "#242A31") },
    uRim: { value: new THREE.Color(opts?.rim ?? "#FFFFFF") },
    uRimPower: { value: 3.2 },
    uRimStrength: { value: 0.62 },
    uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
    uOpacity: { value: opts?.opacity ?? 1 },
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
