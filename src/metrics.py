import numpy as np
import pandas as pd


def batter_metrics(ctx: pd.DataFrame) -> pd.DataFrame:
    b = ctx[ctx["innings"].isin([1, 2])].copy()
    # A batter faces a ball except on a wide. Runs are batter runs in this data pack.
    b["batter_ball"] = ~b["extras_type"].fillna("").str.lower().eq("wide")
    b["batter_runs"] = b["runs"]
    b["batter_out"] = b["is_wicket"] & (b["dismissed_player_id"] == b["striker_id"])
    b["batter_out"] = b["batter_out"].fillna(False)
    rows = []
    for pressure, label in [(True, "pressure"), (False, "baseline")]:
        x = b[b["batter_pressure"] == pressure]
        g = x.groupby(["striker_id", "striker_name"], dropna=True)
        a = g.agg(balls=("batter_ball", "sum"), runs=("batter_runs", "sum"), outs=("batter_out", "sum"),
                  fours=("is_four", "sum"), sixes=("is_six", "sum"), matches=("match_id", "nunique"),
                  dots=("batter_runs", lambda s: int((s == 0).sum()))).reset_index()
        dot_counts = x[(x["batter_ball"]) & (x["batter_runs"] == 0)].groupby(["striker_id", "striker_name"]).size().rename("dots_true")
        a = a.rename(columns={"striker_id": "player_id", "striker_name": "player_name"})
        a = a.drop(columns=["dots"]).merge(dot_counts.reset_index().rename(columns={"striker_id":"player_id", "striker_name":"player_name"}), on=["player_id","player_name"], how="left")
        a["dots_true"] = a["dots_true"].fillna(0)
        a[f"{label}_balls"] = a.pop("balls")
        a[f"{label}_runs"] = a.pop("runs")
        a[f"{label}_outs"] = a.pop("outs")
        a[f"{label}_fours"] = a.pop("fours")
        a[f"{label}_sixes"] = a.pop("sixes")
        a[f"{label}_matches"] = a.pop("matches")
        a[f"{label}_dots"] = a.pop("dots_true")
        a[f"{label}_sr"] = 100 * a[f"{label}_runs"] / a[f"{label}_balls"].replace(0, np.nan)
        a[f"{label}_avg"] = a[f"{label}_runs"] / a[f"{label}_outs"].replace(0, np.nan)
        a[f"{label}_dot_pct"] = 100 * a[f"{label}_dots"] / a[f"{label}_balls"].replace(0, np.nan)
        a[f"{label}_dismissal_rate"] = 100 * a[f"{label}_outs"] / a[f"{label}_balls"].replace(0, np.nan)
        rows.append(a)
    out = rows[0].merge(rows[1], on=["player_id", "player_name"], how="outer").fillna(0)
    for c in ["pressure_sr", "baseline_sr", "pressure_avg", "baseline_avg", "pressure_dot_pct", "baseline_dot_pct", "pressure_dismissal_rate", "baseline_dismissal_rate"]:
        if c not in out: out[c] = 0.0
    out["pressure_boundary_pct"] = 100*(out["pressure_fours"] + out["pressure_sixes"]) / out["pressure_balls"].replace(0, np.nan)
    out["sr_delta"] = out["pressure_sr"] - out["baseline_sr"]
    out["dot_delta"] = out["baseline_dot_pct"] - out["pressure_dot_pct"]
    out["dismissal_delta"] = out["baseline_dismissal_rate"] - out["pressure_dismissal_rate"]
    pm = b[b["batter_pressure"]].groupby(["striker_id", "striker_name", "match_id"]).agg(
        runs=("batter_runs", "sum"), balls=("batter_ball", "sum")).reset_index()
    pm["match_sr"] = 100 * pm["runs"] / pm["balls"].replace(0, np.nan)
    variability = pm.groupby(["striker_id", "striker_name"])["match_sr"].std().rename("pressure_match_sr_std").reset_index()
    variability = variability.rename(columns={"striker_id":"player_id", "striker_name":"player_name"})
    return out.merge(variability, on=["player_id", "player_name"], how="left")


