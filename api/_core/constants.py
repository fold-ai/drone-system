"""Physical constants. Single source of truth - do not redefine these anywhere else."""

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
