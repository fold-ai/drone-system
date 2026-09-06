# Airframe model

Drop the ACT-1 geometry here as `act1.glb`.

The viewport loads `/models/act1.glb`, measures its bounding box and scales it
to `airframe.length_m` from the mission specification, so the model does not
need to be authored at any particular scale. Nose along +X, wings in the XZ
plane, canopy toward +Y.

Until the file is present the viewport draws a procedural blended delta with the
configured span and length, labelled as a placeholder in the corner of the
viewport. It is never silently substituted.