def bowler_metrics(ctx: pd.DataFrame) -> pd.DataFrame:
    b = ctx[ctx["innings"].isin([1, 2])].copy()
    rows = []
    for pressure, label in [(True, "pressure"), (False, "baseline")]:
        x = b[b["bowler_pressure"] == pressure]
        g = x.groupby(["bowler_id", "bowler_name"], dropna=True)
        a = g.agg(legal_balls=("is_legal_ball", "sum"), conceded=("bowler_conceded", "sum"),
                  wickets=("is_bowler_wicket", "sum"), matches=("match_id", "nunique"),
                  dots=("bowler_conceded", lambda s: int((s == 0).sum())),
                  boundaries=("is_four", "sum")).reset_index()
        dot_counts = x[x["is_legal_ball"] & (x["bowler_conceded"] == 0)].groupby(["bowler_id", "bowler_name"]).size().rename("dots_true")
        boundary_counts = x[(x["is_four"] | x["is_six"])].groupby(["bowler_id", "bowler_name"]).size().rename("boundaries_true")
        a = a.rename(columns={"bowler_id":"player_id", "bowler_name":"player_name"})
        a = a.drop(columns=["dots", "boundaries"]).merge(dot_counts.reset_index().rename(columns={"bowler_id":"player_id", "bowler_name":"player_name"}), on=["player_id","player_name"], how="left")
        a = a.merge(boundary_counts.reset_index().rename(columns={"bowler_id":"player_id", "bowler_name":"player_name"}), on=["player_id","player_name"], how="left")
        a[["dots_true", "boundaries_true"]] = a[["dots_true", "boundaries_true"]].fillna(0)
        for old, new in [("legal_balls", "legal_balls"), ("conceded", "conceded"), ("wickets", "wickets"), ("matches", "matches"), ("dots_true", "dots"), ("boundaries_true", "boundaries")]:
            a[f"{label}_{new}"] = a.pop(old)
        a[f"{label}_economy"] = 6 * a[f"{label}_conceded"] / a[f"{label}_legal_balls"].replace(0, np.nan)
        a[f"{label}_wicket_rate"] = 6 * a[f"{label}_wickets"] / a[f"{label}_legal_balls"].replace(0, np.nan)
        a[f"{label}_dot_pct"] = 100 * a[f"{label}_dots"] / a[f"{label}_legal_balls"].replace(0, np.nan)
        a[f"{label}_boundary_pct"] = 100 * a[f"{label}_boundaries"] / a[f"{label}_legal_balls"].replace(0, np.nan)
        rows.append(a)
    out = rows[0].merge(rows[1], on=["player_id", "player_name"], how="outer").fillna(0)
    for c in ["pressure_economy", "baseline_economy", "pressure_wicket_rate", "baseline_wicket_rate", "pressure_dot_pct", "baseline_dot_pct", "pressure_boundary_pct", "baseline_boundary_pct"]:
        if c not in out: out[c] = 0.0
    out["economy_improvement"] = out["baseline_economy"] - out["pressure_economy"]
    out["wicket_rate_delta"] = out["pressure_wicket_rate"] - out["baseline_wicket_rate"]
    out["dot_delta"] = out["pressure_dot_pct"] - out["baseline_dot_pct"]
    out["boundary_reduction"] = out["baseline_boundary_pct"] - out["pressure_boundary_pct"]
    pm = b[b["bowler_pressure"]].groupby(["bowler_id", "bowler_name", "match_id"]).agg(
        conceded=("bowler_conceded", "sum"), legal_balls=("is_legal_ball", "sum")).reset_index()
    pm["match_economy"] = 6 * pm["conceded"] / pm["legal_balls"].replace(0, np.nan)
    variability = pm.groupby(["bowler_id", "bowler_name"])["match_economy"].std().rename("pressure_match_economy_std").reset_index()
    variability = variability.rename(columns={"bowler_id":"player_id", "bowler_name":"player_name"})
    return out.merge(variability, on=["player_id", "player_name"], how="left")
