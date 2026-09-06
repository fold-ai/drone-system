// GENERATED FILE - DO NOT EDIT.
// Written by scripts/gen_types.py from api/_core/schema.py, engine.py and
// derived.py. The mission specification is defined once, in Python. Run
//     python scripts/gen_types.py
// after changing any dataclass there.

/** One breakpoint of a piecewise-linear command schedule. */
export interface ScheduleNode {
  /** s, mission time */
  t: number;
  /** units depend on the schedule */
  value: number;
}

/** Cranked-delta blended wing body, from the ACT-1 plan-view CAD. */
export interface PlanformSpec {
  /** inboard leading-edge sweep [deg] */
  sweep_inboard_deg: number;
  /** outer panel sweep, aft of the crank [deg] */
  sweep_outer_deg: number;
  /** crank station as a fraction of semispan */
  crank_frac: number;
  /** ogive radome length as a fraction of overall */
  radome_frac: number;
  /** centre body half-width, fraction of semispan */
  body_halfwidth_frac: number;
  /** exhaust notch half-width, fraction of semispan */
  te_notch_halfwidth_frac: number;
  /** notch depth, fraction of overall length */
  te_notch_depth_frac: number;
  /** 1.0 = squared tip running back to the TE */
  tip_chord_frac: number;
  /** t/c at the centreline */
  thickness_root_frac: number;
  /** t/c at the tip */
  thickness_tip_frac: number;
  /**  [deg] */
  twist_root_deg: number;
  /** washout; geometry only, not fed to the polar [deg] */
  twist_tip_deg: number;
  /** dorsal inlet lip, fraction of length */
  inlet_start_frac: number;
  inlet_length_frac: number;
  /** engine casing radius as a fraction of length */
  engine_radius_frac: number;
  /** blade surface height, fraction of semispan */
  fin_span_frac: number;
  /** blade station, fraction of semispan */
  fin_station_frac: number;
}

/** Carbon-composite blended-delta UAV. All lengths measured aft from the nose datum. */
export interface AirframeSpec {
  /** S [m2] */
  wing_area_m2: number;
  /** b  -> AR = b^2/S = 4.033 [m] */
  span_m: number;
  /** mean aerodynamic chord, S/b for the reference planform [m] */
  mac_m: number;
  /** overall length, used by the 3D placeholder [m] */
  length_m: number;
  /** subsonic zero-lift drag coefficient */
  cd0_sub: number;
  /** drag-divergence Mach number [M] */
  mach_dd: number;
  /** wave drag increment fully developed above M_dd */
  dcd_wave: number;
  /** tanh blend width of the drag rise */
  wave_width: number;
  /** Oswald span efficiency */
  oswald_e: number;
  /** usable maximum lift coefficient */
  cl_max: number;
  /** carbon skins + ribs [kg] */
  mass_airframe_kg: number;
  /** turbojet + mounts [kg] */
  mass_engine_kg: number;
  /** avionics, servos, battery [kg] */
  mass_avionics_kg: number;
  /** 0 - 3.0 [kg] */
  mass_payload_kg: number;
  /** tank volume limit [kg] */
  fuel_capacity_kg: number;
  /**  [m] */
  x_airframe_m: number;
  /**  [m] */
  x_engine_m: number;
  /**  [m] */
  x_avionics_m: number;
  /**  [m] */
  x_payload_m: number;
  /**  [m] */
  x_fuel_m: number;
  /** neutral point [m] */
  x_np_m: number;
  /** flag below 3% MAC */
  static_margin_min: number;
  planform: PlanformSpec;
  /** warn above 2% disagreement */
  planform_area_tolerance: number;
}

/** AtmosphereSpec(delta_isa_k: 'float' = 0.0, headwind_ms: 'float' = 0.0, ground_altitude_m: 'float' = 0.0) */
export interface AtmosphereSpec {
  /** non-standard day temperature offset, K [K] */
  delta_isa_k: number;
  /** +ve = headwind, reduces ground speed [m/s] */
  headwind_ms: number;
  /** launch site elevation [m] */
  ground_altitude_m: number;
}

/** BoosterSpec(enabled: 'bool' = True, thrust_n: 'float' = 2500.0, burn_time_s: 'float' = 0.19, mass_kg: 'float' = 0.4, jettison: 'bool' = True, x_booster_m: 'float' = 1.1) */
export interface BoosterSpec {
  enabled: boolean;
  /** sized by solve_booster() for a 3 m rail at 13.5 kg gross [N] */
  thrust_n: number;
  /** 475 N s total impulse [s] */
  burn_time_s: number;
  /** motor + case; ~0.22 kg propellant at Isp 200 s [kg] */
  mass_kg: number;
  jettison: boolean;
  /** station of the booster mass, kept near the CG so the motor does not destabilise the aircraft during the rail run [m] */
  x_booster_m: number;
}

/** LaunchSpec(rail_length_m: 'float' = 3.0, rail_angle_deg: 'float' = 45.0, rail_friction_mu: 'float' = 0.05, exit_margin: 'float' = 1.15, engine_prespooled: 'bool' = True, booster: 'BoosterSpec' = <factory>) */
export interface LaunchSpec {
  /**  [m] */
  rail_length_m: number;
  /**  [deg] */
  rail_angle_deg: number;
  rail_friction_mu: number;
  /** required V_exit / V_stall */
  exit_margin: number;
  /** engine brought to commanded throttle before release */
  engine_prespooled: boolean;
  booster: BoosterSpec;
}

/** MissionProfile(mission_distance_km: 'float' = 50.0, cruise_altitude_m: 'float' = 3000.0, climb_rate_ms: 'float' = 30.0, target_mach: 'float' = 0.55, descent_rate_ms: 'float' = 25.0, descent_throttle: 'float' = 0.25, reserve_frac: 'float' = 0.15, auto_profile: 'bool' = True, descent_start_s: 'float' = 230.0, end_altitude_m: 'float' = 500.0, duration_s: 'float' = 300.0, auto_fuel: 'bool' = True, fuel_mass_kg: 'float' = 2.9) */
export interface MissionProfile {
  /**  [km] */
  mission_distance_km: number;
  /**  [m] */
  cruise_altitude_m: number;
  /**  [m/s] */
  climb_rate_ms: number;
  /**  [M] */
  target_mach: number;
  /**  [m/s] */
  descent_rate_ms: number;
  /** throttle held on the descent leg */
  descent_throttle: number;
  /** fraction of cruise fuel held in reserve */
  reserve_frac: number;
  /** derive descent_start_s / duration_s from the range */
  auto_profile: boolean;
  /** used when auto_profile is False [s] */
  descent_start_s: number;
  /**  [m] */
  end_altitude_m: number;
  /** used when auto_profile is False [s] */
  duration_s: number;
  /** size fuel from range; else use fuel_mass_kg */
  auto_fuel: boolean;
  /** used when auto_fuel is False [kg] */
  fuel_mass_kg: number;
}

/** Throttle is commanded directly. Altitude is tracked by a flight-path controller. */
export interface ControlSpec {
  /** None -> built from the profile plan */
  throttle_schedule: ScheduleNode[] | null;
  /** None -> built from MissionProfile */
  altitude_schedule: ScheduleNode[] | null;
  /** deg, None -> straight track */
  heading_schedule: ScheduleNode[] | null;
  /** 1/s, flight-path angle loop gain */
  k_gamma: number;
  /** 1/s, altitude error -> commanded climb rate */
  k_alt: number;
  /** structural load factor limit */
  n_max: number;
}

/** IntegrationSpec(dt: 'float' = 0.005, output_hz: 'float' = 50.0, stop_on_ground: 'bool' = True) */
export interface IntegrationSpec {
  /** s, fixed RK4 step [s] */
  dt: number;
  /** sample rate of the returned trajectory [Hz] */
  output_hz: number;
  stop_on_ground: boolean;
}

