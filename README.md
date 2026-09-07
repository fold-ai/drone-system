# Actprove

One Next.js application, one deployment, one domain.

    /                 public marketing site, ships as it was written
    /admin-pro        ACT-1 flight-test console
    /admin-pro/aero   detached aerodynamics window
    /admin-pro/study  airframe study
    /api/*.py         Python solver, Vercel serverless functions

## Two design systems in one app

The site and the console look nothing alike and neither may restyle the other.
They are separate root layouts under route groups, `app/(public)` and
`app/(console)`, each importing its own stylesheet and its own font pair. The
App Router only ships the CSS a route's own tree imports, so the marketing page
never loads Tailwind or the instrument palette and the console never loads the
site's. The build confirms it: `/` pulls one stylesheet with Archivo and the
site tokens, `/admin-pro` pulls another with Inter Tight, Tailwind and the
console tokens, and neither contains the other's.

The console's fixed-viewport rules sit on `.console-root` rather than on `body`,
so even if both stylesheets were ever served together the instrument panel could
not reach a page outside it.

The marketing site stays JSX. `allowJs` is on so TypeScript can resolve those
modules for Next's generated route types; `checkJs` is off, so the JavaScript is
never type-checked and never needed rewriting.

Unmatched URLs, including unknown paths under `/admin-pro`, fall to a catch-all
in the public group and render the public 404. It confirms nothing about what
else exists.

## Access

The console is not reachable by guessing the URL. `middleware.ts` gates
`/admin-pro/*` and `/api/*` and sends unauthenticated page requests to
`/admin-pro/login`; unauthenticated API requests get 401 JSON instead, because a
fetch cannot do anything useful with a redirect to an HTML form. The solver is
gated with the console deliberately: an open solver endpoint hands out the whole
model to anyone who finds it.

Sessions are a signed JWT in an httpOnly, sameSite lax cookie, secure in
production. Two clocks: `exp` is thirty minutes and slides forward while the
operator is active, `sst` records when the session began and does not, so an
active session still ends at a twelve-hour ceiling. Refreshing cannot extend a
session indefinitely. Middleware verifies on the Edge and never touches the
database.

Passwords are argon2id at the OWASP parameters, hashed with `hash-wasm` rather
than a native binding so there is no prebuilt binary to be missing at deploy
time. Login is rate limited by address and by account, counted in Postgres
because a serverless instance's memory is recreated often enough to be no limit
at all. A wrong password and an unknown account return the same message in
comparable time, so the endpoint cannot be used to enumerate operators.

Headers: `Content-Security-Policy` permitting the `data:` and `blob:` URLs the
WebGL canvas and the trajectory decoder need, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, and on the console `X-Frame-Options: DENY`
with `frame-ancestors none`.

### Moving the console to a subdomain

`lib/auth/config.ts` decides what counts as a console request. Set
`CONSOLE_GATE_STRATEGY=host` and `CONSOLE_HOST=admin.actprove.com` and the gate
keys off the host header instead of the path. `middleware.ts` never inspects the
path itself, so that is a configuration change, not a refactor.

### Known gaps

- **No password reset.** There is no email flow, deliberately, rather than a
  half-built one. A locked-out operator needs someone with database access to
  write a new argon2id hash into `operators.password_hash`. Add reset when there
  is a mail sender worth trusting.
- **No multi-factor.** Single factor only.
- **Rate-limit rows are never pruned.** `login_attempts` grows without bound.
  The window query is indexed so it stays fast, but a cleanup job is owed.
- **`unsafe-inline` and `unsafe-eval`** are in the CSP because the framework
  needs them. Removing them means nonces on every response, which would make the
  static marketing page dynamic. The trade is recorded rather than hidden.

## Geometry, and a break in comparability

The planform is measured from the plan-view CAD render and lives in
`api/_core/geometry_ratios.py` as two tables: half-span against station, which
fixes the leading edge, and chord against span fraction, which fixes the
trailing edge from it. Reference area and mean aerodynamic chord are integrals
of those tables, so they cannot drift away from the drawn shape.

    b/L    0.722        S/L^2  0.368        MAC/L  0.591        AR  1.42

**The render carries no dimensions.** Overall length is the one dimensional
input and everything else is a ratio of it. The console states the assumed
length in its header, next to the span and area it implies, because that
assumption sits under every number on the screen. Nothing derived from it should
ever be presented as a CAD dimension.

`scripts/gen_types.py` generates the same tables into
`lib/planform-measured.mjs`, which recomputes the integrals in JavaScript rather
than copying the results. A test compares the two implementations; they agree to
machine precision.

A supplied span, area or mean chord more than 2% from the measured planform now
**refuses to solve**. A wrong reference area puts the induced-drag factor wrong
and every range figure downstream with it, silently. Better a failure.

### Migration note: runs from before this change are not comparable

The specification previously carried span 1.10 m, area 0.30 m2 and length 2.00 m,
which is aspect ratio 4.03. The drawn aircraft is 1.42. Induced drag scales as
1 / (pi AR e), so the factor was wrong by 2.85, and the reference area the whole
polar is written against was wrong by a factor of five.

Every number the project produced before this commit used that geometry. They
are not comparable with anything produced after it:

| | Before, AR 4.03 | After, measured AR 1.42 |
|---|---|---|
| Reference area at 2 m length | 0.300 m2 | 1.471 m2 |
| Span | 1.100 m | 1.444 m |
| Mean aerodynamic chord | 0.273 m | 1.183 m |
| Induced-drag factor k | 0.1096 | 0.3119 |
| L/D max | 9.75 | 5.78 |
| Max level Mach, 15 kg at 3000 m | 0.599 | 0.298 |
| Stall speed at 15 kg, sea level | 29.8 m/s | 13.5 m/s |
| Booster impulse, 3 m rail | 425 N s | 190 N s |
| Thrust shortfall at M 1.0 | 11.5x | 56.4x |

Stored runs from before this change carry the old reference geometry. This is
why `runs` records `solver_version` and `git_sha`: without them the history
becomes uninterpretable the first time the physics moves, and it just moved.
Treat anything recorded earlier as a different aircraft.

### Length has to move everything

Length being the authoritative input only means something if writing it moves
the whole aeroplane. Span, reference area, mean chord and all six mass stations
are derived from it by `AirframeSpec.rescale()`, and both writers go through
that one function: the optimiser's design vector and the study page's parameter
sweep.

Setting the field on its own is the failure this guards against. The aircraft
keeps the previous length's centre of gravity and neutral point, and the static
margin that comes out is a plausible-looking number for an aeroplane that was
never built. Two tests pin it: every dimension scales with length through both
writers, and the neutral point stays at x/L 0.497 at every length.

Aspect ratio means one thing in both places as well. It re-lofts the measured
planform at constant reference area, span times the stretch and every chord
divided by it, so AR goes as stretch squared. Two definitions of the same word
would have the optimiser and the sensitivity table quietly disagreeing about the
same aircraft.

## Interpretation, and what the model is not allowed to do

An OpenAI model writes the commentary on `/admin-pro/optimise`. It is given the
optimisation result, the sensitivity table and the drag breakdown as structured
JSON and asked what the search found, which constraints bind, which parameters
are worth engineering effort, and what to look at next.

Three things are enforced in code rather than asked for in the prompt.

**It cannot introduce a number.** Every numeric literal in the reply is
extracted and looked for in the JSON it was given, allowing for rounding, a
fraction quoted as a percentage and thousands separators. Anything absent is
returned as unverified and rendered struck through, with the count stated above
the text. The prompt also forbids it, which is necessary and not sufficient.

**Its input is assembled server-side.** The route reads the optimisation from
Postgres and calls the solver itself. If the browser supplied the source JSON,
the numbers the reply is checked against would be whatever the client chose to
send, and the check would prove nothing.

**It is never asked which design to build.** The questions are all about what
the computed results mean. The optimiser proposes, the operator disposes, and
nothing on the page writes a design back into the console.

The text is labelled `WRITTEN BY A LANGUAGE MODEL` wherever it appears and drawn
in a colour used for nothing else, because a paragraph that reads like solver
output will be trusted like it. It sits beside its own source table so a wrong
claim is visible without going to look for it.

The key is read from `OPENAI_API_KEY` inside the route handler and never reaches
the browser bundle; the build is grepped for it. Spend is capped by
`OPENAI_MAX_COST_USD` per review, the token cost is recorded in `ai_reviews`
next to the text, and an identical question is served from the stored answer
rather than paid for twice. `OPENAI_BASE_URL` points the route at a compatible
endpoint or a stub.

Without a key the page still works. The review is commentary; the computed
results stand on their own.

## Database

Plain SQL migrations under `db/migrations`, forward-only, one transaction each,
applied by `npm run migrate`. Steps are `.sql`, or `.mjs` exporting `up(client)`
for the ones SQL cannot express. `npm run migrate:status` lists what is applied.

The first operator is seeded by `0002_seed_first_operator.mjs`, which reads
`SEED_OPERATOR_EMAIL` and `SEED_OPERATOR_PASSWORD` from the environment once and
stores neither. There is no password anywhere in the repository. With the
variables unset the step records itself as applied and does nothing, which is
correct on a deployment where the operator already exists.

`npm run db:smoke` writes one row into every table, reads it back and rolls
back. A schema nobody has inserted into is a guess.

### Records

    airframes           a shape, its assumed length and the spec that goes with it
    runs                one solve, with the spec hash, solver version and git sha
    run_summary         the numbers the library sorts and filters on
    run_warnings        diagnostics, by severity
    run_events          the flight event list
    trajectories        the encoded float buffer, as bytea
    bench_runs          uploaded measurements
    validation_points   model against measurement, with the residual
    optimisations       a search, its objective, constraints and status
    ai_reviews          an interpretation, its inputs and what it cost

A trajectory is 18 000 samples across 41 columns. As rows that is three quarters
of a million per run, so it is stored as the shuffled, deflated float32 buffer
the solver already produces: 1.1 MB in the database against 2.9 MB raw, with no
re-encoding on read and no second format to keep in step.

`runs` is indexed on `(airframe_id, created_at)` for the library and on
`spec_hash` so an identical solve is served from the table instead of
recomputed. `solver_version` and `git_sha` are on every run because the physics
moved once already and will again; runs on either side of a move are not
comparable and these columns are how you tell.

### Retention

Payloads are the only large thing here. `trajectories.pinned` marks the ones
that must never be pruned.

**Policy.** Unpinned payloads older than 90 days are candidates for pruning. Pin
anything that backs a decision, a validation point or an AI review. Pruning
deletes the payload row only: the summary, warnings and events survive, so a
pruned run stays in the library and stays sortable, and only loses its charts.

Nothing deletes automatically yet, deliberately. The policy is written down and
the column exists; a job that acts on it needs a retention decision from someone
who owns the data, not a default chosen here. The candidate set is one query:

    SELECT run_id, bytes, created_at FROM trajectories
     WHERE pinned = FALSE AND created_at < NOW() - INTERVAL '90 days'
     ORDER BY bytes DESC;

---

## The simulation

Internal flight-performance simulation and test platform for the ACT-1 UAV.

A carbon-composite, turbojet-powered UAV is modelled from rail launch through
climb, acceleration, cruise and descent. Every number on screen comes from the
physics solver. Nothing is clamped, smoothed or curve-fitted toward a nicer
answer, and the interface never displays a quantity the solver did not produce.

---

## The headline result

A 250 N class turbojet cannot push this airframe through Mach 1 in level flight.
Ram drag on the captured stream is what stops it: at 3000 m and 200 m/s the
engine makes 126 N of net thrust against 250 N static, and by M 1.0 it makes 88 N
against the 1014 N the drag polar demands.

| Configuration (3000 m, 15 kg) | Max level Mach | Thrust at M 1.0 | Drag at M 1.0 |
|---|---|---|---|
| Default, S = 0.30 m2 | **0.599** | 88 N | 1014 N |
| S = 0.18 m2 | 0.718 | 88 N | 609 N |
| S = 0.18 m2, CD0 0.016 | 0.762 | 88 N | 538 N |
| S = 0.18, CD0 0.016, 11 km, 12 kg | 0.786 | 41 N | 174 N |

Fifty-four configurations across wing area, CD0, altitude and mass were swept in
`tests/test_physics.py`. The best of them reaches M 0.786. The tool's job is to
show the size of that gap and which levers actually move it, which is why the
aerodynamics panel leads with the thrust-against-drag crossing plot and a Mach 1
deficit readout.

## Launch

The engine cannot launch this aircraft. On a 3 m rail at 45 degrees it reaches
8.2 m/s against a stall speed of 28.3 m/s, so a RATO booster is mandatory.

Solved minimum booster for a 3 m rail: **2302 N for 184 ms, 425 N s, 18 g peak.**

Total impulse is close to invariant with rail length while thrust falls roughly
as one over length. A longer rail buys a smaller motor, not less energy:

| Rail | Thrust | Burn | Impulse | Peak |
|---|---|---|---|---|
| 1.5 m | 4741 N | 92 ms | 437 N s | 36 g |
| 3.0 m | 2302 N | 184 ms | 425 N s | 18 g |
| 6.0 m | 1082 N | 368 ms | 399 N s | 9 g |
| 10.0 m | 594 N | 613 ms | 364 N s | 5 g |

---

## Running it

```bash
python3 -m venv .venv && .venv/bin/pip install numpy   # numpy is only needed for bench-data fitting
npm install
npm run dev          # solver on :8787, console on :3000
```

`npm run dev` starts two processes. `scripts/dev_api.py` serves `/api/simulate`
and `/api/feasibility` from the same handler modules Vercel runs, and
`next.config.ts` proxies `/api/*` to it in development only. The browser talks to
one URL shape in both environments.

| Command | What it does |
|---|---|
| `npm run test` | The physics validation suite (also runs under `pytest tests/`) |
| `npm run checkpoint` | Prints the stage 1 solver report reproduced above |
| `npm run types` | Regenerates `lib/types.ts` from the Python dataclasses |
| `npm run types:check` | Fails if `lib/types.ts` is out of date |
| `npm run build` | Production build |

### Deploying

`vercel deploy`. `vercel.json` gives the Python functions a 10 s ceiling and
1769 MB, which is one full vCPU. **The Vercel preview deploy is the one thing in
this build that has not been verified**, because it needs an account; the
runtime differs from local CPython and the timing below should be re-measured
there.

---

## Architecture

The Python solver is authoritative and batch. It does not stream.

1. The console posts a complete `MissionSpec` to `POST /api/simulate`.
2. Python integrates the whole flight and returns a `Trajectory`: 50 Hz state
   samples plus a summary, events, the fuel budget and the performance envelope.
3. The browser plays that back against a clock at 0.25x, 1x, 2x or 10x with a
   scrub timeline. The 3D view and every gauge read from the playback cursor.
4. Moving the throttle lever at playback time *t* writes a node into the throttle
   schedule at *t*, re-posts with a `resume` state, and splices the new
   trajectory in from *t* onward.

Physics stays deterministic and reproducible, there is no second copy of the
model in JavaScript, and it fits serverless cleanly. There is no websocket.

### Wire format

A 300 s mission at 50 Hz is 15 150 samples across 41 columns; the 150 km mission
the slider allows is 42 877. As JSON numbers those are 5.0 MB and 14 MB, both
over Vercel's 4.5 MB response limit, and each costs the browser a parse of
hundreds of thousands of numbers before the first frame.

The columns therefore travel as one little-endian float32 buffer, byte-plane
shuffled, deflated and base64 encoded. The shuffle groups every float's first
byte together, then every second byte, and so on; across smooth telemetry the
exponent and high-mantissa planes are nearly constant, so deflate finds the
redundancy that interleaved bytes hide from it.

| Mission | Samples | float32 | Plain base64 | Shuffled, deflated, base64 |
|---|---|---|---|---|
| 50 km | 15 150 | 2.48 MB | 3.31 MB | **0.57 MB** |
| 90 km | 26 242 | 4.30 MB | 5.74 MB | **0.67 MB** |
| 150 km | 42 877 | 7.03 MB | 9.38 MB | **0.99 MB** |

Nothing is lost. float32 carries about seven significant digits, finer than any
quantity here is known to, and the compression is exact. The browser undoes it
with `DecompressionStream`, which is native, and reads the result straight into
`Float32Array` views with no per-value parsing. Encoding costs 30 to 65 ms.

If a caller drives the duration far past what the interface allows and the
encoded body would still exceed 4 MB, the encoder decimates the output, reports
the stride, and adds a warning. It never emits a body that cannot be delivered.

`?format=f32raw` skips the compression, `?format=json` returns plain arrays (the
tests use that path) and `?format=csv` returns the trajectory as CSV.

### Measured timings

Local, Apple silicon, CPython 3.13:

| Operation | Time |
|---|---|
| Full 303 s mission, dt = 0.005 s, 60 600 RK4 steps | 520 - 620 ms solver |
| Same, browser round trip including decode | 860 ms |
| 150 km mission, 857 s, 171 400 RK4 steps | 1740 ms solver, 2475 ms round trip |
| Interactive re-solve spliced from t+240 s | 138 ms solver, 199 ms round trip |
| Interactive re-solve spliced from t+150 s | 292 ms solver, 486 ms round trip |
| Interactive re-solve spliced from t+60 s | 427 ms solver, 624 ms round trip |
| `/api/feasibility`, sizing and envelope only | 23 ms |
| `/api/feasibility` with booster solve and rail trade | 118 ms |

The splice cost scales with how much flight remains, so a late throttle change
lands inside the 300 ms target and an early one takes about twice that. The
solve time is dominated by CPython interpreter overhead, not by arithmetic: the
transcendental functions in the derivative account for about 30 ms of a 520 ms
solve, so there is no headroom to be had by simplifying the physics.

Expect the Vercel runtime to be slower than these figures. Even at three times
the local cost the longest mission the interface allows stays inside the 10 s
function ceiling.

---

## The physics

3-DOF point mass in the vertical plane plus heading for ground track. RK4, fixed
`dt = 0.005 s`, output decimated to 50 Hz. Step-size convergence is checked in
the suite: halving dt moves maximum Mach by 2e-6 and ground range by 4.6 m.

**Atmosphere** (`_core/atmosphere.py`). ISA troposphere and lower stratosphere,
with an optional non-standard-day offset and a constant headwind. At 3000 m the
model gives rho 0.9091 kg/m3 and a 328.58 m/s.

**Engine** (`_core/engine.py`). Momentum model with ram drag subtracted:

```
mdot(h, M, d) = mdot_0 * (rho/rho_0) * spool(d) * sqrt(1 + 0.35 M^2)
T_net         = mdot * (Ve - V_inf)
```

Commanded and actual throttle are separate state variables with a first-order
spool lag, 2.0 s up and 1.2 s down, and both are plotted. Every constant carries
a note on where the number came from. `EngineProfile.from_bench_data()` refits
the deck from a test-stand CSV of throttle, thrust and fuel flow; a static run
constrains only the product `mdot_0 * Ve`, so pass a measured exhaust velocity to
split it. The suite round-trips a synthetic bench file back to the deck that
generated it.

**Aerodynamics** (`_core/aero.py`). Parabolic polar with a tanh-blended transonic
rise, not a step. Per-sample output includes dynamic pressure, L/D, thrust margin,
specific excess power, the CD0 / induced / wave split, Reynolds number and a
wave-drag flag.

**Launch** (`_core/launch.py`). Constrained 1-DOF slide along the rail, then a
handoff to free flight at the rail vector. Feasibility requires the exit speed to
reach 1.15 x stall. The booster solver is a secant search on thrust with the burn
time converged onto the actual rail transit time, which is the minimum-thrust
solution; it answers in 8 ms, so the mission panel can call it while a slider
moves.

**Mission coupling** (`_core/mission.py`). The operator picks a distance. Climb
and descent legs are integrated over altitude, the cruise leg is sized by Breguet
range for a jet, a reserve is added, and the resulting fuel mass feeds back into
gross mass, wing loading, stall speed, the rail-exit requirement and maximum
Mach. The same calculation produces the mission timeline, so the generated
schedules and the fuel budget always describe the same flight. Requesting more
range than the tank can carry is reported, never clamped.

### What the model says that the brief's mock-up did not

Two results are worth flagging because they are not what a first look suggests.

**Cruise L/D is 1.17, not 12.** At the requested M 0.55 and 3000 m, dynamic
pressure is 14.9 kPa and the wing carries CL 0.028. Drag is essentially all
parasite. Best L/D for this polar is 9.75 and it occurs at CL 0.468, which is
45 m/s. The airframe has an enormous speed range and cruising at M 0.55 is a long
way from its efficient point. That is a real design finding, not a modelling
error, and the panel shows both numbers side by side.

**The minimum sensible mission is about 31 km.** Climbing to 3000 m at 30 m/s
covers 18.2 km and the descent covers 13.1 km. Below that the profile has no
cruise leg at all, and the tool says so rather than inventing one.

**Static margin falls to 0.9% MAC as the tank empties**, from 6.5% full, against
a 3% limit. The default tank station is forward of the neutral point, so burning
fuel walks the CG aft. The console raises it as a warning on every run.

### Validation

`tests/test_physics.py`, 35 checks, run with `npm run test` or `pytest tests/`.
The required ones from the brief:

- ISA at 3000 m within 0.5% on density and speed of sound.
- Zero-thrust glide reaches the analytic L/D max within 2%; the integrated glide
  peaks at 9.748 against an analytic 9.748.
- With thrust and drag removed, total mechanical energy holds to 0.00002% over
  60 s across a 600 m altitude swing.
- Net thrust at 3000 m and 200 m/s is 126.4 N, 51% of the 250.2 N static figure.
- Maximum level speed for the default configuration is M 0.599, and M 0.718 with
  the wing cut to 0.18 m2.

Plus: tropopause continuity, spool time constant, bench-data refit, fuel burned
against the integrated flow, splice equivalence with a full solve, RK4 step
convergence, determinism, uniform 50 Hz output, range-to-mass coupling, headwind
and hot-day effects, and a check that no limit the solver applies is silent.

---

## Layout

Single full-viewport shell, four regions, resizable dividers, no page scroll.

- **Mission config**, left. Three tabs. `mission` carries the distance slider with
  live derived fuel, gross mass and stall speed; `launch` carries the rail, the
  feasibility verdict, the solved minimum booster and the rail-length trade;
  `model` is the parameter drawer. Every control's range, step, unit and default
  is generated from the Python dataclasses, so a control cannot offer a value
  the solver has not agreed to. Fields accept a typed unit - "3.5 km" into a
  metre field, "2.4 kN" into newtons, "85%" into a fraction - and clamp to the
  model limits. Shift with the arrows gives a tenth of a step. A changed field
  shows its delta from the held reference run.
- **3D viewport**, centre. Rail at the configured length and angle, a metric grid
  that follows the aircraft, range rings every 5 km, altitude posts every 10 km
  ticked at 500 m, all faded by exponential fog. The airframe is held to a
  40 px minimum by an exaggeration factor that is clamped at x8 and displayed;
  past the cap a locator ring marks it. Fresnel rim and an inverted-hull outline
  give it a silhouette against black. An attitude gnomon carries flight-path
  angle, heading and bank. Cameras chase, rail, side, top, cockpit and orbit on
  keys 1 to 6; drag orbits any of them, wheel zooms, R recentres. Attitude is the
  solved flight-path angle and heading with no cosmetic banking.
- **Aerodynamics**, right. Detaches into a real second browser window at `/aero`,
  synced over a `BroadcastChannel`, for a second monitor during a test review.
  The thrust-against-drag crossing plot is the one bold element on the screen.
- **Bottom track**. Throttle lever, four uPlot charts, and a pane that switches
  between the editable throttle schedule and the A/B table against the held
  reference run.
- **Below that**, the event strip - every flight event as a glyph and a time,
  clickable to seek - and the scrub timeline with phase bands.

Warnings are grouped into blocking and advisory, and each row links to the
instant it happened and to the controls that move it: a rail-exit failure jumps
straight to the rail length and booster sliders. Panels collapse, split sizes
persist, and "?" opens the keyboard map.

### Colour

One ramp, defined once in `lib/colormap.ts`, drives the 3D surface field, the
streamlines, the trajectory ribbon, the chart traces and the panel swatches, so
a colour means the same thing in every view:

| | | |
|---|---|---|
| `#0B1F4B` | deep blue | low |
| `#1E7FB5` | blue | |
| `#21B5A8` | cyan-teal | |
| `#4FC24A` | green | nominal |
| `#E3D24A` | yellow | |
| `#E8862E` | amber | limit |

Chrome stays neutral. Red (`#FF3B1F`) is not part of the ramp and appears only
for exceedance, always paired with a glyph so no state is carried by hue alone.
The ramp is monotonic in lightness and separates on the blue-yellow axis, which
is the axis red-green colour blindness leaves intact.

The airframe carries a selectable surface field: a Cp estimate from potential
flow over a sphere with a Prandtl-Glauert correction, local Mach derived from it,
or freestream dynamic pressure. A colourbar always accompanies it with the
domain, the units and the method. The streamlines are the analytic potential-flow
solution for a sphere, labelled "illustrative flow, not CFD" in the toolbar,
because a picture like that is easy to mistake for a Navier-Stokes result.

### Design

Six colour tokens and no more: `void #000000`, `panel #0A0A0A`, `rule #1C1C1C`,
`dim #6B6B6B`, `bright #FFFFFF`, `alert #FF3B1F`. `alert` is the only chromatic
value and it appears only when something is genuinely wrong. Inter Tight for
interface text, JetBrains Mono with tabular figures and fixed field widths for
every number, because digits must not reflow at 50 Hz. Zero border radius except
the throttle handle. Panels separated by 1px rules, not shadows. No motion beyond
a 60 ms border colour change; the only animation in the product is the playback
itself. `prefers-reduced-motion` disables the Mach cone tightening and keeps
playback.

---

## Layout of the source

```
api/
  simulate.py           MissionSpec -> Trajectory
  feasibility.py        launch, booster sizing, performance envelope
  _core/
    schema.py           every dataclass; the single definition of the wire format
    constants.py        physical constants
    atmosphere.py       ISA
    engine.py           EngineProfile + from_bench_data()
    aero.py             drag polar
    performance.py      thrust against drag, max level Mach, Mach 1 deficit
    launch.py           rail integration, feasibility, booster solver
    mission.py          range to fuel, mission timeline, schedules
    dynamics.py         RK4, rail phase, free flight, events
    derived.py          values the interface needs but must not recompute
    encode.py           float32 wire encoding and CSV
    httputil.py         request and response helpers
app/                    layout, console, api-client, /aero detached window
components/             viewport, panels, timeline, charts, ui
lib/                    store, types (generated), playback, broadcast, format
scripts/                gen_types.py, dev_api.py, checkpoint1.py
tests/test_physics.py
```

## Assets still to drop in

- `public/models/act1.glb` - the airframe. Until then the viewport draws a
  labelled placeholder with the configured span and length.
- `public/brand/actprove.svg` - chevron and wordmark, white on transparent. Until
  then the header draws the chevron inline.
- Engine bench data CSV - `EngineProfile.from_bench_data()` accepts it already.
