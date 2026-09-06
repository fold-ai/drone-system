"""Stage 1 report: trajectory summary and the two headline numbers."""
import math, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api"))
from _core import performance as perf
from _core.dynamics import simulate
from _core.engine import EngineProfile
from _core.launch import rail_length_trade, run_rail, solve_booster
from _core.schema import AirframeSpec, MissionSpec

W = 78
def hr(t=""): print(("-- " + t + " ").ljust(W, "-") if t else "-" * W)

spec = MissionSpec()
t0 = time.perf_counter(); r = simulate(spec); wall = (time.perf_counter() - t0) * 1000
s, f, p, l, m1 = r.summary, r.fuel, r.resolved.plan, r.launch, r.mach1
af, eng = spec.airframe, spec.engine

hr("ACT-1 SIM - STAGE 1 - HEADLESS SOLVER")
print(f"{spec.label} / {spec.config_name}    solve {wall:.0f} ms    {s.n_samples} samples "
      f"at {spec.integration.output_hz:.0f} Hz    dt {spec.integration.dt} s")
hr("CONFIGURATION")
print(f"  wing        S {af.wing_area_m2:.3f} m2   b {af.span_m:.2f} m   AR {af.aspect_ratio:.3f}   "
      f"e {af.oswald_e:.2f}   k {af.k_induced:.5f}")
print(f"  polar       CD0 {af.cd0_sub:.4f}   M_dd {af.mach_dd:.2f}   dCD_wave {af.dcd_wave:.3f}   "
      f"CL_max {af.cl_max:.2f}   L/D_max {af.ld_max():.2f}")
print(f"  engine      {eng.thrust_static_sl_n:.1f} N static   mdot0 {eng.mdot_0:.3f} kg/s   "
      f"Ve {eng.ve:.0f} m/s   TSFC {eng.tsfc_base:.3f} kg/(N h)")
print(f"  mass        dry {af.mass_dry_kg:.2f}   fuel {s.fuel_loaded_kg:.3f}   "
      f"booster {spec.launch.booster.mass_kg:.2f}   gross {s.gross_mass_kg:.2f} kg")
hr("MISSION PLAN FROM A %.0f km REQUEST" % spec.mission.mission_distance_km)
print(f"  climb       {p.t_climb_s:6.1f} s  {f.climb_distance_km:6.1f} km  "
      f"{p.climb_tas_ms:5.0f} m/s  throttle {p.climb_throttle:.2f}  fuel {f.fuel_climb_kg:.3f} kg")
print(f"  cruise      {p.t_cruise_s:6.1f} s  {f.cruise_distance_km:6.1f} km  "
      f"{p.cruise_tas_ms:5.0f} m/s  throttle {p.cruise_throttle:.2f}  fuel {f.fuel_cruise_kg:.3f} kg")
print(f"  descent     {p.t_descent_s:6.1f} s  {f.descent_distance_km:6.1f} km  "
      f"{p.descent_tas_ms:5.0f} m/s  throttle {p.descent_throttle:.2f}  fuel {f.fuel_descent_kg:.3f} kg")
print(f"  reserve                                                        fuel {f.fuel_reserve_kg:.3f} kg")
print(f"  required {f.fuel_required_kg:.3f} kg of a {f.fuel_capacity_kg:.2f} kg tank    "
      f"max range on a full tank {f.max_range_at_capacity_km:.0f} km    cruise L/D {f.cruise_ld:.2f}")
hr("FLOWN")
print(f"  max Mach          {s.max_mach:.4f}   ({s.max_tas_ms:.1f} m/s)")
print(f"  max altitude      {s.max_altitude_m:.0f} m        top of climb t+{s.time_to_cruise_s:.0f} s")
print(f"  max dynamic head  {s.max_q_pa / 1000:.2f} kPa      max load factor {s.max_load_factor:.2f} g")
print(f"  ground range      {s.ground_range_km:.2f} km      fuel remaining {s.fuel_remaining_kg:.3f} kg")
print(f"  best L/D seen     {s.best_ld:.2f}          min static margin {s.min_static_margin * 100:.1f}% MAC")
print(f"  stall {s.stalled}   flameout {s.flameout}   ground impact {s.ground_impact}   "
      f"wave drag {s.wave_drag_entered}   termination {s.termination}")
hr("LAUNCH - 3 m RAIL AT 45 deg")
bare = run_rail(spec, s.fuel_loaded_kg, booster_thrust_override=0.0, booster_burn_override=0.0)
print(f"  stall speed at launch mass          {l.v_stall_ms:.1f} m/s")
print(f"  required rail exit ({spec.launch.exit_margin:.2f} x V_stall)  {l.v_required_ms:.1f} m/s")
print(f"  engine thrust alone                 {bare.v_exit:.1f} m/s   FAIL")
print(f"  with the default {spec.launch.booster.thrust_n:.0f} N booster       "
      f"{l.v_exit_ms:.1f} m/s   {'PASS' if l.feasible else 'FAIL'}  "
      f"({l.margin_ratio:.2f} x V_stall, {l.peak_rail_accel_g:.0f} g peak)")
sol = solve_booster(spec, s.fuel_loaded_kg)
print(f"  minimum booster solved for 3 m      {sol.booster_thrust_n:.0f} N for "
      f"{sol.booster_burn_time_s * 1000:.0f} ms = {sol.booster_impulse_ns:.0f} N s")
print()
print("  rail length trade      %8s %9s %12s %8s" % ("thrust", "burn", "impulse", "peak"))
for row in rail_length_trade(spec, s.fuel_loaded_kg, [1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0]):
    print("    %5.1f m              %6.0f N %8.0f ms %9.0f N s %6.0f g"
          % (row["rail_length_m"], row["booster_thrust_n"], row["booster_burn_time_s"] * 1000,
             row["booster_impulse_ns"], row["peak_g"]))
hr("MACH 1 DEFICIT")
print(f"  {m1.note}")
print(f"  maximum level speed at {m1.altitude_m:.0f} m, {m1.mass_kg:.1f} kg: "
      f"M {m1.max_level_mach:.4f} ({m1.max_level_tas_ms:.0f} m/s)")
print()
print("  %-34s %10s %10s %10s" % ("configuration", "max M", "T@M1 N", "D@M1 N"))
for lbl, a, alt, mass in [
        ("default, 3000 m, 15 kg", AirframeSpec(), 3000.0, 15.0),
        ("wing 0.18 m2", AirframeSpec(wing_area_m2=0.18), 3000.0, 15.0),
        ("wing 0.18 m2, CD0 0.016", AirframeSpec(wing_area_m2=0.18, cd0_sub=0.016), 3000.0, 15.0),
        ("wing 0.18, CD0 0.016, 11 km, 12 kg", AirframeSpec(wing_area_m2=0.18, cd0_sub=0.016), 11000.0, 12.0)]:
    d = perf.mach1_deficit(a, eng, alt, mass)
    print("  %-34s %10.4f %10.0f %10.0f" % (lbl, d.max_level_mach, d.thrust_available_n, d.thrust_required_n))
hr("WARNINGS")
for w in r.warnings:
    print("  ! " + w)
hr("EVENTS")
for e in r.events:
    print(f"  t+{e.t:7.2f}  {e.severity:<5}  {e.kind:<18} {e.label}")
hr()
