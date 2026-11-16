import numpy as np
import pandas as pd
from config import (MIN_BATTER_PRESSURE_BALLS, MIN_BOWLER_PRESSURE_LEGAL_BALLS,
                    BATTER_PRIOR_BALLS, BOWLER_PRIOR_LEGAL_BALLS, MIN_PRESSURE_MATCHES, TOP_N)

def _pct_against(values, reference, higher_better=True):
    values = pd.to_numeric(values, errors="coerce")
    reference = pd.to_numeric(reference, errors="coerce").dropna().sort_values().to_numpy()
    result = np.full(len(values), 0.5, dtype=float)
    valid = values.notna().to_numpy()
    if len(reference) and valid.any():
        numeric_values = values[valid].to_numpy()
        left = np.searchsorted(reference, numeric_values, side="left")
        right = np.searchsorted(reference, numeric_values, side="right")
        result[valid] = np.clip((left + right + 1) / (2 * len(reference)), 0, 1)
        if not higher_better:
            result[valid] = 1 - result[valid]
    return pd.Series(result, index=values.index)

def pct(s, higher_better=True):
    s = pd.to_numeric(s, errors="coerce").replace([np.inf, -np.inf], np.nan)
    r = s.rank(pct=True, method="average")
    return r if higher_better else 1-r


def _eligibility(df, sample_column, minimum_sample):
    enough_sample = df[sample_column] >= minimum_sample
    enough_matches = df["pressure_matches"] >= MIN_PRESSURE_MATCHES
    eligible = enough_sample & enough_matches
    reason = np.select(
        [df[sample_column] <= 0, ~enough_sample, ~enough_matches],
        ["No pressure sample", "Pressure sample below threshold", "Pressure matches below threshold"],
        default="Eligible",
    )
    return eligible, reason


def score_batters(df):
    """Score the complete batter population; eligibility is used only for rankings."""
    x = df.copy()
    eligible, reason = _eligibility(x, "pressure_balls", MIN_BATTER_PRESSURE_BALLS)
    reference = x.loc[eligible]
    x["eligible"] = eligible
    x["eligibility_status"] = reason
    x["performance_component"] = (
        .40*_pct_against(x["pressure_sr"], reference["pressure_sr"]) +
        .20*_pct_against(x["sr_delta"], reference["sr_delta"]) +
        .10*_pct_against(x["dot_delta"], reference["dot_delta"]) +
        .20*_pct_against(x["dismissal_delta"], reference["dismissal_delta"]) +
        .10*_pct_against(x["pressure_boundary_pct"], reference["pressure_boundary_pct"])
    )
    x["consistency_component"] = (
        .5*_pct_against(x["pressure_matches"], reference["pressure_matches"]) +
        .5*_pct_against(x["pressure_match_sr_std"], reference["pressure_match_sr_std"], False)
    )
    x["sample_confidence"] = np.sqrt(
        x["pressure_balls"].clip(lower=0) /
        (x["pressure_balls"].clip(lower=0) + BATTER_PRIOR_BALLS)
    )
    x["raw_score"] = 100*(.90*x["performance_component"] + .10*x["consistency_component"])
    x["PRI"] = 50 + (x["raw_score"]-50)*x["sample_confidence"]
    return x


def score_bowlers(df):
    """Score the complete bowler population; eligibility is used only for rankings."""
    x = df.copy()
    eligible, reason = _eligibility(x, "pressure_legal_balls", MIN_BOWLER_PRESSURE_LEGAL_BALLS)
    reference = x.loc[eligible]
    x["eligible"] = eligible
    x["eligibility_status"] = reason
    x["performance_component"] = (
        .35*_pct_against(x["economy_improvement"], reference["economy_improvement"]) +
        .20*_pct_against(x["pressure_economy"], reference["pressure_economy"], False) +
        .20*_pct_against(x["pressure_wicket_rate"], reference["pressure_wicket_rate"]) +
        .15*_pct_against(x["dot_delta"], reference["dot_delta"]) +
        .10*_pct_against(x["boundary_reduction"], reference["boundary_reduction"])
    )
    x["consistency_component"] = (
        .5*_pct_against(x["pressure_matches"], reference["pressure_matches"]) +
        .5*_pct_against(x["pressure_match_economy_std"], reference["pressure_match_economy_std"], False)
    )
    sample = x["pressure_legal_balls"].clip(lower=0)
    x["sample_confidence"] = np.sqrt(sample / (sample + BOWLER_PRIOR_LEGAL_BALLS))
    x["raw_score"] = 100*(.90*x["performance_component"] + .10*x["consistency_component"])
    x["PRI"] = 50 + (x["raw_score"]-50)*x["sample_confidence"]
    return x


def _rank_eligible(scored, sample_column):
    ranked = scored[scored["eligible"]].sort_values(
        ["PRI", sample_column], ascending=False
    ).head(TOP_N).reset_index(drop=True)
    ranked.insert(0, "rank", np.arange(1, len(ranked) + 1))
    return ranked


def rank_batters(df):
    return _rank_eligible(score_batters(df), "pressure_balls")


def rank_bowlers(df):
    return _rank_eligible(score_bowlers(df), "pressure_legal_balls")


def must_target_mix(batters, bowlers, per_role=5):
    """Build a balanced shortlist by alternating each role's within-role top ranks."""
    selections = []
    roles = [
        ("Batter", batters, "pressure_balls", "pressure_sr", "baseline_sr", "strike rate"),
        ("Bowler", bowlers, "pressure_legal_balls", "pressure_economy", "baseline_economy", "economy"),
    ]
    for role, players, sample_column, pressure_metric, baseline_metric, label in roles:
        selections.append((role, players.head(per_role), sample_column, pressure_metric, baseline_metric, label))

    rows = []
    for index in range(per_role):
        for role, players, sample_column, pressure_metric, baseline_metric, label in selections:
            if index >= len(players):
                continue
            player = players.iloc[index]
            rows.append({
                "mix_rank": len(rows) + 1,
                "role": role,
                "role_rank": int(player["rank"]),
                "player_id": player["player_id"],
                "player_name": player["player_name"],
                "PRI": player["PRI"],
                "pressure_sample": player[sample_column],
                "sample_unit": "balls faced" if role == "Batter" else "legal balls bowled",
                "pressure_matches": player["pressure_matches"],
                "pressure_metric": label,
                "pressure_value": player[pressure_metric],
                "baseline_value": player[baseline_metric],
            })
    return pd.DataFrame(rows)