/** Splice point for an interactive re-solve. When present the solver skips the */
export interface ResumeState {
  t: number;
  /**  [m/s] */
  v_tas_ms: number;
  /**  [deg] */
  gamma_deg: number;
  /**  [m] */
  h_m: number;
  /**  [m] */
  x_m: number;
  /**  [m] */
  y_m: number;
  /**  [m] */
  s_ground_m: number;
  /**  [kg] */
  fuel_kg: number;
  throttle_act: number;
  /**  [deg] */
  psi_deg: number;
}

/** MissionSpec(airframe: 'AirframeSpec' = <factory>, engine: 'EngineProfile' = <factory>, atmosphere: 'AtmosphereSpec' = <factory>, launch: 'LaunchSpec' = <factory>, mission: 'MissionProfile' = <factory>, control: 'ControlSpec' = <factory>, integration: 'IntegrationSpec' = <factory>, resume: 'Optional[ResumeState]' = None, label: 'str' = 'MSN-0417', config_name: 'str' = 'CONFIG B') */
export interface MissionSpec {
  airframe: AirframeSpec;
  engine: EngineProfile;
  atmosphere: AtmosphereSpec;
  launch: LaunchSpec;
  mission: MissionProfile;
  control: ControlSpec;
  integration: IntegrationSpec;
  resume: ResumeState | null;
  label: string;
  config_name: string;
}

/** FlightEvent(t: 'float', kind: 'str', label: 'str', severity: 'str' = 'info', detail: 'str' = '') */
export interface FlightEvent {
  t: number;
  /** rail_exit | booster_burnout | booster_jettison | top_of_climb | mach_dd_cross | mach_dd_exit | stall_onset | stall_clear | flameout | target_range | ground_impact | end_of_run */
  kind: string;
  label: string;
  /** info | warn | alert */
  severity: string;
  detail: string;
}

/** Mission timeline derived from the requested range. Every time in the */
export interface ProfilePlan {
  /**  [m] */
  h_exit_m: number;
  /**  [s] */
  t_climb_s: number;
  /**  [s] */
  t_cruise_s: number;
  /**  [s] */
  t_descent_s: number;
  /**  [s] */
  t_toc_s: number;
  /**  [s] */
  t_descent_start_s: number;
  /**  [s] */
  duration_s: number;
  /**  [m/s] */
  climb_tas_ms: number;
  /**  [m/s] */
  cruise_tas_ms: number;
  /**  [m/s] */
  descent_tas_ms: number;
  climb_throttle: number;
  cruise_throttle: number;
  descent_throttle: number;
  climb_limited: boolean;
  note: string;
}

/** Schedules actually flown, after defaults were generated. The UI edits these. */
export interface ResolvedProfile {
  plan: ProfilePlan;
  throttle_schedule: ScheduleNode[];
  altitude_schedule: ScheduleNode[];
}

/** Output of the range -> fuel sizing calculation. */
export interface FuelBudget {
  /**  [km] */
  requested_range_km: number;
  /**  [kg] */
  fuel_climb_kg: number;
  /**  [kg] */
  fuel_cruise_kg: number;
  /**  [kg] */
  fuel_descent_kg: number;
  /**  [kg] */
  fuel_reserve_kg: number;
  /**  [kg] */
  fuel_required_kg: number;
  /**  [kg] */
  fuel_loaded_kg: number;
  /**  [kg] */
  fuel_capacity_kg: number;
  feasible: boolean;
  /**  [km] */
  max_range_at_capacity_km: number;
  cruise_ld: number;
  /**  [m/s] */
  cruise_tas_ms: number;
  cruise_throttle: number;
  /**  [km] */
  climb_distance_km: number;
  /**  [km] */
  cruise_distance_km: number;
  /**  [km] */
  descent_distance_km: number;
  note: string;
}

/** LaunchFeasibility(v_exit_ms: 'float', v_stall_ms: 'float', v_required_ms: 'float', margin_ratio: 'float', feasible: 'bool', rail_time_s: 'float', gross_mass_kg: 'float', booster_thrust_n: 'float', booster_impulse_ns: 'float', booster_burn_time_s: 'float', peak_rail_accel_g: 'float', note: 'str' = '') */
export interface LaunchFeasibility {
  /**  [m/s] */
  v_exit_ms: number;
  /**  [m/s] */
  v_stall_ms: number;
  /**  [m/s] */
  v_required_ms: number;
  /** v_exit / v_stall */
  margin_ratio: number;
  feasible: boolean;
  /**  [s] */
  rail_time_s: number;
  /**  [kg] */
  gross_mass_kg: number;
  /**  [N] */
  booster_thrust_n: number;
  /**  [N s] */
  booster_impulse_ns: number;
  /**  [s] */
  booster_burn_time_s: number;
  peak_rail_accel_g: number;
  note: string;
}

/** MachSweepPoint(mach: 'float', thrust_available_n: 'float', drag_required_n: 'float', cl: 'float', cd: 'float', excess_n: 'float') */
export interface MachSweepPoint {
  /**  [M] */
  mach: number;
  /**  [N] */
  thrust_available_n: number;
  /**  [N] */
  drag_required_n: number;
  cl: number;
  cd: number;
  /**  [N] */
  excess_n: number;
}

/** Thrust available vs thrust required at M = 1.0 for the current configuration. */
export interface Mach1Deficit {
  /**  [m] */
  altitude_m: number;
  /**  [kg] */
  mass_kg: number;
  /**  [m/s] */
  tas_at_mach1_ms: number;
  /**  [N] */
  thrust_required_n: number;
  /**  [N] */
  thrust_available_n: number;
  /**  [N] */
  deficit_n: number;
  /** required / available */
  deficit_ratio: number;
  /**  [M] */
  max_level_mach: number;
  /**  [m/s] */
  max_level_tas_ms: number;
  cd_at_mach1: number;
  note: string;
}

/** TrajectorySummary(ok: 'bool', solve_ms: 'float', n_samples: 'int', duration_s: 'float', gross_mass_kg: 'float', fuel_loaded_kg: 'float', fuel_burned_kg: 'float', fuel_remaining_kg: 'float', max_mach: 'float', max_tas_ms: 'float', max_altitude_m: 'float', max_q_pa: 'float', max_load_factor: 'float', ground_range_km: 'float', time_to_cruise_s: 'float', best_ld: 'float', min_static_margin: 'float', wave_drag_entered: 'bool', stalled: 'bool', flameout: 'bool', ground_impact: 'bool', target_range_met: 'bool', termination: 'str', endurance_s: 'float') */
export interface TrajectorySummary {
  ok: boolean;
  /**  [m/s] */
  solve_ms: number;
  n_samples: number;
  /**  [s] */
  duration_s: number;
  /**  [kg] */
  gross_mass_kg: number;
  /**  [kg] */
  fuel_loaded_kg: number;
  /**  [kg] */
  fuel_burned_kg: number;
  /**  [kg] */
  fuel_remaining_kg: number;
  /**  [M] */
  max_mach: number;
  /**  [m/s] */
  max_tas_ms: number;
  /**  [m] */
  max_altitude_m: number;
  /**  [Pa] */
  max_q_pa: number;
  max_load_factor: number;
  /**  [km] */
  ground_range_km: number;
  /**  [s] */
  time_to_cruise_s: number;
  best_ld: number;
  min_static_margin: number;
  wave_drag_entered: boolean;
  stalled: boolean;
  flameout: boolean;
  ground_impact: boolean;
  target_range_met: boolean;
  termination: string;
  /**  [s] */
  endurance_s: number;
}

