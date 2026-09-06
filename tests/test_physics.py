"""Validation suite for the REAPER solver.

These are not unit tests of the code, they are checks against closed-form answers
and against the performance the airframe is physically capable of. The last group
is the important one: a 250 N turbojet cannot push this aircraft to Mach 1 in
level flight, and any change that makes the model claim otherwise must fail here.

Run with `pytest tests/` or directly with `python tests/test_physics.py`.
"""
from __future__ import annotations

import copy
import math
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api"))

from _core import performance as perf                                    # noqa: E402
from _core.aero import cd0_of_mach, stall_speed                          # noqa: E402
from _core.atmosphere import isa                                         # noqa: E402
from _core.constants import G0, RHO0_ISA                                 # noqa: E402
from _core.dynamics import simulate                                      # noqa: E402
from _core.engine import EngineProfile                                   # noqa: E402
from _core.launch import rail_length_trade, run_rail, solve_booster      # noqa: E402
from _core.mission import size_mission                                   # noqa: E402
from _core.schema import (AirframeSpec, MissionSpec, ResumeState,        # noqa: E402
                          ScheduleNode)

REPORT: list[str] = []


def note(msg: str) -> None:
    REPORT.append(msg)
    print("    " + msg)


def _drag_free_spec() -> MissionSpec:
    """A spec with the engine and the drag polar switched off, for energy checks."""
    s = MissionSpec()
    s.engine.mdot_0 = 0.0
    s.airframe.cd0_sub = 0.0
    s.airframe.dcd_wave = 0.0
    s.airframe.oswald_e = 1.0e9      # k -> 0
    s.launch.booster.enabled = False  # a booster firing would add real energy
    return s


# ==========================================================================
# 1. Atmosphere
# ==========================================================================

def test_isa_at_3000m():
    a = isa(3000.0)
    assert abs(a.rho - 0.9093) / 0.9093 < 0.005, a.rho
    assert abs(a.a_ms - 328.6) / 328.6 < 0.005, a.a_ms
    note(f"ISA 3000 m: rho = {a.rho:.4f} kg/m3 (ref 0.9093), a = {a.a_ms:.2f} m/s (ref 328.6)")


def test_isa_sea_level_and_tropopause():
    sl = isa(0.0)
    assert abs(sl.rho - RHO0_ISA) < 1e-6
    assert abs(sl.temp_k - 288.15) < 1e-9
    tp = isa(11000.0)
    assert abs(tp.temp_k - 216.65) < 1e-6
    assert abs(tp.press_pa - 22632.0) / 22632.0 < 0.001
    # the two branches must agree at the join
    lo, hi = isa(10999.9), isa(11000.1)
    assert abs(lo.rho - hi.rho) / hi.rho < 1e-4
    note(f"ISA continuous at the tropopause: rho {lo.rho:.5f} / {hi.rho:.5f} kg/m3")


def test_non_standard_day_reduces_density():
    hot = isa(3000.0, delta_isa=20.0)
    std = isa(3000.0)
    assert hot.rho < std.rho
    assert hot.a_ms > std.a_ms
    note(f"ISA+20 at 3000 m: rho {hot.rho:.4f} vs {std.rho:.4f} kg/m3")


# ==========================================================================
# 2. Drag polar
# ==========================================================================

def test_ld_max_matches_analytic():
    af = AirframeSpec()
    analytic = 0.5 * math.sqrt(1.0 / (af.k_induced * af.cd0_sub))
    # sweep the polar directly
    best, best_cl = 0.0, 0.0
    cl = 0.001
    while cl < af.cl_max:
        cd = af.cd0_sub + af.k_induced * cl * cl
        if cl / cd > best:
            best, best_cl = cl / cd, cl
        cl += 0.0001
    assert abs(best - analytic) / analytic < 0.02, (best, analytic)
    assert abs(best_cl - af.cl_best_ld()) / af.cl_best_ld() < 0.02
    note(f"Polar L/D max = {best:.3f} at CL {best_cl:.4f}; analytic {analytic:.3f} "
         f"at CL {af.cl_best_ld():.4f}")


