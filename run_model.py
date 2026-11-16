import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
import pandas as pd
from load_data import load_all, audit_data
from pressure import build_delivery_context
from metrics import batter_metrics, bowler_metrics
from scoring import score_batters, score_bowlers, must_target_mix
from config import PROCESSED, OUTPUTS


def add_player_profiles(scores, data):
    mapping = data["mapping"].merge(
        data["competitions"][["comp_id", "match_format", "season"]],
        on="comp_id",
        how="left",
        validate="many_to_one",
    )
    ipl = mapping[mapping["comp_name"].str.contains("IPL", case=False, na=False)].copy()
    ipl["season_order"] = pd.to_numeric(ipl["season"], errors="coerce")
    latest_ipl = (ipl.sort_values(["season_order", "comp_id"])
                  .drop_duplicates("player_id", keep="last")
                  .set_index("player_id")["team_name"])
    t20i = mapping[mapping["match_format"].eq("T20I")]
    national = t20i.groupby("player_id")["team_name"].agg(
        lambda values: values.mode().iat[0] if not values.mode().empty else ""
    )
    scores["ipl_team_latest"] = scores["player_id"].map(latest_ipl)
    scores["national_team"] = scores["player_id"].map(national)
    return scores


def add_eligible_ranks(scores, sample_column):
    result = scores.copy()
    result["rank"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
    eligible_order = result[result["eligible"]].sort_values(
        ["PRI", sample_column], ascending=False
    ).index
    result.loc[eligible_order, "rank"] = range(1, len(eligible_order) + 1)
    return result.sort_values(
        ["eligible", "PRI", sample_column], ascending=[False, False, False]
    ).reset_index(drop=True)


def pressure_context_summary(ctx):
    deliveries = ctx[ctx["innings"].isin([1, 2])].copy()
    batter_ball = ~deliveries["extras_type"].fillna("").str.lower().eq("wide")
    batter_out = (deliveries["is_wicket"] &
                  (deliveries["dismissed_player_id"] == deliveries["striker_id"])).fillna(False)
    rows = []
    for role, flag in [("Batter", "batter_pressure"), ("Bowler", "bowler_pressure")]:
        for pressured, situation in [(True, "Pressure"), (False, "Normal")]:
            sample = deliveries[deliveries[flag].eq(pressured)]
            if role == "Batter":
                faced = ~sample["extras_type"].fillna("").str.lower().eq("wide")
                balls = int(faced.sum())
                runs = sample["runs"].sum()
                dots = int((faced & sample["runs"].eq(0)).sum())
                outs = int((faced & batter_out.loc[sample.index]).sum())
                rows.append({
                    "role": role, "situation": situation, "sample_balls": balls,
                    "primary_metric": "Strike rate", "primary_value": 100 * runs / balls if balls else 0,
                    "secondary_metric": "Dot-ball rate", "secondary_value": 100 * dots / balls if balls else 0,
                    "tertiary_metric": "Dismissal rate", "tertiary_value": 100 * outs / balls if balls else 0,
                })
            else:
                legal = sample["is_legal_ball"]
                balls = int(legal.sum())
                conceded = sample["bowler_conceded"].sum()
                wickets = int(sample["is_bowler_wicket"].sum())
                dots = int((legal & sample["bowler_conceded"].eq(0)).sum())
                rows.append({
                    "role": role, "situation": situation, "sample_balls": balls,
                    "primary_metric": "Economy", "primary_value": 6 * conceded / balls if balls else 0,
                    "secondary_metric": "Wickets per 6 balls", "secondary_value": 6 * wickets / balls if balls else 0,
                    "tertiary_metric": "Dot-ball rate", "tertiary_value": 100 * dots / balls if balls else 0,
                })
    return pd.DataFrame(rows)


def main():
    PROCESSED.mkdir(parents=True, exist_ok=True); OUTPUTS.mkdir(parents=True, exist_ok=True)
    data = load_all()
    audit_data(data).to_csv(OUTPUTS / "data_audit.csv", index=False)
    ctx = build_delivery_context(data["ball"], data["matches"], data["competitions"])
    coverage = (ctx.groupby(["match_format", "comp_name", "season"], dropna=False)
                  .agg(matches=("match_id", "nunique"), deliveries=("match_id", "size"))
                  .reset_index())
    coverage.to_csv(OUTPUTS / "competition_coverage.csv", index=False)
    print("\nDATA COVERAGE\n", coverage.groupby("match_format").agg(matches=("matches","sum"), deliveries=("deliveries","sum")).to_string())
    bm = batter_metrics(ctx); wm = bowler_metrics(ctx)
    bm.to_csv(PROCESSED / "batter_metrics.csv", index=False)
    wm.to_csv(PROCESSED / "bowler_metrics.csv", index=False)
    bat_all = add_player_profiles(score_batters(bm), data)
    bowl_all = add_player_profiles(score_bowlers(wm), data)
    bat_all = add_eligible_ranks(bat_all, "pressure_balls")
    bowl_all = add_eligible_ranks(bowl_all, "pressure_legal_balls")
    bat_all.to_csv(OUTPUTS / "all_batter_scores.csv", index=False)
    bowl_all.to_csv(OUTPUTS / "all_bowler_scores.csv", index=False)
    bat = bat_all[bat_all["eligible"]].head(10).copy()
    bowl = bowl_all[bowl_all["eligible"]].head(10).copy()
    bat.to_csv(OUTPUTS / "top_10_batters.csv", index=False)
    bowl.to_csv(OUTPUTS / "top_10_bowlers.csv", index=False)
    must_target_mix(bat, bowl).to_csv(OUTPUTS / "must_target_mix.csv", index=False)
    pressure_context_summary(ctx).to_csv(OUTPUTS / "pressure_context_summary.csv", index=False)

    summary = pd.DataFrame([
        ("raw_deliveries", len(data["ball"]), "deliveries"),
        ("selected_deliveries", len(ctx), "deliveries"),
        ("selected_matches", ctx["match_id"].nunique(), "matches"),
        ("selected_competitions", ctx["comp_id"].nunique(), "competitions"),
        ("batter_players_scored", len(bat_all), "players"),
        ("bowler_players_scored", len(bowl_all), "players"),
        ("eligible_batters", int(bat_all["eligible"].sum()), "players"),
        ("eligible_bowlers", int(bowl_all["eligible"].sum()), "players"),
        ("batter_pressure_deliveries", int(ctx["batter_pressure"].sum()), "deliveries"),
        ("bowler_pressure_deliveries", int(ctx["bowler_pressure"].sum()), "deliveries"),
    ], columns=["metric", "value", "unit"])
    summary.to_csv(OUTPUTS / "learning_summary.csv", index=False)

    print("\nTOP BATTERS\n", bat[["player_id","player_name","PRI","pressure_balls","pressure_matches","pressure_sr","baseline_sr"]].to_string(index=False))
    print("\nTOP BOWLERS\n", bowl[["player_id","player_name","PRI","pressure_legal_balls","pressure_matches","pressure_economy","baseline_economy"]].to_string(index=False))
    print(f"\nScored {len(bat_all)} batters ({int(bat_all['eligible'].sum())} eligible) and "
          f"{len(bowl_all)} bowlers ({int(bowl_all['eligible'].sum())} eligible).")
    print("\nSaved full scores, top-10 rankings, mixed targets, and learning summaries.")

if __name__ == "__main__": main()