/** Columnar 50 Hz state history. Columns are parallel arrays of equal length. */
export interface Trajectory {
  t: number[];
  /** ground track east [m] */
  x_m: number[];
  /** ground track north [m] */
  y_m: number[];
  /** ground path length [m] */
  s_ground_m: number[];
  /**  [m] */
  h_m: number[];
  /**  [m/s] */
  v_tas_ms: number[];
  /**  [m/s] */
  v_ground_ms: number[];
  /**  [M] */
  mach: number[];
  /**  [deg] */
  gamma_deg: number[];
  /**  [deg] */
  psi_deg: number[];
  /**  [deg] */
  bank_deg: number[];
  /**  [m/s] */
  roc_ms: number[];
  /**  [kg] */
  mass_kg: number[];
  /**  [kg] */
  fuel_kg: number[];
  /**  [kg/s] */
  fuel_flow_kgs: number[];
  throttle_cmd: number[];
  throttle_act: number[];
  /**  [N] */
  thrust_n: number[];
  /**  [N] */
  drag_n: number[];
  /**  [N] */
  lift_n: number[];
  /**  [N] */
  thrust_margin_n: number[];
  /** specific excess power [m/s] */
  ps_ms: number[];
  cl: number[];
  cd: number[];
  cd0: number[];
  cdi: number[];
  cd_wave: number[];
  ld: number[];
  /**  [Pa] */
  q_pa: number[];
  load_factor: number[];
  rho: number[];
  /**  [m/s] */
  a_sound_ms: number[];
  /**  [K] */
  temp_k: number[];
  /**  [Pa] */
  press_pa: number[];
  reynolds: number[];
  /**  [m] */
  x_cg_m: number[];
  static_margin: number[];
  wave_drag_active: number[];
  stall_limited: number[];
  lift_limited: number[];
  /** 0 rail 1 climb 2 cruise 3 descent */
  phase: number[];
}

/** SimulationResult(summary: 'TrajectorySummary', trajectory: 'Trajectory', events: 'List[FlightEvent]', fuel: 'FuelBudget', launch: 'LaunchFeasibility', mach1: 'Mach1Deficit', mach_sweep: 'List[MachSweepPoint]', resolved: 'ResolvedProfile', derived: "'Derived'", spec: 'MissionSpec', warnings: 'List[str]' = <factory>) */
export interface SimulationResult {
  summary: TrajectorySummary;
  trajectory: Trajectory;
  events: FlightEvent[];
  fuel: FuelBudget;
  launch: LaunchFeasibility;
  mach1: Mach1Deficit;
  mach_sweep: MachSweepPoint[];
  resolved: ResolvedProfile;
  derived: Derived;
  spec: MissionSpec;
  warnings: string[];
}

/** EngineProfile(mdot_0: 'float' = 0.45, ve: 'float' = 556.0, ram_k: 'float' = 0.35, ram_mach_clamp: 'float' = 1.2, idle_frac: 'float' = 0.1, spool_exp: 'float' = 1.4, tau_up_s: 'float' = 2.0, tau_down_s: 'float' = 1.2, tsfc_base: 'float' = 0.145, tsfc_throttle_k: 'float' = 0.35) */
export interface EngineProfile {
  /** kg/s. Sea-level static air mass flow at full throttle. PROVENANCE: manufacturer datasheet class figure for a 250 N turbojet. Fit from bench data with from_bench_data(). */
  mdot_0: number;
  /** m/s. Effective exhaust velocity, = T_static / mdot_0 = 250.2 / 0.45. PROVENANCE: derived from the two figures above. A bench run alone gives only the PRODUCT mdot_0 * ve; splitting it needs a measured nozzle exit velocity or a thrust measurement at non-zero forward speed. */
  ve: number;
  /** Coefficient in ram_recovery(M) = sqrt(1 + ram_k * M^2). Captures the rise in captured mass flow with forward speed. PROVENANCE: tuned placeholder; replace with an inlet pressure-recovery map. [K] */
  ram_k: number;
  /** Ram recovery is not extrapolated above this Mach - the subsonic pitot inlet is not modelled through a normal shock. [M] */
  ram_mach_clamp: number;
  /** Flow fraction at zero throttle command (idle floor). */
  idle_frac: number;
  /** spool(d) = idle_frac + (1 - idle_frac) * d^spool_exp. */
  spool_exp: number;
  /** s. First-order spool-up time constant (accel). [s] */
  tau_up_s: number;
  /** s. First-order spool-down time constant (decel). [s] */
  tau_down_s: number;
  /** kg/(N h) at full throttle. [kg/(N h)] */
  tsfc_base: number;
  /** TSFC = tsfc_base * (1 + tsfc_throttle_k * (1 - d)) - part-throttle penalty. [kg/(N h)] */
  tsfc_throttle_k: number;
}

/** Derived(aspect_ratio: 'float', k_induced: 'float', ld_max: 'float', cl_best_ld: 'float', v_best_ld_ms: 'float', mass_dry_kg: 'float', gross_mass_kg: 'float', wing_loading_nm2: 'float', thrust_to_weight: 'float', v_stall_sl_ms: 'float', v_stall_cruise_ms: 'float', rail_exit_required_ms: 'float', static_margin_full: 'float', static_margin_empty: 'float', x_cg_full_m: 'float', x_cg_empty_m: 'float', cruise_rho: 'float', cruise_a_ms: 'float', cruise_tas_at_target_ms: 'float') */
export interface Derived {
  aspect_ratio: number;
  k_induced: number;
  ld_max: number;
  cl_best_ld: number;
  /**  [m/s] */
  v_best_ld_ms: number;
  /**  [kg] */
  mass_dry_kg: number;
  /**  [kg] */
  gross_mass_kg: number;
  wing_loading_nm2: number;
  thrust_to_weight: number;
  /**  [m/s] */
  v_stall_sl_ms: number;
  /**  [m/s] */
  v_stall_cruise_ms: number;
  /**  [m/s] */
  rail_exit_required_ms: number;
  static_margin_full: number;
  static_margin_empty: number;
  /**  [m] */
  x_cg_full_m: number;
  /**  [m] */
  x_cg_empty_m: number;
  cruise_rho: number;
  /**  [m/s] */
  cruise_a_ms: number;
  /**  [m/s] */
  cruise_tas_at_target_ms: number;
}

/** SpanStation(y_m: 'float', eta: 'float', le_x_m: 'float', te_x_m: 'float', chord_m: 'float', thickness_frac: 'float', twist_deg: 'float', schrenk_load: 'float', elliptic_load: 'float', departure: 'float') */
export interface SpanStation {
  /**  [m] */
  y_m: number;
  /** y / (b/2) */
  eta: number;
  /**  [m] */
  le_x_m: number;
  /**  [m] */
  te_x_m: number;
  /**  [m] */
  chord_m: number;
  thickness_frac: number;
  /**  [deg] */
  twist_deg: number;
  /** local lift per unit span, normalised to mean */
  schrenk_load: number;
  elliptic_load: number;
  /** schrenk - elliptic, as a fraction of elliptic */
  departure: number;
}

/** Planform(span_m: 'float', length_m: 'float', area_m2: 'float', mac_m: 'float', aspect_ratio: 'float', root_chord_m: 'float', tip_chord_m: 'float', crank_y_m: 'float', crank_x_m: 'float', tip_le_x_m: 'float', taper_ratio: 'float', outline: 'List[Tuple[float, float]]' = <factory>, stations: 'List[SpanStation]' = <factory>) */
export interface Planform {
  /**  [m] */
  span_m: number;
  /**  [m] */
  length_m: number;
  /** full planform area enclosed by the drawn outline [m2] */
  area_m2: number;
  /**  [m] */
  mac_m: number;
  aspect_ratio: number;
  /**  [m] */
  root_chord_m: number;
  /**  [m] */
  tip_chord_m: number;
  /**  [m] */
  crank_y_m: number;
  /**  [m] */
  crank_x_m: number;
  /**  [m] */
  tip_le_x_m: number;
  taper_ratio: number;
  /** half planform, x aft, y out */
  outline: number[][];
  stations: SpanStation[];
}

/** How far the drawn shape is from the numbers the drag polar is written to. */
export interface Reconciliation {
  /**  [m2] */
  drawn_area_m2: number;
  /**  [m2] */
  reference_area_m2: number;
  /** signed fraction, (drawn - reference) / reference */
  area_error: number;
  drawn_aspect_ratio: number;
  reference_aspect_ratio: number;
  /**  [m] */
  drawn_mac_m: number;
  /**  [m] */
  reference_mac_m: number;
  mac_error: number;
  span_length_ratio: number;
  cad_span_length_ratio: number;
  span_length_error: number;
  tolerance: number;
  consistent: boolean;
  ld_max_reference: number;
  ld_max_drawn: number;
  warnings: string[];
}