def test_glide_reaches_analytic_ld_max():
    """Unpowered glide. The trajectory must sweep through CL_opt and the peak
    instantaneous L/D must reach the analytic best within 2%."""
    s = MissionSpec()
    s.engine.mdot_0 = 0.0                      # no thrust
    s.launch.booster.enabled = False
    s.mission.auto_profile = False
    s.mission.duration_s = 200.0
    s.mission.auto_fuel = False
    s.mission.fuel_mass_kg = 1.0               # carried, never burned
    s.control.altitude_schedule = [ScheduleNode(0.0, 5000.0), ScheduleNode(200.0, 1000.0)]
    s.control.throttle_schedule = [ScheduleNode(0.0, 0.0), ScheduleNode(200.0, 0.0)]
    s.resume = ResumeState(t=0.0, v_tas_ms=150.0, gamma_deg=0.0, h_m=5000.0,
                           x_m=0.0, y_m=0.0, s_ground_m=0.0, fuel_kg=1.0,
                           throttle_act=0.0, psi_deg=0.0)
    r = simulate(s)
    af = s.airframe
    peak = max(r.trajectory.ld)
    i = r.trajectory.ld.index(peak)
    mach_there = r.trajectory.mach[i]
    analytic = 0.5 / math.sqrt(af.k_induced * cd0_of_mach(af, mach_there))
    assert abs(peak - analytic) / analytic < 0.02, (peak, analytic)
    note(f"Glide peak L/D = {peak:.3f} at CL {r.trajectory.cl[i]:.4f}, M {mach_there:.3f}; "
         f"analytic {analytic:.3f} ({100 * (peak - analytic) / analytic:+.2f}%)")


def test_wave_drag_blend_is_monotonic_and_bounded():
    af = AirframeSpec()
    prev = -1.0
    for i in range(0, 161):
        m = i * 0.01
        c = cd0_of_mach(af, m)
        assert c >= prev - 1e-12
        prev = c
    assert abs(cd0_of_mach(af, 0.0) - af.cd0_sub) < 1e-4
    assert abs(cd0_of_mach(af, af.mach_dd) - (af.cd0_sub + 0.5 * af.dcd_wave)) < 1e-9
    assert cd0_of_mach(af, 1.6) < af.cd0_sub + af.dcd_wave + 1e-9
    note(f"CD0: {af.cd0_sub:.4f} subsonic, {cd0_of_mach(af, af.mach_dd):.4f} at M_dd, "
         f"{cd0_of_mach(af, 1.6):.4f} fully developed")


# ==========================================================================
# 3. Energy conservation
# ==========================================================================

def test_energy_conserved_without_thrust_or_drag():
    """Lift does no work on a point mass, so with thrust and drag removed the
    total mechanical energy must not move."""
    s = _drag_free_spec()
    s.mission.auto_profile = False
    s.mission.duration_s = 60.0
    s.mission.auto_fuel = False
    s.mission.fuel_mass_kg = 1.0
    s.control.altitude_schedule = [ScheduleNode(0.0, 5000.0), ScheduleNode(25.0, 5600.0),
                                   ScheduleNode(50.0, 5000.0), ScheduleNode(60.0, 5000.0)]
    s.control.throttle_schedule = [ScheduleNode(0.0, 0.0), ScheduleNode(60.0, 0.0)]
    s.resume = ResumeState(t=0.0, v_tas_ms=200.0, gamma_deg=0.0, h_m=5000.0,
                           x_m=0.0, y_m=0.0, s_ground_m=0.0, fuel_kg=1.0,
                           throttle_act=0.0, psi_deg=0.0)
    r = simulate(s)
    tj = r.trajectory
    assert len(tj.t) > 2900
    e0 = 0.5 * tj.v_tas_ms[0] ** 2 + G0 * tj.h_m[0]
    worst = 0.0
    for v, h in zip(tj.v_tas_ms, tj.h_m):
        e = 0.5 * v * v + G0 * h
        worst = max(worst, abs(e - e0) / e0)
    assert worst < 0.001, worst
    swing = max(tj.h_m) - min(tj.h_m)
    note(f"Energy drift over 60 s = {worst * 100:.5f}% (limit 0.1%), across a "
         f"{swing:.0f} m altitude swing and {max(tj.v_tas_ms) - min(tj.v_tas_ms):.0f} m/s "
         f"of speed change")


