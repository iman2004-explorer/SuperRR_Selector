from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUTPUTS = ROOT / "outputs"

# Initial, explicit modelling choices. Test sensitivity before final submission.
MIN_BATTER_PRESSURE_BALLS = 60
MIN_BOWLER_PRESSURE_LEGAL_BALLS = 60
MIN_PRESSURE_MATCHES = 5
BATTER_PRIOR_BALLS = 60
BOWLER_PRIOR_LEGAL_BALLS = 36
TOP_N = 10

# Delivery-level pressure thresholds (T20 regulation innings only).
CHASE_RRR_HIGH = 8.5
CHASE_RRR_MODERATE = 7.5
CHASE_WICKETS_LOW = 6
FIRST_INNINGS_DEATH_OVER = 16
FIRST_INNINGS_WICKETS_LOST = 5
FIRST_INNINGS_LATE_WICKETS_LOST = 7
