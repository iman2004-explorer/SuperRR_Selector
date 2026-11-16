import pandas as pd
from config import RAW

FILES = {
    "ball": "ball_by_ball.csv",
    "matches": "matches.csv",
    "competitions": "competitions.csv",
    "teams": "teams.csv",
    "playing_xi": "playing_eleven.csv",
    "mapping": "competition_team_player_mapping.csv",
}

def load_all():
    data = {key: pd.read_csv(RAW / filename) for key, filename in FILES.items()}
    b = data["ball"]
    # Normalize booleans because CSV parsers can infer mixed bool/object columns.
    for col in ["is_four", "is_six", "is_wicket"]:
        b[col] = b[col].fillna(False).astype(bool)
    for col in ["runs", "extras1_runs", "extras_2_runs", "innings", "overid"]:
        b[col] = pd.to_numeric(b[col], errors="coerce").fillna(0)
    data["matches"]["match_date"] = pd.to_datetime(data["matches"]["match_date"], errors="coerce")
    return data

def audit_data(data):
    rows = []
    for key, df in data.items():
        rows.append({
            "file": key,
            "rows": len(df),
            "columns": len(df.columns),
            "duplicate_rows": int(df.duplicated().sum()),
            "missing_cells": int(df.isna().sum().sum()),
        })
    return pd.DataFrame(rows)