def test_fuel_burned_matches_integrated_flow():
    r = simulate(MissionSpec())
    tj = r.trajectory
    integ = 0.0
    for i in range(1, len(tj.t)):
        dt = tj.t[i] - tj.t[i - 1]
        integ += 0.5 * (tj.fuel_flow_kgs[i] + tj.fuel_flow_kgs[i - 1]) * dt
    burned = r.summary.fuel_burned_kg
    assert abs(integ - burned) / burned < 0.02, (integ, burned)
    for i in range(1, len(tj.fuel_kg)):
        assert tj.fuel_kg[i] <= tj.fuel_kg[i - 1] + 1e-6
    note(f"Fuel: {burned:.4f} kg burned, {integ:.4f} kg from the integrated flow "
         f"({100 * (integ - burned) / burned:+.2f}%)")


# ==========================================================================
# 4. Engine and ram drag
# ==========================================================================

def test_static_thrust_is_the_product_of_flow_and_exhaust_velocity():
    e = EngineProfile()
    assert abs(e.thrust_static_sl_n - 250.2) < 0.5
    assert abs(e.net_thrust(RHO0_ISA, 0.0, 0.0, 1.0) - e.thrust_static_sl_n) < 1e-9
    note(f"Sea-level static thrust {e.thrust_static_sl_n:.1f} N "
         f"= {e.mdot_0:.3f} kg/s x {e.ve:.0f} m/s")


def test_ram_drag_collapses_net_thrust():
    """The headline check on the engine deck. Net thrust at altitude and speed is
    a fraction of the static figure because the captured stream is dragged along."""
    e = EngineProfile()
    a = isa(3000.0)
    v = 200.0
    tn = e.net_thrust(a.rho, v / a.a_ms, v, 1.0)
    static = e.thrust_static_sl_n
    assert tn < 0.6 * static, (tn, static)
    assert 100.0 < tn < 145.0, tn
    ram_drag = e.mass_flow(a.rho, v / a.a_ms, 1.0) * v
    note(f"Net thrust at 3000 m / 200 m/s = {tn:.1f} N against {static:.1f} N static "
         f"({100 * tn / static:.0f}%); ram drag alone is {ram_drag:.1f} N")


def test_thrust_falls_with_altitude_and_speed():
    e = EngineProfile()
    sl, alt = isa(0.0), isa(6000.0)
    assert e.net_thrust(alt.rho, 0.3, 100.0, 1.0) < e.net_thrust(sl.rho, 0.3, 100.0, 1.0)
    assert e.net_thrust(sl.rho, 0.6, 200.0, 1.0) < e.net_thrust(sl.rho, 0.3, 100.0, 1.0)
    assert e.net_thrust(sl.rho, 0.0, 0.0, 0.5) < e.net_thrust(sl.rho, 0.0, 0.0, 1.0)
    assert abs(e.net_thrust(sl.rho, 0.0, 0.0, 0.0) - e.idle_frac * e.thrust_static_sl_n) < 1e-9
    note(f"Idle floor {e.idle_frac * e.thrust_static_sl_n:.1f} N; thrust falls with "
         f"both altitude and forward speed")