/** DragPoint(mach: 'float', cl: 'float', cd0: 'float', cdi: 'float', cd_wave: 'float', cd_total: 'float', ld: 'float', counts_cd0: 'float', counts_cdi: 'float', counts_wave: 'float', frac_cd0: 'float', frac_cdi: 'float', frac_wave: 'float') */
export interface DragPoint {
  /**  [M] */
  mach: number;
  cl: number;
  cd0: number;
  cdi: number;
  cd_wave: number;
  cd_total: number;
  ld: number;
  /** one drag count is 1e-4 of CD */
  counts_cd0: number;
  counts_cdi: number;
  counts_wave: number;
  frac_cd0: number;
  frac_cdi: number;
  frac_wave: number;
}

/** PolarPoint(cl: 'float', cd: 'float', ld: 'float') */
export interface PolarPoint {
  cl: number;
  cd: number;
  ld: number;
}

/** PolarResult(altitude_m: 'float', mass_kg: 'float', mach_ref: 'float', ld_max: 'float', cl_at_ld_max: 'float', cd_at_ld_max: 'float', v_at_ld_max_ms: 'float', mach_at_ld_max: 'float', cruise_ld: 'float', breakdown: 'List[DragPoint]' = <factory>, polar: 'List[PolarPoint]' = <factory>, ld_vs_mach: 'List[Tuple[float, float]]' = <factory>, note: 'str' = '') */
export interface PolarResult {
  /**  [m] */
  altitude_m: number;
  /**  [kg] */
  mass_kg: number;
  mach_ref: number;
  ld_max: number;
  cl_at_ld_max: number;
  cd_at_ld_max: number;
  /**  [m/s] */
  v_at_ld_max_ms: number;
  mach_at_ld_max: number;
  cruise_ld: number;
  breakdown: DragPoint[];
  polar: PolarPoint[];
  ld_vs_mach: number[][];
  note: string;
}

/** Metrics(range_km: 'float', endurance_s: 'float', ld_max: 'float', max_level_mach: 'float', fuel_required_kg: 'float', exit_margin: 'float', min_static_margin: 'float', cruise_cl_fraction: 'float', feasible_launch: 'bool', feasible_fuel: 'bool') */
export interface Metrics {
  /**  [km] */
  range_km: number;
  /**  [s] */
  endurance_s: number;
  ld_max: number;
  /**  [M] */
  max_level_mach: number;
  /**  [kg] */
  fuel_required_kg: number;
  exit_margin: number;
  min_static_margin: number;
  /** cruise CL as a fraction of CL_max */
  cruise_cl_fraction: number;
  feasible_launch: boolean;
  feasible_fuel: boolean;
}

/** SensitivityRow(path: 'str', label: 'str', unit: 'str', baseline: 'float', low: 'float', high: 'float', range_low_pct: 'float', range_high_pct: 'float', endurance_low_pct: 'float', endurance_high_pct: 'float', ld_low_pct: 'float', ld_high_pct: 'float', span_pct: 'float', note: 'str' = '') */
export interface SensitivityRow {
  path: string;
  label: string;
  unit: string;
  baseline: number;
  low: number;
  high: number;
  range_low_pct: number;
  range_high_pct: number;
  endurance_low_pct: number;
  endurance_high_pct: number;
  ld_low_pct: number;
  ld_high_pct: number;
  /** widest range swing, for ordering the tornado */
  span_pct: number;
  note: string;
}

/** Improvement(path: 'str', label: 'str', from_value: 'float', to_value: 'float', unit: 'str', range_gain_pct: 'float', cost: 'str', assumption: 'str', score: 'float') */
export interface Improvement {
  path: string;
  label: string;
  from_value: number;
  to_value: number;
  unit: string;
  range_gain_pct: number;
  cost: string;
  assumption: string;
  score: number;
}

/** SensitivityResult(perturbation: 'float', baseline_range_km: 'float', baseline_endurance_s: 'float', baseline_ld_max: 'float', solves: 'int', solve_ms: 'float', rows: 'List[SensitivityRow]' = <factory>, improvements: 'List[Improvement]' = <factory>, note: 'str' = '') */
export interface SensitivityResult {
  perturbation: number;
  /**  [km] */
  baseline_range_km: number;
  /**  [s] */
  baseline_endurance_s: number;
  baseline_ld_max: number;
  solves: number;
  /**  [m/s] */
  solve_ms: number;
  rows: SensitivityRow[];
  improvements: Improvement[];
  note: string;
}

/** SweepAxis(path: 'str', label: 'str', unit: 'str', lo: 'float', hi: 'float', n: 'int') */
export interface SweepAxis {
  path: string;
  label: string;
  unit: string;
  lo: number;
  hi: number;
  n: number;
}

/** SweepResult(x: 'SweepAxis', y: 'SweepAxis', metric: 'str', metric_label: 'str', metric_unit: 'str', vmin: 'float', vmax: 'float', solves: 'int', solve_ms: 'float', values: 'List[List[float]]' = <factory>, violations: 'List[List[int]]' = <factory>, constraints: 'List[str]' = <factory>, note: 'str' = '') */
export interface SweepResult {
  x: SweepAxis;
  y: SweepAxis;
  metric: string;
  metric_label: string;
  metric_unit: string;
  vmin: number;
  vmax: number;
  solves: number;
  /**  [m/s] */
  solve_ms: number;
  values: number[][];
  violations: number[][];
  constraints: string[];
  note: string;
}

/** Columns of the 50 Hz trajectory, in the order the solver packs them. */
export const TRAJECTORY_COLUMNS = ["t", "x_m", "y_m", "s_ground_m", "h_m", "v_tas_ms", "v_ground_ms", "mach", "gamma_deg", "psi_deg", "bank_deg", "roc_ms", "mass_kg", "fuel_kg", "fuel_flow_kgs", "throttle_cmd", "throttle_act", "thrust_n", "drag_n", "lift_n", "thrust_margin_n", "ps_ms", "cl", "cd", "cd0", "cdi", "cd_wave", "ld", "q_pa", "load_factor", "rho", "a_sound_ms", "temp_k", "press_pa", "reynolds", "x_cg_m", "static_margin", "wave_drag_active", "stall_limited", "lift_limited", "phase"] as const;
export type TrajectoryColumn = (typeof TRAJECTORY_COLUMNS)[number];

/** Flight phase index -> name. */
export const PHASE_NAMES = ["rail", "climb", "cruise", "descent"] as const;

export const TRAJECTORY_FORMAT_F32 = "f32-le-shuffle-deflate-base64";
export const TRAJECTORY_FORMAT_F32_RAW = "f32-le-base64";
export const TRAJECTORY_FORMAT_JSON = "json";

/** Trajectory as it crosses the wire: the columns concatenated in
  * `columns` order as little-endian float32, byte-plane shuffled,
  * deflated and base64 encoded. `stride` is 1 unless the run was so long
  * that it had to be decimated to fit the response limit. */
export interface EncodedTrajectory {
  format: string;
  columns: TrajectoryColumn[];
  n: number;
  stride: number;
  data: string | Record<string, number[]>;
  note?: string;
}

export interface SimulationResponse extends Omit<SimulationResult, "trajectory"> {
  ok: boolean;
  trajectory: EncodedTrajectory;
}

export interface ApiError {
  ok: false;
  error: string;
  detail?: string;
}

export interface FeasibilityResponse {
  ok: boolean;
  planform: Planform;
  reconciliation: Reconciliation;
  fuel: FuelBudget;
  resolved: ResolvedProfile;
  launch: LaunchFeasibility;
  derived: Derived;
  engine_only_exit_ms: number;
  engine_only_feasible: boolean;
  mach1: Mach1Deficit;
  mach_sweep: MachSweepPoint[];
  sweep_altitude_m: number;
  sweep_mass_kg: number;
  booster_solution?: LaunchFeasibility;
  rail_trade?: RailTradePoint[];
}

