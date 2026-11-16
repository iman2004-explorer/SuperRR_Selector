# SupeRR Selector — model methodology (v0.2)

## Scope from the official brief
The challenge asks for two ordered top-10 lists (batters and bowlers) using supplied historical IPL and T20I data from 2022 onward. The submission must explain pressure definition, performance measurement, fair comparisons, evidence, and limitations.

## Competition scope
The pipeline retains competitions with `match_format == T20I` and competitions with `match_format == T20` whose competition name contains `IPL`. Other T20 competitions in the supplied files are excluded to follow the brief's stated IPL/T20I scope. Current coverage after this filter: 470 T20I matches and 367 T20/ IPL matches (the pipeline writes exact coverage to `outputs/competition_coverage.csv`).

## Delivery context and leakage control
All pressure indicators are computed from match state immediately before the current delivery. The current delivery's runs and wicket are not used to decide whether that delivery was pressure. Regulation innings 1 and 2 are retained; innings 3 and 4 (super overs) are excluded from player metrics.

Second-innings pressure is flagged when required run rate is at least 8.5, or at least 7.5 with six or fewer wickets remaining. Required rate uses the first-innings total plus one (or a revised target if provided), and balls remaining are based on the innings' scheduled overs, including revised overs.

First-innings batting pressure is flagged in the final five scheduled overs with at least five wickets lost, or from over 11 onward with at least seven wickets lost. First-innings bowling pressure is flagged in the final five scheduled overs, or from over 11 onward when four or fewer wickets have been lost (many wickets remain for the batting side). This intentionally separates batting and bowling pressure rather than assuming the same context pressures both teams equally.

## Batter metrics
Pressure and non-pressure baselines are calculated separately. Metrics include strike rate, strike-rate change, dot-ball percentage change, dismissal rate change, boundary percentage, pressure balls, pressure matches, and match-level strike-rate variability.

## Bowler metrics
Pressure and non-pressure baselines are calculated separately. Metrics include economy, economy improvement, wickets per six legal balls, dot-ball percentage change, boundary percentage reduction, pressure legal balls, pressure matches, and match-level economy variability. Byes and leg-byes are excluded from bowler-conceded runs; wides and no-balls remain charged to the bowler. Run-outs and retired/obstructing dismissals are excluded from bowler wickets.

## Eligibility
A batter must have at least 60 pressure balls and pressure involvement in at least five matches. A bowler must have at least 60 legal pressure balls and pressure involvement in at least five matches. These are initial guardrails to reduce tiny-sample rankings.

## Rating
Separate percentile-based performance components are built for batters and bowlers. A 10% consistency component combines pressure-match count and lower match-to-match variability. The raw 0–100 rating is shrunk toward 50 using square-root sample confidence:

`confidence = sqrt(pressure_sample / (pressure_sample + prior_sample))`

`PRI = 50 + (raw_score - 50) * confidence`

The current prior samples are 60 balls for batters and 36 legal balls for bowlers.

Every player appearing in the selected match data receives a role-specific PRI. Eligible players (60 pressure balls/legal balls and at least five pressure matches) define the percentile reference group and may enter the top 10. Ineligible profiles remain in the downloadable full-score tables with an eligibility reason; zero-pressure-sample profiles receive a neutral PRI of 50. The mixed target list alternates the top five eligible batters and bowlers by within-role rank and does not compare the two role scores directly.

## Important limitations and next validation steps
1. The pressure thresholds and weights are modelling choices, not official definitions. Test nearby thresholds and compare ranking stability.
2. Compare IPL-only and T20I-only rankings; player role and competition strength differ.
3. Validate the data dictionary for `runs`, extras and over numbering. Current implementation interprets `runs` as batter runs and adds extras fields to reconstruct team/bowler runs.
4. The current model uses percentile ranks within the eligible candidate pool. Consider competition- and phase-adjusted baselines as a robustness test.
5. Check the top 10 manually with match-level examples and bootstrap confidence intervals by match before final submission.
6. Player availability, injuries, age, role fit and auction price are not inferred from this historical ball-by-ball dataset. Research them separately if used in auction recommendations.