def test_spool_lag_has_the_declared_time_constant():
    """A throttle step must reach 63.2% of the change in one time constant."""
    s = MissionSpec()
    s.mission.auto_profile = False
    s.mission.duration_s = 12.0
    s.launch.booster.enabled = False
    s.mission.auto_fuel = False
    s.mission.fuel_mass_kg = 2.0
    s.control.altitude_schedule = [ScheduleNode(0.0, 3000.0), ScheduleNode(12.0, 3000.0)]
    s.control.throttle_schedule = [ScheduleNode(0.0, 0.2), ScheduleNode(1.0, 0.2),
                                   ScheduleNode(1.001, 1.0), ScheduleNode(12.0, 1.0)]
    s.resume = ResumeState(t=0.0, v_tas_ms=160.0, gamma_deg=0.0, h_m=3000.0, x_m=0.0,
                           y_m=0.0, s_ground_m=0.0, fuel_kg=2.0, throttle_act=0.2,
                           psi_deg=0.0)
    r = simulate(s)
    tj = r.trajectory
    tau = s.engine.tau_up_s
    target = 0.2 + 0.632 * 0.8
    idx = next(i for i, v in enumerate(tj.throttle_act) if v >= target)
    elapsed = tj.t[idx] - 1.0
    assert abs(elapsed - tau) / tau < 0.05, elapsed
    assert max(tj.throttle_cmd) <= 1.0 and max(tj.throttle_act) <= 1.0 + 1e-9
    note(f"Spool-up reached 63.2% of a 0.2 -> 1.0 step in {elapsed:.3f} s "
         f"(tau_up {tau:.1f} s)")


def test_bench_data_fit_recovers_the_engine_deck():
    """from_bench_data must reproduce the deck that generated the data."""
    truth = EngineProfile()
    lines = ["throttle,thrust,fuel_flow"]
    for i in range(0, 11):
        d = i / 10.0
        t = truth.net_thrust(RHO0_ISA, 0.0, 0.0, d)
        lines.append(f"{d},{t},{truth.fuel_flow(t, d)}")
    fitted, report = EngineProfile.from_bench_data("\n".join(lines), ve_ms=truth.ve)
    assert abs(fitted.mdot_0 - truth.mdot_0) / truth.mdot_0 < 0.02, fitted.mdot_0
    assert abs(fitted.spool_exp - truth.spool_exp) < 0.05, fitted.spool_exp
    assert abs(fitted.idle_frac - truth.idle_frac) < 0.02, fitted.idle_frac
    assert abs(fitted.tsfc_base - truth.tsfc_base) / truth.tsfc_base < 0.02
    assert report["thrust_rms_error_n"] < 1.0
    note(f"Bench fit recovered mdot_0 {fitted.mdot_0:.4f} kg/s, spool exponent "
         f"{fitted.spool_exp:.3f}, idle {fitted.idle_frac:.3f}, TSFC "
         f"{fitted.tsfc_base:.4f} kg/(N h); RMS thrust error "
         f"{report['thrust_rms_error_n']:.3f} N")


# ==========================================================================
# 5. Maximum speed - the check that matters
# ==========================================================================

def test_max_level_mach_default_configuration():
    af, eng = AirframeSpec(), EngineProfile()
    m = perf.max_level_mach(af, eng, 3000.0, 15.0)
    v = m * isa(3000.0).a_ms
    assert 0.55 <= m <= 0.61, m
    note(f"Max level speed, S = 0.30 m2 at 15 kg and 3000 m: M {m:.4f} ({v:.0f} m/s)")


def test_small_wing_still_cannot_approach_mach_one():
    af = AirframeSpec(wing_area_m2=0.18)
    m = perf.max_level_mach(af, EngineProfile(), 3000.0, 15.0)
    assert m <= 0.75, m
    assert m < 0.95
    note(f"Max level speed, S reduced to 0.18 m2: M {m:.4f} - still far short of M 1")


def test_mach_one_is_out_of_reach_by_an_order_of_magnitude():
    d = perf.mach1_deficit(AirframeSpec(), EngineProfile(), 3000.0, 15.0)
    assert d.thrust_required_n > 5.0 * d.thrust_available_n
    assert d.deficit_n > 500.0
    note(f"M 1.0 at 3000 m: {d.thrust_required_n:.0f} N required, "
         f"{d.thrust_available_n:.0f} N available, shortfall {d.deficit_n:.0f} N "
         f"({d.deficit_ratio:.1f}x)")