export type StudyOp = "polar" | "sensitivity" | "sweep" | "planform";

export interface StudyResponse {
  ok: boolean;
  op: StudyOp;
  polar?: PolarResult;
  sensitivity?: SensitivityResult;
  sweep?: SweepResult;
  planform?: Planform;
  reconciliation?: Reconciliation;
}

/** Metrics a sweep can colour by. Keys match _core.study.METRICS. */
export const SWEEP_METRICS = {
  "range_km": {
    "label": "Range on a full tank",
    "unit": "km"
  },
  "endurance_s": {
    "label": "Endurance",
    "unit": "s"
  },
  "ld_max": {
    "label": "L/D max",
    "unit": ""
  },
  "max_level_mach": {
    "label": "Maximum level Mach",
    "unit": "M"
  },
  "fuel_required_kg": {
    "label": "Fuel required",
    "unit": "kg"
  },
  "exit_margin": {
    "label": "Rail exit margin",
    "unit": "x Vs"
  }
} as const;

/** Parameters a sweep or sensitivity run can address. */
export const STUDY_PARAMS = {
  "airframe.oswald_e": {
    "label": "Oswald efficiency",
    "unit": ""
  },
  "airframe.cd0_sub": {
    "label": "Parasite drag CD0",
    "unit": ""
  },
  "airframe.mach_dd": {
    "label": "Drag divergence Mach",
    "unit": "M"
  },
  "airframe.dcd_wave": {
    "label": "Wave drag increment",
    "unit": ""
  },
  "airframe.aspect_ratio": {
    "label": "Aspect ratio",
    "unit": ""
  },
  "airframe.cl_max": {
    "label": "Maximum lift coefficient",
    "unit": ""
  },
  "airframe.mass_payload_kg": {
    "label": "Payload",
    "unit": "kg"
  },
  "airframe.wing_area_m2": {
    "label": "Reference area",
    "unit": "m2"
  },
  "airframe.span_m": {
    "label": "Span",
    "unit": "m"
  },
  "airframe.fuel_capacity_kg": {
    "label": "Tank capacity",
    "unit": "kg"
  },
  "engine.mdot_0": {
    "label": "Sea-level mass flow",
    "unit": "kg/s"
  },
  "engine.tsfc_base": {
    "label": "TSFC",
    "unit": "kg/(N h)"
  },
  "mission.cruise_altitude_m": {
    "label": "Cruise altitude",
    "unit": "m"
  },
  "mission.target_mach": {
    "label": "Cruise Mach",
    "unit": "M"
  }
} as const;

export const SWEEP_CONSTRAINTS = ["rail exit", "static margin", "fuel capacity", "cruise CL against CL_max"] as const;
export const SWEEP_MAX_GRID = 32;

export interface RailTradePoint {
  rail_length_m: number;
  booster_thrust_n: number;
  booster_burn_time_s: number;
  booster_impulse_ns: number;
  peak_g: number;
  v_exit_ms: number;
}

/** Every default, straight from the Python dataclasses. */
export const DEFAULT_MISSION_SPEC: MissionSpec = {
  "airframe": {
    "wing_area_m2": 0.3,
    "span_m": 1.1,
    "mac_m": 0.2727,
    "length_m": 2.0,
    "cd0_sub": 0.024,
    "mach_dd": 0.82,
    "dcd_wave": 0.045,
    "wave_width": 0.06,
    "oswald_e": 0.72,
    "cl_max": 0.9,
    "mass_airframe_kg": 6.5,
    "mass_engine_kg": 2.8,
    "mass_avionics_kg": 1.8,
    "mass_payload_kg": 1.0,
    "fuel_capacity_kg": 3.0,
    "x_airframe_m": 0.95,
    "x_engine_m": 1.45,
    "x_avionics_m": 0.45,
    "x_payload_m": 0.55,
    "x_fuel_m": 0.8,
    "x_np_m": 0.96,
    "static_margin_min": 0.03,
    "planform": {
      "sweep_inboard_deg": 67.0,
      "sweep_outer_deg": 40.0,
      "crank_frac": 0.58,
      "radome_frac": 0.3,
      "body_halfwidth_frac": 0.24,
      "te_notch_halfwidth_frac": 0.1,
      "te_notch_depth_frac": 0.09,
      "tip_chord_frac": 1.0,
      "thickness_root_frac": 0.135,
      "thickness_tip_frac": 0.07,
      "twist_root_deg": 0.0,
      "twist_tip_deg": -2.0,
      "inlet_start_frac": 0.42,
      "inlet_length_frac": 0.16,
      "engine_radius_frac": 0.055,
      "fin_span_frac": 0.1,
      "fin_station_frac": 0.62
    },
    "planform_area_tolerance": 0.02
  },
  "engine": {
    "mdot_0": 0.45,
    "ve": 556.0,
    "ram_k": 0.35,
    "ram_mach_clamp": 1.2,
    "idle_frac": 0.1,
    "spool_exp": 1.4,
    "tau_up_s": 2.0,
    "tau_down_s": 1.2,
    "tsfc_base": 0.145,
    "tsfc_throttle_k": 0.35
  },
  "atmosphere": {
    "delta_isa_k": 0.0,
    "headwind_ms": 0.0,
    "ground_altitude_m": 0.0
  },
  "launch": {
    "rail_length_m": 3.0,
    "rail_angle_deg": 45.0,
    "rail_friction_mu": 0.05,
    "exit_margin": 1.15,
    "engine_prespooled": true,
    "booster": {
      "enabled": true,
      "thrust_n": 2500.0,
      "burn_time_s": 0.19,
      "mass_kg": 0.4,
      "jettison": true,
      "x_booster_m": 1.1
    }
  },
  "mission": {
    "mission_distance_km": 50.0,
    "cruise_altitude_m": 3000.0,
    "climb_rate_ms": 30.0,
    "target_mach": 0.55,
    "descent_rate_ms": 25.0,
    "descent_throttle": 0.25,
    "reserve_frac": 0.15,
    "auto_profile": true,
    "descent_start_s": 230.0,
    "end_altitude_m": 500.0,
    "duration_s": 300.0,
    "auto_fuel": true,
    "fuel_mass_kg": 2.9
  },
  "control": {
    "throttle_schedule": null,
    "altitude_schedule": null,
    "heading_schedule": null,
    "k_gamma": 1.0,
    "k_alt": 0.06,
    "n_max": 4.0
  },
  "integration": {
    "dt": 0.005,
    "output_hz": 50.0,
    "stop_on_ground": true
  },
  "resume": null,
  "label": "MSN-0417",
  "config_name": "CONFIG B"
};

export interface FieldMeta {
  path: string;
  label: string;
  unit: string;
  type: string;
  default: number | boolean | string | null;
  doc?: string;
  min?: number;
  max?: number;
  step?: number;
}

/** Editable model constants: default, range and the note that documents
  * where the number came from. Drives the Model parameters drawer. */
