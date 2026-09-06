"""250 N class turbojet, momentum model with ram drag.

The model computes NET thrust:

    T_net = mdot(h, M, throttle) * (Ve - V_inf)

`Ve` is the effective exhaust velocity and `mdot` the air mass flow. The term
`mdot * V_inf` is the ram drag of the captured stream. Omitting it is the single
most common error in small-turbojet performance work and it is what makes an
airframe look supersonic on 250 N of static thrust when it is not.

Every constant below is a placeholder for test-stand data. Provenance is noted
per field; `EngineProfile.from_bench_data()` refits the fittable ones from a CSV.
"""
from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

from .constants import RHO0_ISA


@dataclass
class EngineProfile:
    # --- flow and exhaust -------------------------------------------------
    mdot_0: float = 0.45
    """kg/s. Sea-level static air mass flow at full throttle.
    PROVENANCE: manufacturer datasheet class figure for a 250 N turbojet.
    Fit from bench data with from_bench_data()."""

    ve: float = 556.0
    """m/s. Effective exhaust velocity, = T_static / mdot_0 = 250.2 / 0.45.
    PROVENANCE: derived from the two figures above. A bench run alone gives only
    the PRODUCT mdot_0 * ve; splitting it needs a measured nozzle exit velocity
    or a thrust measurement at non-zero forward speed."""

    # --- ram recovery -----------------------------------------------------
    ram_k: float = 0.35
    """Coefficient in ram_recovery(M) = sqrt(1 + ram_k * M^2). Captures the rise
    in captured mass flow with forward speed. PROVENANCE: tuned placeholder;
    replace with an inlet pressure-recovery map."""

    ram_mach_clamp: float = 1.2
    """Ram recovery is not extrapolated above this Mach - the subsonic pitot
    inlet is not modelled through a normal shock."""

    # --- throttle ---------------------------------------------------------
    idle_frac: float = 0.10
    """Flow fraction at zero throttle command (idle floor)."""

    spool_exp: float = 1.4
    """spool(d) = idle_frac + (1 - idle_frac) * d^spool_exp."""

    tau_up_s: float = 2.0
    """s. First-order spool-up time constant (accel)."""

    tau_down_s: float = 1.2
    """s. First-order spool-down time constant (decel)."""

    # --- fuel -------------------------------------------------------------
    tsfc_base: float = 0.145
    """kg/(N h) at full throttle."""

    tsfc_throttle_k: float = 0.35
    """TSFC = tsfc_base * (1 + tsfc_throttle_k * (1 - d)) - part-throttle penalty."""

    # ---------------------------------------------------------------------
    @property
    def thrust_static_sl_n(self) -> float:
        """Sea-level static thrust at full throttle."""
        return self.mdot_0 * self.ve

    def spool(self, throttle: float) -> float:
        d = 0.0 if throttle < 0.0 else (1.0 if throttle > 1.0 else throttle)
        return self.idle_frac + (1.0 - self.idle_frac) * d ** self.spool_exp

    def ram_recovery(self, mach: float) -> float:
        m = mach if mach < self.ram_mach_clamp else self.ram_mach_clamp
        if m < 0.0:
            m = 0.0
        return math.sqrt(1.0 + self.ram_k * m * m)

    def mass_flow(self, rho: float, mach: float, throttle: float) -> float:
        return self.mdot_0 * (rho / RHO0_ISA) * self.spool(throttle) * self.ram_recovery(mach)

    def net_thrust(self, rho: float, mach: float, v_inf: float, throttle: float,
                   has_fuel: bool = True) -> float:
        """Net thrust in N. Ram drag of the captured stream is already subtracted."""
        if not has_fuel:
            return 0.0
        return self.mass_flow(rho, mach, throttle) * (self.ve - v_inf)

    def tsfc_si(self, throttle: float) -> float:
        """kg/(N s)."""
        d = 0.0 if throttle < 0.0 else (1.0 if throttle > 1.0 else throttle)
        return self.tsfc_base * (1.0 + self.tsfc_throttle_k * (1.0 - d)) / 3600.0

    def fuel_flow(self, thrust_n: float, throttle: float) -> float:
        """kg/s. Zero for negative net thrust - the engine cannot un-burn fuel."""
        t = thrust_n if thrust_n > 0.0 else 0.0
        return self.tsfc_si(throttle) * t

    def tau(self, throttle_cmd: float, throttle_act: float) -> float:
        return self.tau_up_s if throttle_cmd > throttle_act else self.tau_down_s

    # ---------------------------------------------------------------------
    @classmethod
    def from_bench_data(
        cls,
        csv_text: str,
        ve_ms: Optional[float] = None,
        base: Optional["EngineProfile"] = None,
    ) -> Tuple["EngineProfile", dict]:
        """Fit the engine deck to a static test-stand run.

        The CSV needs a header row and three columns, named case-insensitively:
            throttle      0-1 or 0-100
            thrust        N (static, sea level)
            fuel_flow     kg/s   (kg/h and g/s also accepted via the unit hint
                                  in the column name, e.g. "fuel_flow_kgh")

        What a static run can and cannot determine
        ------------------------------------------
        Static thrust is  T = mdot_0 * ve * spool(d), so the run constrains only
        the PRODUCT mdot_0 * ve, plus the shape of spool(d). Pass `ve_ms` from a
        measured exhaust velocity (or an in-flight thrust point) to split the
        product. Without it, `ve` is carried over from `base` and mdot_0 is
        back-solved so the product matches - the static curve is then exact but
        the ram-drag slope is only as good as the assumed ve.

        Returns (profile, report). `report` holds residuals so the fit can be
        judged rather than trusted.
        """
        import numpy as np

        base = base or cls()
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        if not rows:
            raise ValueError("bench CSV contained no data rows")

        def pick(names: Sequence[str]) -> str:
            keys = {k.strip().lower(): k for k in rows[0].keys() if k}
            for n in names:
                for lk, orig in keys.items():
                    if lk.startswith(n):
                        return orig
            raise ValueError(f"bench CSV missing a column starting with one of {names}")

        c_thr = pick(["throttle", "pla", "cmd"])
        c_th = pick(["thrust", "force"])
        c_ff = pick(["fuel_flow", "fuelflow", "ff", "mdot_f"])

        thr = np.array([float(r[c_thr]) for r in rows], dtype=float)
        thrust = np.array([float(r[c_th]) for r in rows], dtype=float)
        ff = np.array([float(r[c_ff]) for r in rows], dtype=float)

        if thr.max() > 1.5:                     # given in percent
            thr = thr / 100.0
        lk = c_ff.lower()
        if "kgh" in lk or "kg_h" in lk or "/h" in lk:
            ff = ff / 3600.0
        elif lk.endswith("_gs") or "g_s" in lk:
            ff = ff / 1000.0

        # --- spool law + product mdot_0*ve --------------------------------
        # T(d) = P * (idle + (1-idle) * d^n).  Fit P, idle, n by a coarse grid
        # on (idle, n) with a closed-form least squares on P at each node.
        t_full = float(thrust[np.argmax(thr)])
        best = None
        for n in np.arange(0.6, 3.01, 0.02):
            for idle in np.arange(0.0, 0.351, 0.005):
                basis = idle + (1.0 - idle) * np.power(np.clip(thr, 0, 1), n)
                denom = float(basis @ basis)
                if denom <= 0:
                    continue
                p = float(basis @ thrust) / denom
                resid = thrust - p * basis
                sse = float(resid @ resid)
                if best is None or sse < best[0]:
                    best = (sse, p, float(idle), float(n))
        sse, product, idle_frac, spool_exp = best

        ve = float(ve_ms) if ve_ms else base.ve
        mdot_0 = product / ve

        # --- TSFC ---------------------------------------------------------
        # tsfc(d) = tsfc_base * (1 + k*(1-d)) in kg/(N h)
        pos = thrust > 1e-6
        tsfc_h = np.zeros_like(thrust)
        tsfc_h[pos] = ff[pos] / thrust[pos] * 3600.0
        A = np.column_stack([np.ones(pos.sum()), (1.0 - thr[pos])])
        coef, *_ = np.linalg.lstsq(A, tsfc_h[pos], rcond=None)
        tsfc_base = float(coef[0])
        tsfc_k = float(coef[1] / coef[0]) if abs(coef[0]) > 1e-12 else base.tsfc_throttle_k

        prof = cls(
            mdot_0=mdot_0, ve=ve, ram_k=base.ram_k, ram_mach_clamp=base.ram_mach_clamp,
            idle_frac=idle_frac, spool_exp=spool_exp,
            tau_up_s=base.tau_up_s, tau_down_s=base.tau_down_s,
            tsfc_base=tsfc_base, tsfc_throttle_k=tsfc_k,
        )
        rms = math.sqrt(sse / len(thrust))
        report = {
            "n_points": len(thrust),
            "thrust_product_n": product,
            "thrust_rms_error_n": rms,
            "thrust_full_measured_n": t_full,
            "ve_source": "measured" if ve_ms else "carried from base profile",
            "ve_ms": ve,
            "mdot_0_kgs": mdot_0,
            "idle_frac": idle_frac,
            "spool_exp": spool_exp,
            "tsfc_base_kg_per_Nh": tsfc_base,
            "tsfc_throttle_k": tsfc_k,
            "warning": None if ve_ms else
                       "ve not measured; ram-drag slope inherited, not fitted",
        }
        return prof, report