def test_no_configuration_in_the_sweep_reaches_mach_one():
    """Sweep the levers an operator can actually pull. None of them get there."""
    eng = EngineProfile()
    worst = 0.0
    worst_cfg = ""
    for s_wing in (0.18, 0.24, 0.30):
        for cd0 in (0.016, 0.020, 0.024):
            for alt in (3000.0, 8000.0, 11000.0):
                for mass in (12.0, 15.0):
                    af = AirframeSpec(wing_area_m2=s_wing, cd0_sub=cd0)
                    m = perf.max_level_mach(af, eng, alt, mass)
                    if m > worst:
                        worst, worst_cfg = m, (f"S {s_wing} m2, CD0 {cd0}, "
                                               f"{alt:.0f} m, {mass:.0f} kg")
    assert worst < 1.0, (worst, worst_cfg)
    note(f"Best of 54 configurations: M {worst:.4f} ({worst_cfg}) - none reach M 1")


def test_simulated_max_mach_agrees_with_the_steady_state_solver():
    r = simulate(MissionSpec())
    m_flown = r.summary.max_mach
    mass = r.summary.gross_mass_kg - 0.5 * r.summary.fuel_loaded_kg
    m_steady = perf.max_level_mach(AirframeSpec(), EngineProfile(),
                                   r.spec.mission.cruise_altitude_m, mass)
    assert m_flown <= m_steady + 0.03, (m_flown, m_steady)
    assert m_flown < 1.0
    note(f"Flown maximum M {m_flown:.4f} against a steady-state ceiling of "
         f"M {m_steady:.4f} at {mass:.1f} kg")


# ==========================================================================
# 6. Launch
# ==========================================================================

def test_stall_speed_and_rail_requirement():
    af = AirframeSpec()
    vs = stall_speed(af, RHO0_ISA, 15.0)
    assert 28.0 < vs < 32.0, vs
    note(f"Stall speed at 15 kg, sea level: {vs:.1f} m/s; rail exit must reach "
         f"{1.15 * vs:.1f} m/s")


def test_engine_alone_cannot_launch_from_a_three_metre_rail():
    s = MissionSpec()
    s.launch.booster.enabled = False
    _, plan = size_mission(s, 2.12)
    fuel = 1.4
    rail = run_rail(s, fuel)
    vs = stall_speed(s.airframe, RHO0_ISA, s.airframe.mass_dry_kg + fuel)
    assert 6.0 < rail.v_exit < 10.0, rail.v_exit
    assert rail.v_exit < 0.4 * vs
    note(f"Engine only, 3 m rail: {rail.v_exit:.1f} m/s at exit against a stall speed "
         f"of {vs:.1f} m/s - the aircraft leaves the rail unable to fly")


def test_booster_sizing_for_a_three_metre_rail():
    s = MissionSpec()
    sol = solve_booster(s, 1.363)
    assert sol.feasible
    assert 1800.0 < sol.booster_thrust_n < 3200.0, sol.booster_thrust_n
    assert 350.0 < sol.booster_impulse_ns < 550.0, sol.booster_impulse_ns
    assert 0.12 < sol.booster_burn_time_s < 0.30
    note(f"Booster for a 3 m rail: {sol.booster_thrust_n / 1000:.2f} kN for "
         f"{sol.booster_burn_time_s * 1000:.0f} ms = {sol.booster_impulse_ns:.0f} N s, "
         f"peak {sol.peak_rail_accel_g:.0f} g")


def test_total_impulse_is_nearly_invariant_with_rail_length():
    """Trading rail length against booster thrust holds total impulse roughly
    constant. That relationship is the point of the trade study."""
    s = MissionSpec()
    trade = rail_length_trade(s, 1.363, [2.0, 3.0, 5.0, 8.0])
    imps = [t["booster_impulse_ns"] for t in trade]
    thrusts = [t["booster_thrust_n"] for t in trade]
    assert (max(imps) - min(imps)) / min(imps) < 0.25, imps
    assert thrusts[0] > 4.0 * thrusts[-1]
    note("Rail trade: " + ", ".join(
        f"{t['rail_length_m']:.0f} m -> {t['booster_thrust_n']:.0f} N / "
        f"{t['booster_impulse_ns']:.0f} N s" for t in trade))


def test_default_configuration_launches_successfully():
    r = simulate(MissionSpec())
    assert r.launch.feasible, r.launch.note
    assert r.launch.margin_ratio >= r.spec.launch.exit_margin
    assert not r.summary.stalled
    assert not r.summary.ground_impact
    note(f"Default configuration: rail exit {r.launch.v_exit_ms:.1f} m/s = "
         f"{r.launch.margin_ratio:.2f} x V_stall, no stall, no impact")