export const FIELD_META: Record<string, FieldMeta> = 
{
  "airframe.wing_area_m2": {
    "path": "airframe.wing_area_m2",
    "label": "wing area m2",
    "unit": "m2",
    "type": "number",
    "default": 0.3,
    "doc": "S",
    "min": 0.1,
    "max": 0.6,
    "step": 0.005
  },
  "airframe.span_m": {
    "path": "airframe.span_m",
    "label": "span m",
    "unit": "m",
    "type": "number",
    "default": 1.1,
    "doc": "b  -> AR = b^2/S = 4.033",
    "min": 0.6,
    "max": 2.2,
    "step": 0.01
  },
  "airframe.mac_m": {
    "path": "airframe.mac_m",
    "label": "mac m",
    "unit": "m",
    "type": "number",
    "default": 0.2727,
    "doc": "mean aerodynamic chord, S/b for the reference planform",
    "min": 0.1,
    "max": 0.6,
    "step": 0.001
  },
  "airframe.length_m": {
    "path": "airframe.length_m",
    "label": "length m",
    "unit": "m",
    "type": "number",
    "default": 2.0,
    "doc": "overall length, used by the 3D placeholder",
    "min": 1.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.cd0_sub": {
    "path": "airframe.cd0_sub",
    "label": "cd0 sub",
    "unit": "",
    "type": "number",
    "default": 0.024,
    "doc": "subsonic zero-lift drag coefficient",
    "min": 0.01,
    "max": 0.06,
    "step": 0.0005
  },
  "airframe.mach_dd": {
    "path": "airframe.mach_dd",
    "label": "mach dd",
    "unit": "M",
    "type": "number",
    "default": 0.82,
    "doc": "drag-divergence Mach number",
    "min": 0.5,
    "max": 0.95,
    "step": 0.005
  },
  "airframe.dcd_wave": {
    "path": "airframe.dcd_wave",
    "label": "dcd wave",
    "unit": "",
    "type": "number",
    "default": 0.045,
    "doc": "wave drag increment fully developed above M_dd",
    "min": 0.0,
    "max": 0.15,
    "step": 0.001
  },
  "airframe.wave_width": {
    "path": "airframe.wave_width",
    "label": "wave width",
    "unit": "",
    "type": "number",
    "default": 0.06,
    "doc": "tanh blend width of the drag rise",
    "min": 0.01,
    "max": 0.2,
    "step": 0.005
  },
  "airframe.oswald_e": {
    "path": "airframe.oswald_e",
    "label": "oswald e",
    "unit": "",
    "type": "number",
    "default": 0.72,
    "doc": "Oswald span efficiency",
    "min": 0.4,
    "max": 0.98,
    "step": 0.01
  },
  "airframe.cl_max": {
    "path": "airframe.cl_max",
    "label": "cl max",
    "unit": "",
    "type": "number",
    "default": 0.9,
    "doc": "usable maximum lift coefficient",
    "min": 0.4,
    "max": 1.6,
    "step": 0.01
  },
  "airframe.mass_airframe_kg": {
    "path": "airframe.mass_airframe_kg",
    "label": "mass airframe kg",
    "unit": "kg",
    "type": "number",
    "default": 6.5,
    "doc": "carbon skins + ribs",
    "min": 2.0,
    "max": 15.0,
    "step": 0.1
  },
  "airframe.mass_engine_kg": {
    "path": "airframe.mass_engine_kg",
    "label": "mass engine kg",
    "unit": "kg",
    "type": "number",
    "default": 2.8,
    "doc": "turbojet + mounts",
    "min": 1.0,
    "max": 8.0,
    "step": 0.1
  },
  "airframe.mass_avionics_kg": {
    "path": "airframe.mass_avionics_kg",
    "label": "mass avionics kg",
    "unit": "kg",
    "type": "number",
    "default": 1.8,
    "doc": "avionics, servos, battery",
    "min": 0.5,
    "max": 5.0,
    "step": 0.05
  },
  "airframe.mass_payload_kg": {
    "path": "airframe.mass_payload_kg",
    "label": "mass payload kg",
    "unit": "kg",
    "type": "number",
    "default": 1.0,
    "doc": "0 - 3.0",
    "min": 0.0,
    "max": 3.0,
    "step": 0.05
  },
  "airframe.fuel_capacity_kg": {
    "path": "airframe.fuel_capacity_kg",
    "label": "fuel capacity kg",
    "unit": "kg",
    "type": "number",
    "default": 3.0,
    "doc": "tank volume limit",
    "min": 0.5,
    "max": 6.0,
    "step": 0.05
  },
  "airframe.x_airframe_m": {
    "path": "airframe.x_airframe_m",
    "label": "x airframe m",
    "unit": "m",
    "type": "number",
    "default": 0.95,
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.x_engine_m": {
    "path": "airframe.x_engine_m",
    "label": "x engine m",
    "unit": "m",
    "type": "number",
    "default": 1.45,
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.x_avionics_m": {
    "path": "airframe.x_avionics_m",
    "label": "x avionics m",
    "unit": "m",
    "type": "number",
    "default": 0.45,
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.x_payload_m": {
    "path": "airframe.x_payload_m",
    "label": "x payload m",
    "unit": "m",
    "type": "number",
    "default": 0.55,
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.x_fuel_m": {
    "path": "airframe.x_fuel_m",
    "label": "x fuel m",
    "unit": "m",
    "type": "number",
    "default": 0.8,
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.x_np_m": {
    "path": "airframe.x_np_m",
    "label": "x np m",
    "unit": "m",
    "type": "number",
    "default": 0.96,
    "doc": "neutral point",
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "airframe.static_margin_min": {
    "path": "airframe.static_margin_min",
    "label": "static margin min",
    "unit": "",
    "type": "number",
    "default": 0.03,
    "doc": "flag below 3% MAC",
    "min": 0.0,
    "max": 0.25,
    "step": 0.005
  },
  "airframe.planform_area_tolerance": {
    "path": "airframe.planform_area_tolerance",
    "label": "planform area tolerance",
    "unit": "",
    "type": "number",
    "default": 0.02,
    "doc": "warn above 2% disagreement",
    "min": 0.005,
    "max": 0.25,
    "step": 0.005
  },
  "airframe.planform.sweep_inboard_deg": {
    "path": "airframe.planform.sweep_inboard_deg",
    "label": "sweep inboard deg",
    "unit": "deg",
    "type": "number",
    "default": 67.0,
    "doc": "inboard leading-edge sweep",
    "min": 35.0,
    "max": 80.0,
    "step": 0.5
  },
  "airframe.planform.sweep_outer_deg": {
    "path": "airframe.planform.sweep_outer_deg",
    "label": "sweep outer deg",
    "unit": "deg",
    "type": "number",
    "default": 40.0,
    "doc": "outer panel sweep, aft of the crank",
    "min": 10.0,
    "max": 70.0,
    "step": 0.5
  },
  "airframe.planform.crank_frac": {
    "path": "airframe.planform.crank_frac",
    "label": "crank frac",
    "unit": "",
    "type": "number",
    "default": 0.58,
    "doc": "crank station as a fraction of semispan",
    "min": 0.2,
    "max": 0.95,
    "step": 0.01
  },
  "airframe.planform.radome_frac": {
    "path": "airframe.planform.radome_frac",
    "label": "radome frac",
    "unit": "",
    "type": "number",
    "default": 0.3,
    "doc": "ogive radome length as a fraction of overall",
    "min": 0.1,
    "max": 0.5,
    "step": 0.01
  },
  "airframe.planform.body_halfwidth_frac": {
    "path": "airframe.planform.body_halfwidth_frac",
    "label": "body halfwidth frac",
    "unit": "",
    "type": "number",
    "default": 0.24,
    "doc": "centre body half-width, fraction of semispan",
    "min": 0.05,
    "max": 0.6,
    "step": 0.01
  },
  "airframe.planform.te_notch_halfwidth_frac": {
    "path": "airframe.planform.te_notch_halfwidth_frac",
    "label": "te notch halfwidth frac",
    "unit": "",
    "type": "number",
    "default": 0.1,
    "doc": "exhaust notch half-width, fraction of semispan",
    "min": 0.0,
    "max": 0.35,
    "step": 0.01
  },
  "airframe.planform.te_notch_depth_frac": {
    "path": "airframe.planform.te_notch_depth_frac",
    "label": "te notch depth frac",
    "unit": "",
    "type": "number",
    "default": 0.09,
    "doc": "notch depth, fraction of overall length",
    "min": 0.0,
    "max": 0.3,
    "step": 0.005
  },
  "airframe.planform.tip_chord_frac": {
    "path": "airframe.planform.tip_chord_frac",
    "label": "tip chord frac",
    "unit": "",
    "type": "number",
    "default": 1.0,
    "doc": "1.0 = squared tip running back to the TE",
    "min": 0.1,
    "max": 1.0,
    "step": 0.01
  },
  "airframe.planform.thickness_root_frac": {
    "path": "airframe.planform.thickness_root_frac",
    "label": "thickness root frac",
    "unit": "",
    "type": "number",
    "default": 0.135,
    "doc": "t/c at the centreline",
    "min": 0.05,
    "max": 0.25,
    "step": 0.005
  },
  "airframe.planform.thickness_tip_frac": {
    "path": "airframe.planform.thickness_tip_frac",
    "label": "thickness tip frac",
    "unit": "",
    "type": "number",
    "default": 0.07,
    "doc": "t/c at the tip",
    "min": 0.03,
    "max": 0.2,
    "step": 0.005
  },
  "airframe.planform.twist_root_deg": {
    "path": "airframe.planform.twist_root_deg",
    "label": "twist root deg",
    "unit": "deg",
    "type": "number",
    "default": 0.0,
    "min": -6.0,
    "max": 6.0,
    "step": 0.1
  },
  "airframe.planform.twist_tip_deg": {
    "path": "airframe.planform.twist_tip_deg",
    "label": "twist tip deg",
    "unit": "deg",
    "type": "number",
    "default": -2.0,
    "doc": "washout; geometry only, not fed to the polar",
    "min": -8.0,
    "max": 4.0,
    "step": 0.1
  },
  "airframe.planform.inlet_start_frac": {
    "path": "airframe.planform.inlet_start_frac",
    "label": "inlet start frac",
    "unit": "",
    "type": "number",
    "default": 0.42,
    "doc": "dorsal inlet lip, fraction of length",
    "min": 0.2,
    "max": 0.8,
    "step": 0.01
  },
  "airframe.planform.inlet_length_frac": {
    "path": "airframe.planform.inlet_length_frac",
    "label": "inlet length frac",
    "unit": "",
    "type": "number",
    "default": 0.16,
    "min": 0.05,
    "max": 0.4,
    "step": 0.01
  },
  "airframe.planform.engine_radius_frac": {
    "path": "airframe.planform.engine_radius_frac",
    "label": "engine radius frac",
    "unit": "",
    "type": "number",
    "default": 0.055,
    "doc": "engine casing radius as a fraction of length",
    "min": 0.02,
    "max": 0.15,
    "step": 0.005
  },
  "airframe.planform.fin_span_frac": {
    "path": "airframe.planform.fin_span_frac",
    "label": "fin span frac",
    "unit": "",
    "type": "number",
    "default": 0.1,
    "doc": "blade surface height, fraction of semispan",
    "min": 0.0,
    "max": 0.3,
    "step": 0.01
  },
  "airframe.planform.fin_station_frac": {
    "path": "airframe.planform.fin_station_frac",
    "label": "fin station frac",
    "unit": "",
    "type": "number",
    "default": 0.62,
    "doc": "blade station, fraction of semispan",
    "min": 0.2,
    "max": 0.95,
    "step": 0.01
  },
  "engine.mdot_0": {
    "path": "engine.mdot_0",
    "label": "mdot 0",
    "unit": "",
    "type": "number",
    "default": 0.45,
    "doc": "kg/s. Sea-level static air mass flow at full throttle. PROVENANCE: manufacturer datasheet class figure for a 250 N turbojet. Fit from bench data with from_bench_data().",
    "min": 0.1,
    "max": 1.5,
    "step": 0.005
  },
  "engine.ve": {
    "path": "engine.ve",
    "label": "ve",
    "unit": "",
    "type": "number",
    "default": 556.0,
    "doc": "m/s. Effective exhaust velocity, = T_static / mdot_0 = 250.2 / 0.45. PROVENANCE: derived from the two figures above. A bench run alone gives only the PRODUCT mdot_0 * ve; splitting it needs a measured nozzle exit velocity or a thrust measurement at non-zero forward speed.",
    "min": 250.0,
    "max": 900.0,
    "step": 1.0
  },
  "engine.ram_k": {
    "path": "engine.ram_k",
    "label": "ram k",
    "unit": "K",
    "type": "number",
    "default": 0.35,
    "doc": "Coefficient in ram_recovery(M) = sqrt(1 + ram_k * M^2). Captures the rise in captured mass flow with forward speed. PROVENANCE: tuned placeholder; replace with an inlet pressure-recovery map.",
    "min": 0.0,
    "max": 1.2,
    "step": 0.01
  },
  "engine.ram_mach_clamp": {
    "path": "engine.ram_mach_clamp",
    "label": "ram mach clamp",
    "unit": "M",
    "type": "number",
    "default": 1.2,
    "doc": "Ram recovery is not extrapolated above this Mach - the subsonic pitot inlet is not modelled through a normal shock.",
    "min": 0.5,
    "max": 2.5,
    "step": 0.05
  },
  "engine.idle_frac": {
    "path": "engine.idle_frac",
    "label": "idle frac",
    "unit": "",
    "type": "number",
    "default": 0.1,
    "doc": "Flow fraction at zero throttle command (idle floor).",
    "min": 0.0,
    "max": 0.4,
    "step": 0.005
  },
  "engine.spool_exp": {
    "path": "engine.spool_exp",
    "label": "spool exp",
    "unit": "",
    "type": "number",
    "default": 1.4,
    "doc": "spool(d) = idle_frac + (1 - idle_frac) * d^spool_exp.",
    "min": 0.5,
    "max": 3.0,
    "step": 0.05
  },
  "engine.tau_up_s": {
    "path": "engine.tau_up_s",
    "label": "tau up s",
    "unit": "s",
    "type": "number",
    "default": 2.0,
    "doc": "s. First-order spool-up time constant (accel).",
    "min": 0.1,
    "max": 8.0,
    "step": 0.1
  },
  "engine.tau_down_s": {
    "path": "engine.tau_down_s",
    "label": "tau down s",
    "unit": "s",
    "type": "number",
    "default": 1.2,
    "doc": "s. First-order spool-down time constant (decel).",
    "min": 0.1,
    "max": 8.0,
    "step": 0.1
  },
  "engine.tsfc_base": {
    "path": "engine.tsfc_base",
    "label": "tsfc base",
    "unit": "kg/(N h)",
    "type": "number",
    "default": 0.145,
    "doc": "kg/(N h) at full throttle.",
    "min": 0.05,
    "max": 0.4,
    "step": 0.001
  },
  "engine.tsfc_throttle_k": {
    "path": "engine.tsfc_throttle_k",
    "label": "tsfc throttle k",
    "unit": "kg/(N h)",
    "type": "number",
    "default": 0.35,
    "doc": "TSFC = tsfc_base * (1 + tsfc_throttle_k * (1 - d)) - part-throttle penalty.",
    "min": 0.0,
    "max": 1.5,
    "step": 0.01
  },
  "atmosphere.delta_isa_k": {
    "path": "atmosphere.delta_isa_k",
    "label": "delta isa k",
    "unit": "K",
    "type": "number",
    "default": 0.0,
    "doc": "non-standard day temperature offset, K",
    "min": -30.0,
    "max": 40.0,
    "step": 1.0
  },
  "atmosphere.headwind_ms": {
    "path": "atmosphere.headwind_ms",
    "label": "headwind ms",
    "unit": "m/s",
    "type": "number",
    "default": 0.0,
    "doc": "+ve = headwind, reduces ground speed",
    "min": -40.0,
    "max": 40.0,
    "step": 1.0
  },
  "atmosphere.ground_altitude_m": {
    "path": "atmosphere.ground_altitude_m",
    "label": "ground altitude m",
    "unit": "m",
    "type": "number",
    "default": 0.0,
    "doc": "launch site elevation",
    "min": 0.0,
    "max": 3000.0,
    "step": 10.0
  },
  "launch.rail_length_m": {
    "path": "launch.rail_length_m",
    "label": "rail length m",
    "unit": "m",
    "type": "number",
    "default": 3.0,
    "min": 1.0,
    "max": 12.0,
    "step": 0.1
  },
  "launch.rail_angle_deg": {
    "path": "launch.rail_angle_deg",
    "label": "rail angle deg",
    "unit": "deg",
    "type": "number",
    "default": 45.0,
    "min": 10.0,
    "max": 80.0,
    "step": 1.0
  },
  "launch.rail_friction_mu": {
    "path": "launch.rail_friction_mu",
    "label": "rail friction mu",
    "unit": "",
    "type": "number",
    "default": 0.05,
    "min": 0.0,
    "max": 0.3,
    "step": 0.005
  },
  "launch.exit_margin": {
    "path": "launch.exit_margin",
    "label": "exit margin",
    "unit": "",
    "type": "number",
    "default": 1.15,
    "doc": "required V_exit / V_stall",
    "min": 1.0,
    "max": 1.6,
    "step": 0.01
  },
  "launch.engine_prespooled": {
    "path": "launch.engine_prespooled",
    "label": "engine prespooled",
    "unit": "",
    "type": "boolean",
    "default": true,
    "doc": "engine brought to commanded throttle before release"
  },
  "launch.booster.enabled": {
    "path": "launch.booster.enabled",
    "label": "enabled",
    "unit": "",
    "type": "boolean",
    "default": true
  },
  "launch.booster.thrust_n": {
    "path": "launch.booster.thrust_n",
    "label": "thrust n",
    "unit": "N",
    "type": "number",
    "default": 2500.0,
    "doc": "sized by solve_booster() for a 3 m rail at 13.5 kg gross",
    "min": 0.0,
    "max": 8000.0,
    "step": 25.0
  },
  "launch.booster.burn_time_s": {
    "path": "launch.booster.burn_time_s",
    "label": "burn time s",
    "unit": "s",
    "type": "number",
    "default": 0.19,
    "doc": "475 N s total impulse",
    "min": 0.02,
    "max": 2.0,
    "step": 0.01
  },
  "launch.booster.mass_kg": {
    "path": "launch.booster.mass_kg",
    "label": "mass kg",
    "unit": "kg",
    "type": "number",
    "default": 0.4,
    "doc": "motor + case; ~0.22 kg propellant at Isp 200 s",
    "min": 0.0,
    "max": 2.0,
    "step": 0.01
  },
  "launch.booster.jettison": {
    "path": "launch.booster.jettison",
    "label": "jettison",
    "unit": "",
    "type": "boolean",
    "default": true
  },
  "launch.booster.x_booster_m": {
    "path": "launch.booster.x_booster_m",
    "label": "x booster m",
    "unit": "m",
    "type": "number",
    "default": 1.1,
    "doc": "station of the booster mass, kept near the CG so the motor does not destabilise the aircraft during the rail run",
    "min": 0.0,
    "max": 4.0,
    "step": 0.01
  },
  "mission.mission_distance_km": {
    "path": "mission.mission_distance_km",
    "label": "mission distance km",
    "unit": "km",
    "type": "number",
    "default": 50.0,
    "min": 5.0,
    "max": 150.0,
    "step": 1.0
  },
  "mission.cruise_altitude_m": {
    "path": "mission.cruise_altitude_m",
    "label": "cruise altitude m",
    "unit": "m",
    "type": "number",
    "default": 3000.0,
    "min": 200.0,
    "max": 11000.0,
    "step": 50.0
  },
  "mission.climb_rate_ms": {
    "path": "mission.climb_rate_ms",
    "label": "climb rate ms",
    "unit": "m/s",
    "type": "number",
    "default": 30.0,
    "min": 2.0,
    "max": 60.0,
    "step": 1.0
  },
  "mission.target_mach": {
    "path": "mission.target_mach",
    "label": "target mach",
    "unit": "M",
    "type": "number",
    "default": 0.55,
    "min": 0.1,
    "max": 0.95,
    "step": 0.005
  },
  "mission.descent_rate_ms": {
    "path": "mission.descent_rate_ms",
    "label": "descent rate ms",
    "unit": "m/s",
    "type": "number",
    "default": 25.0,
    "min": 2.0,
    "max": 60.0,
    "step": 1.0
  },
  "mission.descent_throttle": {
    "path": "mission.descent_throttle",
    "label": "descent throttle",
    "unit": "",
    "type": "number",
    "default": 0.25,
    "doc": "throttle held on the descent leg",
    "min": 0.0,
    "max": 1.0,
    "step": 0.01
  },
  "mission.reserve_frac": {
    "path": "mission.reserve_frac",
    "label": "reserve frac",
    "unit": "",
    "type": "number",
    "default": 0.15,
    "doc": "fraction of cruise fuel held in reserve",
    "min": 0.0,
    "max": 0.5,
    "step": 0.01
  },
  "mission.auto_profile": {
    "path": "mission.auto_profile",
    "label": "auto profile",
    "unit": "",
    "type": "boolean",
    "default": true,
    "doc": "derive descent_start_s / duration_s from the range"
  },
  "mission.descent_start_s": {
    "path": "mission.descent_start_s",
    "label": "descent start s",
    "unit": "s",
    "type": "number",
    "default": 230.0,
    "doc": "used when auto_profile is False",
    "min": 5.0,
    "max": 1200.0,
    "step": 1.0
  },
  "mission.end_altitude_m": {
    "path": "mission.end_altitude_m",
    "label": "end altitude m",
    "unit": "m",
    "type": "number",
    "default": 500.0,
    "min": 0.0,
    "max": 6000.0,
    "step": 50.0
  },
  "mission.duration_s": {
    "path": "mission.duration_s",
    "label": "duration s",
    "unit": "s",
    "type": "number",
    "default": 300.0,
    "doc": "used when auto_profile is False",
    "min": 10.0,
    "max": 1200.0,
    "step": 5.0
  },
  "mission.auto_fuel": {
    "path": "mission.auto_fuel",
    "label": "auto fuel",
    "unit": "",
    "type": "boolean",
    "default": true,
    "doc": "size fuel from range; else use fuel_mass_kg"
  },
  "mission.fuel_mass_kg": {
    "path": "mission.fuel_mass_kg",
    "label": "fuel mass kg",
    "unit": "kg",
    "type": "number",
    "default": 2.9,
    "doc": "used when auto_fuel is False",
    "min": 0.0,
    "max": 6.0,
    "step": 0.01
  },
  "control.k_gamma": {
    "path": "control.k_gamma",
    "label": "k gamma",
    "unit": "",
    "type": "number",
    "default": 1.0,
    "doc": "1/s, flight-path angle loop gain",
    "min": 0.1,
    "max": 4.0,
    "step": 0.05
  },
  "control.k_alt": {
    "path": "control.k_alt",
    "label": "k alt",
    "unit": "",
    "type": "number",
    "default": 0.06,
    "doc": "1/s, altitude error -> commanded climb rate",
    "min": 0.005,
    "max": 0.4,
    "step": 0.005
  },
  "control.n_max": {
    "path": "control.n_max",
    "label": "n max",
    "unit": "",
    "type": "number",
    "default": 4.0,
    "doc": "structural load factor limit",
    "min": 1.5,
    "max": 9.0,
    "step": 0.1
  },
  "integration.dt": {
    "path": "integration.dt",
    "label": "dt",
    "unit": "s",
    "type": "number",
    "default": 0.005,
    "doc": "s, fixed RK4 step",
    "min": 0.001,
    "max": 0.02,
    "step": 0.001
  },
  "integration.output_hz": {
    "path": "integration.output_hz",
    "label": "output hz",
    "unit": "Hz",
    "type": "number",
    "default": 50.0,
    "doc": "sample rate of the returned trajectory",
    "min": 10.0,
    "max": 200.0,
    "step": 5.0
  },
  "integration.stop_on_ground": {
    "path": "integration.stop_on_ground",
    "label": "stop on ground",
    "unit": "",
    "type": "boolean",
    "default": true
  }
};

export const MODEL_PARAM_GROUPS: { title: string; prefix: string }[] = [
  { title: "Airframe", prefix: "airframe" },
  { title: "Planform", prefix: "airframe.planform" },
  { title: "Engine", prefix: "engine" },
  { title: "Atmosphere", prefix: "atmosphere" },
  { title: "Launch", prefix: "launch" },
  { title: "Mission", prefix: "mission" },
  { title: "Control", prefix: "control" },
  { title: "Integration", prefix: "integration" },
];
