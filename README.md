# SupeRR Selector

SupeRR Selector is a pressure-performance research project for T20 cricket. It computes separate batter and bowler Pressure Reliability Index (PRI) scores, ranks eligible profiles, and provides an interactive web showcase.

## Project contents

- `src/`: data loading, pressure-state labeling, metrics, and scoring.
- `run_model.py`: runs the full pipeline and writes scores, rankings, summaries, and audit outputs.
- `outputs/`: generated full-player scores, top tens, the balanced target mix, and dataset summaries.
- `web/`: responsive static showcase, including the bundled rankings and full-score explorer.
- `docs/MODEL_METHODOLOGY_v0.2.md`: pressure definitions, scoring details, and limitations.
- `data/raw/`: expected location for the source CSVs; the source data pack is not included in this repository.

## Run the model

Obtain the source data from an authorized source and place these files in `data/raw/`:

`ball_by_ball.csv`, `matches.csv`, `competitions.csv`, `teams.csv`, `competition_team_player_mapping.csv`, and `playing_eleven.csv`.

Then run:

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run_model.py
```

Raw input CSVs and the supplied problem-statement PDF are excluded from version control. The bundled website uses generated summary and ranking CSVs; it does not include raw ball-by-ball records.

## Current v0.2 scope

- Uses IPL-labelled T20 competitions and T20I competitions from the supplied data.
- Scores all batter and bowler profiles separately; eligibility is a ranking gate, not a scoring gate.
- Eligibility requires at least 60 batter pressure balls or 60 bowler legal pressure balls, plus pressure involvement in at least five matches.
- Produces a top ten for each role and a “Must Target” list alternating the top five eligible batters and bowlers by within-role rank. Scores are not compared across roles.
- Scores use role-specific percentiles and shrink small-sample results toward a neutral score of 50. Profiles with no pressure sample receive a neutral score and are marked ineligible.

This is a research decision-support tool, not a prediction or player recommendation. See the methodology document for definitions and limitations.