# ==========================================================================
# 7. Mission coupling
# ==========================================================================

def test_short_missions_have_no_cruise_leg():
    """Climb to 3000 m and descend back covers roughly 31 km on its own. Below that
    the profile has no cruise segment and the tool must say so rather than pretend."""
    s = MissionSpec()
    s.mission.mission_distance_km = 15.0
    r = simulate(s)
    assert r.fuel.cruise_distance_km == 0.0
    assert "no cruise leg" in r.fuel.note
    floor = r.fuel.climb_distance_km + r.fuel.descent_distance_km
    note(f"A 15 km request is below the {floor:.0f} km covered by climb and descent "
         f"alone at a 3000 m cruise altitude; reported, not clamped")


def test_range_drives_fuel_which_drives_gross_mass():
    prev_fuel = prev_stall = 0.0
    for km in (40.0, 60.0, 80.0, 100.0):
        s = MissionSpec()
        s.mission.mission_distance_km = km
        r = simulate(s)
        f = r.fuel.fuel_required_kg
        vs = r.launch.v_stall_ms
        assert f > prev_fuel, (km, f, prev_fuel)
        assert vs > prev_stall
        prev_fuel, prev_stall = f, vs
    note(f"Range 40 -> 100 km raises required fuel to {prev_fuel:.2f} kg and stall "
         f"speed to {prev_stall:.1f} m/s")


def test_excess_range_is_reported_not_clamped():
    s = MissionSpec()
    s.mission.mission_distance_km = 400.0
    r = simulate(s)
    assert not r.fuel.feasible
    assert r.fuel.fuel_required_kg > r.fuel.fuel_capacity_kg
    assert r.fuel.fuel_loaded_kg <= r.fuel.fuel_capacity_kg + 1e-9
    assert any("Maximum range" in w for w in r.warnings)
    note(f"400 km request: {r.fuel.fuel_required_kg:.2f} kg needed against a "
         f"{r.fuel.fuel_capacity_kg:.2f} kg tank; reported infeasible, max range "
         f"{r.fuel.max_range_at_capacity_km:.0f} km")


def test_cg_shifts_as_the_tank_empties():
    r = simulate(MissionSpec())
    tj = r.trajectory
    start, end = tj.static_margin[0], tj.static_margin[-1]
    assert abs(end - start) > 0.02, (start, end)
    assert abs(r.summary.min_static_margin - min(tj.static_margin)) < 1e-4
    note(f"Static margin drifts {start * 100:.1f}% -> {end * 100:.1f}% MAC as "
         f"{r.summary.fuel_burned_kg:.2f} kg of fuel burns off")


def test_headwind_reduces_ground_range():
    calm = simulate(MissionSpec())
    s = MissionSpec()
    s.atmosphere.headwind_ms = 15.0
    windy = simulate(s)
    assert windy.summary.ground_range_km < calm.summary.ground_range_km
    note(f"15 m/s headwind: {windy.summary.ground_range_km:.1f} km against "
         f"{calm.summary.ground_range_km:.1f} km in still air")


def test_hot_day_costs_performance():
    std = perf.max_level_mach(AirframeSpec(), EngineProfile(), 3000.0, 15.0, 0.0)
    hot = perf.max_level_mach(AirframeSpec(), EngineProfile(), 3000.0, 15.0, 25.0)
    assert hot < std
    note(f"ISA+25: max level M {hot:.4f} against {std:.4f} on a standard day")


# ==========================================================================
# 8. Numerics and contract
# ==========================================================================

def test_solver_is_deterministic():
    a = simulate(MissionSpec())
    b = simulate(MissionSpec())
    assert a.trajectory.mach == b.trajectory.mach
    assert a.trajectory.h_m == b.trajectory.h_m
    note("Two identical specs produced bit-identical trajectories")


