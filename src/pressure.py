import numpy as np
import pandas as pd
from config import (
    CHASE_RRR_HIGH, CHASE_RRR_MODERATE, CHASE_WICKETS_LOW,
    FIRST_INNINGS_DEATH_OVER, FIRST_INNINGS_WICKETS_LOST,
    FIRST_INNINGS_LATE_WICKETS_LOST,
)

NON_BOWLER_DISMISSALS = {
    "RunOut", "Retire Out", "Obstracting the field", "Obstructing the field"
}

def build_delivery_context(ball: pd.DataFrame, matches: pd.DataFrame, competitions: pd.DataFrame) -> pd.DataFrame:
    """Build pre-delivery match state. No outcome from the current delivery is used."""
    # The brief specifies IPL and T20I. Exclude other T20 tournaments in the supplied pack.
    allowed = competitions[(competitions["match_format"].eq("T20I")) |
                           ((competitions["match_format"].eq("T20")) &
                            competitions["comp_name"].str.contains("IPL", case=False, na=False))]
    valid_comp_ids = set(allowed["comp_id"])
    selected_matches = matches[matches["comp_id"].isin(valid_comp_ids)].copy()
    b = ball.copy()
    b = b.merge(selected_matches[["match_id", "comp_id", "match_date", "first_inn_revised_overs",
                                  "second_inn_revised_overs", "revised_target"]],
                on="match_id", how="inner", validate="many_to_one")
    b = b.merge(allowed[["comp_id", "comp_name", "match_format", "season"]],
                on="comp_id", how="left", validate="many_to_one")
    b = b.merge(
        b.groupby(["match_id", "innings"], as_index=False)
         .agg(innings_total=("runs", "sum"), extras_total=("extras1_runs", "sum"),
              extras2_total=("extras_2_runs", "sum")),
        on=["match_id", "innings"], how="left", validate="many_to_one"
    )
    b["delivery_total_runs"] = b["runs"] + b["extras1_runs"].fillna(0) + b["extras_2_runs"].fillna(0)
    # Wides and no-balls/oversteps do not consume a legal ball.
    b["is_legal_ball"] = ~b["extras_type"].fillna("").str.lower().isin(["wide", "overstep", "no ball", "noball"])
    b["is_bowler_wicket"] = b["is_wicket"] & ~b["dismissal_type"].isin(NON_BOWLER_DISMISSALS)
    b["is_bowler_wicket"] = b["is_bowler_wicket"].fillna(False)
    b["bowler_conceded"] = b["delivery_total_runs"] - np.where(
        b["extras_type"].fillna("").str.lower().isin(["byes", "legbyes"]),
        b["extras1_runs"].fillna(0) + b["extras_2_runs"].fillna(0), 0
    )
    b["bowler_conceded"] = b["bowler_conceded"].clip(lower=0)

    # Sort by match/innings/delivery order. innings_ball_num counts deliveries; legal balls are accumulated separately.
    sort_cols = ["match_id", "innings", "overid", "over_ball_num", "innings_ball_num"]
    b = b.sort_values(sort_cols).reset_index(drop=True)
    grp = b.groupby(["match_id", "innings"], sort=False)
    b["runs_before"] = grp["delivery_total_runs"].cumsum() - b["delivery_total_runs"]
    b["wickets_before"] = grp["is_wicket"].cumsum() - b["is_wicket"].astype(int)
    b["legal_balls_before"] = grp["is_legal_ball"].cumsum() - b["is_legal_ball"].astype(int)
    first_limit = pd.to_numeric(b["first_inn_revised_overs"], errors="coerce").fillna(20) * 6
    second_limit = pd.to_numeric(b["second_inn_revised_overs"], errors="coerce").fillna(20) * 6
    innings_limit = np.where(b["innings"] == 1, first_limit, second_limit)
    b["balls_remaining"] = (innings_limit - b["legal_balls_before"]).clip(lower=0)
    b["wickets_remaining"] = (10 - b["wickets_before"]).clip(lower=0)
    b["overs_completed"] = b["legal_balls_before"] / 6.0
    b["over_number"] = b["overid"]

    # First-innings totals are used as targets for the second innings.
    first = (b[b["innings"] == 1].groupby("match_id")["delivery_total_runs"].sum() + 1).rename("derived_target")
    b = b.merge(first, on="match_id", how="left")
    b["target"] = b["revised_target"].where(b["revised_target"].notna(), b["derived_target"])
    b["runs_needed"] = (b["target"] - b["runs_before"]).clip(lower=0)
    b["required_run_rate"] = np.where(
        (b["innings"] == 2) & (b["balls_remaining"] > 0),
        b["runs_needed"] * 6 / b["balls_remaining"], np.nan
    )

    # Pressure classification is based only on the state before this delivery.
    chase_high = (b["innings"] == 2) & (
        (b["required_run_rate"] >= CHASE_RRR_HIGH) |
        ((b["required_run_rate"] >= CHASE_RRR_MODERATE) & (b["wickets_remaining"] <= CHASE_WICKETS_LOW))
    )
    # Define death phase relative to each innings' scheduled length (handles shortened games).
    total_overs = innings_limit / 6.0
    death_phase = b["over_number"] >= np.maximum(1, np.ceil(total_overs - 4))
    # Batters face pressure when late-innings resources are depleted.
    first_innings_batter_pressure = (b["innings"] == 1) & (
        (death_phase & (b["wickets_before"] >= FIRST_INNINGS_WICKETS_LOST)) |
        ((b["over_number"] >= 11) & (b["wickets_before"] >= FIRST_INNINGS_LATE_WICKETS_LOST))
    )
    # Bowlers face pressure when defending in the death phase, especially with wickets in hand.
    first_innings_bowler_pressure = (b["innings"] == 1) & (
        death_phase | ((b["over_number"] >= 11) & (b["wickets_before"] <= 4))
    )
    b["batter_pressure"] = (chase_high | first_innings_batter_pressure) & b["innings"].isin([1, 2])
    b["bowler_pressure"] = (chase_high | first_innings_bowler_pressure) & b["innings"].isin([1, 2])
    b["is_pressure"] = b["batter_pressure"]  # backward-compatible alias for inspection
    b["pressure_type"] = np.select(
        [chase_high, first_innings_batter_pressure], ["chase_pressure", "first_innings_batter_pressure"], default="normal"
    )
    return b
