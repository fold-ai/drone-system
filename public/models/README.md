# ACT-1 airframe mesh

Drop the exported CAD geometry here as `act1.glb`.

Until it is present the viewport lofts a parametric surface from
`api/_core/planform.py` and labels itself `parametric airframe`. With the file
present the badge reads `CAD mesh` instead. The two are never confused, and the
parametric surface is never presented as CAD-exact.

## Export contract

| | |
|---|---|
| Format | glTF 2.0 binary, `.glb`, single file |
| Up axis | **+Y up** |
| Forward | **nose along +X**, starboard along +Z |
| Units | metres, 1 unit = 1 m |
| Origin | anywhere; the loader recentres on the bounding box |
| Scale | any; the loader scales the longest bounding-box axis to `airframe.length_m` |
| Geometry | triangulated, normals included, no n-gons |
| Materials | none required |
| Textures | none required |
| Size | under 4 MB |

Normals must be exported. The surface shader lights from a fresnel rim and a key
that follows the camera, and a mesh with no normals renders as a flat
silhouette. No textures are needed because the field shader vertex-colours the
surface from the flight condition; any material in the file is replaced on load.

Blender: File, Export, glTF 2.0. Format `glTF Binary (.glb)`, +Y up on, Apply
Modifiers on, Materials `No export`, Compression off.

## Part names

A single unnamed mesh loads fine and colours as one surface. Naming the parts is
better: the field shader can then address them separately, and the outline pass
can skip the ones it would otherwise swallow.

| Name | What it is | Field | Outline |
|---|---|---|---|
| `radome` | ogive nose, forward ~30% | yes | yes |
| `body` | centre body between the chines | yes | yes |
| `wing_L`, `wing_R` | cranked outer panels | yes | yes |
| `tip_L`, `tip_R` | outboard control surfaces on the trailing edge | no, accent | no |
| `inlet` | dorsal inlet duct and lip | yes | yes |
| `engine` | engine casing | yes | yes |
| `spike` | inlet centrebody cone | no, accent | **no** |
| `nozzle` | exhaust nozzle in the trailing-edge notch | yes | no |
| `fin_L`, `fin_R` | blade surfaces on the upper aft body | yes | no |

Matching is case-insensitive and substring-based, so `ACT1_wing_R_001` resolves
to `wing_R`. Anything unrecognised is treated as `body`.

`spike` is the one that matters most. The inlet centrebody sits inside the duct,
and the outline pass grows a shell along the surface normals; run over the spike
it produces a shell wider than the lip and the centrebody disappears inside its
own outline. It is excluded, and so are the thin plates, which have no volume for
a shell to grow into.

## Geometry the mesh should carry

Working nose-forward, matching the plan-view CAD:

- Ogive radome over roughly the forward 30% of overall length, circular in
  section, blending into the body with no step.
- A chine from the radome shoulder into the wing leading edge, so forebody and
  wing are one continuous surface.
- Cranked leading edge: inboard panel swept 65 to 70 degrees, outer panel about
  40, crank at 55 to 60% of semispan.
- Squared wingtips carrying outboard control surfaces on the trailing edge.
- Straight trailing edge, notched at the centreline for the exhaust.
- Small thin blade surfaces on the upper aft body, inboard of the tips.
- Dorsal propulsion: oval inlet with a long conical centrebody spike, then a
  cylindrical engine casing, exhausting at the trailing-edge notch.
- Span to length about 0.73.

## A warning about reference area

The drag polar is written against `airframe.wing_area_m2` and
`airframe.mac_m`. The console measures the planform the geometry actually
encloses and compares the two; when they disagree by more than
`airframe.planform_area_tolerance` it says so, because every drag coefficient,
L/D and static margin on screen is quoted against a reference area, and a mesh
that encloses a different area silently invalidates all of them.

At the current defaults they disagree by 416%. Exporting a CAD mesh does not fix
that on its own: the mesh and the reference area still have to be reconciled, in
the geometry panel or in the specification.