def test_output_is_uniform_50hz_and_columns_are_parallel():
    r = simulate(MissionSpec())
    tj = r.trajectory
    n = len(tj.t)
    assert n > 14000
    for name in ("mach", "h_m", "thrust_n", "cd", "static_margin", "phase"):
        assert len(getattr(tj, name)) == n, name
    gaps = [tj.t[i] - tj.t[i - 1] for i in range(1, n)]
    assert abs(max(gaps) - 0.02) < 1e-3, max(gaps)
    assert abs(min(gaps) - 0.02) < 1e-3, min(gaps)
    note(f"{n} samples, uniform {min(gaps) * 1000:.1f} ms spacing, all "
         f"{len(tj.__dataclass_fields__)} columns parallel")


def test_rk4_step_size_is_converged():
    """Halving the step must not move the answer. If it does, dt is too coarse."""
    a = simulate(MissionSpec())
    s = MissionSpec()
    s.integration.dt = 0.0025
    b = simulate(s)
    dm = abs(a.summary.max_mach - b.summary.max_mach)
    dr = abs(a.summary.ground_range_km - b.summary.ground_range_km)
    assert dm < 1e-4, dm
    assert dr < 0.05, dr
    note(f"dt 0.005 -> 0.0025: max Mach moves {dm:.2e}, range moves {dr * 1000:.1f} m")


def test_resume_splice_matches_the_full_solve():
    """The interactive re-solve path must reproduce the full run exactly."""
    full = simulate(MissionSpec())
    tj = full.trajectory
    i = next(k for k, t in enumerate(tj.t) if t >= 150.0)
    s = MissionSpec()
    s.resume = ResumeState(t=tj.t[i], v_tas_ms=tj.v_tas_ms[i], gamma_deg=tj.gamma_deg[i],
                           h_m=tj.h_m[i], x_m=tj.x_m[i], y_m=tj.y_m[i],
                           s_ground_m=tj.s_ground_m[i], fuel_kg=tj.fuel_kg[i],
                           throttle_act=tj.throttle_act[i], psi_deg=tj.psi_deg[i])
    part = simulate(s)
    assert abs(part.summary.ground_range_km - full.summary.ground_range_km) < 0.15
    assert abs(part.trajectory.h_m[-1] - tj.h_m[-1]) < 12.0
    note(f"Splice from t+150 s: final range {part.summary.ground_range_km:.2f} km "
         f"against {full.summary.ground_range_km:.2f} km for the full solve, "
         f"in {part.summary.solve_ms:.0f} ms")


def test_solve_time_budget():
    t0 = time.perf_counter()
    r = simulate(MissionSpec())
    ms = (time.perf_counter() - t0) * 1000.0
    assert r.summary.duration_s > 290.0
    assert ms < 3000.0, ms
    note(f"Full {r.summary.duration_s:.0f} s mission at dt = {r.spec.integration.dt} s "
         f"solved in {ms:.0f} ms ({r.summary.n_samples} samples)")


def test_nothing_is_silently_clamped():
    """Every limit the solver applies must surface as a flag or a warning."""
    s = MissionSpec()
    s.mission.mission_distance_km = 400.0
    s.launch.booster.enabled = False
    r = simulate(s)
    assert r.warnings, "an infeasible configuration produced no warnings"
    assert not r.launch.feasible
    assert any(e.severity == "alert" for e in r.events)
    kinds = {e.kind for e in r.events}
    note(f"Infeasible configuration raised {len(r.warnings)} warnings and events "
         f"{sorted(kinds)}")


# ==========================================================================

def main() -> int:
    tests = [(n, o) for n, o in sorted(globals().items())
             if n.startswith("test_") and callable(o)]
    failed = []
    t0 = time.perf_counter()
    for name, fn in tests:
        print(f"\n{name}")
        try:
            fn()
        except AssertionError as exc:
            failed.append((name, exc))
            print(f"    FAIL: {exc}")
        except Exception as exc:                                    # noqa: BLE001
            failed.append((name, exc))
            print(f"    ERROR: {type(exc).__name__}: {exc}")
    dt = time.perf_counter() - t0
    print("\n" + "=" * 74)
    print(f"{len(tests) - len(failed)}/{len(tests)} passed in {dt:.1f} s")
    for name, exc in failed:
        print(f"  FAILED {name}: {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
