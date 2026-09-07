"""Physical constants and the solver version.

Single source of truth - do not redefine these anywhere else."""

#: Stamped on every stored run. Bump the major when a change makes previously
#: stored results incomparable, which is exactly what happened at 2.0.0: the
#: planform was remeasured from the CAD render and the reference area moved by a
#: factor of five, so runs either side of it describe different aircraft.
#:
#:   1.x  reference area 0.30 m2, span 1.10 m, AR 4.03
#:   2.x  measured planform, length is the only dimensional input, AR 1.42
SOLVER_VERSION = "2.0.0"

G0 = 9.80665            # m/s^2   standard gravity
R_AIR = 287.053         # J/(kg K) specific gas constant, dry air
GAMMA_AIR = 1.4         # ratio of specific heats
T0_ISA = 288.15         # K       ISA sea-level temperature
P0_ISA = 101325.0       # Pa      ISA sea-level pressure
RHO0_ISA = P0_ISA / (R_AIR * T0_ISA)   # 1.2250 kg/m^3
LAPSE = 0.0065          # K/m     troposphere lapse rate
H_TROPO = 11000.0       # m       tropopause altitude
T_TROPO = T0_ISA - LAPSE * H_TROPO     # 216.65 K
P_TROPO = 22632.0       # Pa      ISA pressure at 11 km
ISA_EXP = 5.2559        # troposphere pressure exponent (g0/(R*lapse))

# Sutherland's law for dynamic viscosity of air
SUTH_C1 = 1.458e-6      # kg/(m s K^0.5)
SUTH_S = 110.4          # K
