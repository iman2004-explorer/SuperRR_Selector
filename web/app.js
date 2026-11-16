const MODELS = {
  v02: {
    name: "v0.2 · Full player pool",
    batters: "data/v02/top_10_batters.csv",
    bowlers: "data/v02/top_10_bowlers.csv",
    mix: "data/v02/must_target_mix.csv",
    summary: "data/v02/learning_summary.csv",
    pressure: "data/v02/pressure_context_summary.csv"
  },
  s2: {
    name: "S2 · Research model",
    batters: "data/s2/batter_rankings_top10.csv",
    bowlers: "data/s2/bowler_rankings_top10.csv",
    mix: "data/s2/must_target_mix.csv",
    summary: "data/s2/audit_log.csv",
    pressure: "data/v02/pressure_context_summary.csv"
  }
};

const state = {
  model: "v02",
  allRole: "bat",
  learningRole: "bat",
  eligibility: "all",
  query: "",
  page: 0,
  pageSize: 25,
  allBatters: [],
  allBowlers: [],
  s2ProfilesPromise: null
};
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.filter((item) => item.some((cell) => cell !== "")).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return parseCsv(await response.text());
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, digits = 0) {
  return num(value).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function playerName(player) {
  return player.player_name || player.name || "Unknown";
}

function teamOf(player) {
  return player.ipl_team_latest || player.national_team || player.team || "—";
}

function playerButton(player, role, model = state.model) {
  return `<button class="player-link" type="button" data-player-open data-role="${role}" data-player-id="${escapeHtml(player.player_id)}" data-model="${model}" aria-haspopup="dialog">${escapeHtml(playerName(player))}</button>`;
}

function scoreOf(player) {
  return num(player.PRI ?? player.PRI_scaled);
}

function sampleOf(player, role) {
  if (player.pressure_sample !== undefined) return num(player.pressure_sample);
  if (player.p_n !== undefined) return num(player.p_n);
  return num(role === "bat" ? player.pressure_balls : player.pressure_legal_balls);
}

function matchesOf(player) {
  return num(player.p_m ?? player.pressure_matches);
}

function topSignal(player, role) {
  if (player.P_net100 !== undefined) return `+${fmt(player.P_net100, 1)} net/100`;
  if (role === "bat") return `${fmt(player.pressure_sr, 1)} SR · ${fmt(player.baseline_sr, 1)} base`;
  return `${fmt(player.pressure_economy, 2)} econ · ${fmt(player.baseline_economy, 2)} base`;
}

function renderTopRows(players, role, elementId) {
  const body = document.getElementById(elementId);
  if (!players.length) {
    body.innerHTML = '<tr><td class="loading-cell" colspan="6">No ranking data available.</td></tr>';
    return;
  }
  body.innerHTML = players.slice(0, 10).map((player, index) => `
    <tr>
      <td class="rank-cell">${String(num(player.rank) || index + 1).padStart(2, "0")}</td>
      <td class="player-cell">${playerButton(player, role)}${player.auction_note ? '<span title="' + escapeHtml(player.auction_note) + '"> †</span>' : ""}</td>
      <td class="team-cell" title="${escapeHtml(teamOf(player))}">${escapeHtml(teamOf(player))}</td>
      <td class="score-cell">${fmt(scoreOf(player), 2)}</td>
      <td class="sample-cell">${numberFormat.format(sampleOf(player, role))} balls · ${numberFormat.format(matchesOf(player))} matches</td>
      <td class="signal-cell">${escapeHtml(topSignal(player, role))}</td>
    </tr>`).join("");
}

function renderMustTargets(players) {
  const body = document.getElementById("must-target-rows");
  body.innerHTML = players.map((player) => {
    const role = player.role === "Batter" ? "bat" : "bowl";
    const signal = player.pressure_metric === "net value/100"
      ? `${fmt(player.pressure_value, 1)} net/100`
      : `${fmt(player.pressure_value, role === "bat" ? 1 : 2)} ${role === "bat" ? "SR" : "econ"} · ${fmt(player.baseline_value, role === "bat" ? 1 : 2)} base`;
    return `<tr>
      <td class="rank-cell">${String(num(player.mix_rank)).padStart(2, "0")}</td>
      <td><span class="role-pill ${role}">${escapeHtml(player.role)}</span></td>
      <td class="player-cell">${playerButton(player, role)}</td>
      <td class="team-cell">${escapeHtml(teamOf(player))}</td>
      <td class="sample-cell">${String(num(player.role_rank)).padStart(2, "0")}</td>
      <td class="score-cell">${fmt(scoreOf(player), 2)}</td>
      <td class="sample-cell">${numberFormat.format(num(player.pressure_sample))} ${escapeHtml(player.sample_unit || "balls")} · ${numberFormat.format(num(player.pressure_matches))} matches</td>
      <td class="signal-cell">${escapeHtml(signal)}</td>
    </tr>`;
  }).join("");
}

function renderStats(rows) {
  const values = Object.fromEntries(rows.map((row) => [row.metric, row.value]));
  document.getElementById("stat-matches").textContent = numberFormat.format(num(values.selected_matches));
  document.getElementById("stat-deliveries").textContent = numberFormat.format(num(values.selected_deliveries));
  document.getElementById("stat-batters").textContent = numberFormat.format(num(values.batter_players_scored));
  document.getElementById("stat-bowlers").textContent = numberFormat.format(num(values.bowler_players_scored));
}

function isEligible(player) {
  return String(player.eligible).toLowerCase() === "true";
}

function playerSignal(player, role) {
  if (role === "bat") {
    return `${fmt(player.pressure_sr, 1)} SR · ${num(player.sr_delta) >= 0 ? "+" : ""}${fmt(player.sr_delta, 1)} vs base`;
  }
  return `${fmt(player.pressure_economy, 2)} econ · ${num(player.economy_improvement) >= 0 ? "+" : ""}${fmt(player.economy_improvement, 2)} saved`;
}

function renderAllPlayers() {
  const players = state.allRole === "bat" ? state.allBatters : state.allBowlers;
  const sampleColumn = state.allRole === "bat" ? "pressure_balls" : "pressure_legal_balls";
  const selected = players.filter((player) => {
    const eligible = isEligible(player);
    if (state.eligibility === "eligible" && !eligible) return false;
    if (state.eligibility === "not-eligible" && eligible) return false;
    const query = state.query.toLowerCase();
    return !query || `${playerName(player)} ${teamOf(player)} ${player.national_team || ""}`.toLowerCase().includes(query);
  });
  const pageCount = Math.max(1, Math.ceil(selected.length / state.pageSize));
  state.page = Math.min(state.page, pageCount - 1);
  const pageRows = selected.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
  document.getElementById("all-player-rows").innerHTML = pageRows.length ? pageRows.map((player) => {
    const eligible = isEligible(player);
    const rank = player.rank ? String(num(player.rank)).padStart(2, "0") : "—";
    const statusClass = eligible ? "eligible" : String(player.eligibility_status).includes("No pressure") ? "no-sample" : "";
    return `<tr>
      <td class="rank-cell">${rank}</td>
      <td class="player-cell">${playerButton(player, state.allRole, "v02")}</td>
      <td class="team-cell">${escapeHtml(teamOf(player))}</td>
      <td class="score-cell">${fmt(player.PRI, 2)}</td>
      <td class="sample-cell">${numberFormat.format(num(player[sampleColumn]))} balls</td>
      <td class="sample-cell">${numberFormat.format(matchesOf(player))}</td>
      <td class="signal-cell">${escapeHtml(playerSignal(player, state.allRole))}</td>
      <td><span class="eligibility-pill ${statusClass}">${escapeHtml(player.eligibility_status)}</span></td>
    </tr>`;
  }).join("") : '<tr><td class="loading-cell" colspan="8">No players match these filters.</td></tr>';
  const first = selected.length ? state.page * state.pageSize + 1 : 0;
  const last = Math.min((state.page + 1) * state.pageSize, selected.length);
  document.getElementById("player-page-info").textContent = `${first}–${last} of ${numberFormat.format(selected.length)} scored profiles`;
  document.getElementById("player-prev").disabled = state.page === 0;
  document.getElementById("player-next").disabled = state.page >= pageCount - 1;
  const download = document.getElementById("all-player-download");
  download.href = state.allRole === "bat" ? "data/v02/all_batter_scores.csv" : "data/v02/all_bowler_scores.csv";
  download.download = state.allRole === "bat" ? "all_batter_scores.csv" : "all_bowler_scores.csv";
}

function renderPressureChart(rows) {
  const bySituation = Object.fromEntries(rows.map((row) => [row.situation, row]));
  const pressure = bySituation.Pressure;
  const normal = bySituation.Normal;
  const container = document.getElementById("signal-chart");
  if (!pressure || !normal) {
    container.innerHTML = '<p class="muted">Pressure comparison is unavailable.</p>';
    return;
  }
  const metrics = [
    ["primary_metric", "primary_value"],
    ["secondary_metric", "secondary_value"],
    ["tertiary_metric", "tertiary_value"]
  ];
  const formatValue = (label, value) => label.toLowerCase().includes("rate") && !label.toLowerCase().includes("strike")
    ? `${fmt(value, 1)}%`
    : label === "Strike rate" || label === "Economy" || label === "Wickets per 6 balls"
      ? fmt(value, 2)
      : `${fmt(value, 1)}%`;
  container.innerHTML = metrics.map(([labelKey, valueKey]) => {
    const label = pressure[labelKey];
    const pressureValue = num(pressure[valueKey]);
    const normalValue = num(normal[valueKey]);
    const max = Math.max(pressureValue, normalValue, .0001);
    const width = (value) => `${Math.max(3, value / max * 100)}%`;
    return `<div class="signal-row">
      <span class="signal-label">${escapeHtml(label)}</span>
      <div class="bar-stack">
        <div class="bar-track"><div class="bar-fill" style="width:${width(pressureValue)}"></div></div>
        <div class="bar-track"><div class="bar-fill normal" style="width:${width(normalValue)}"></div></div>
      </div>
      <span class="signal-value">${formatValue(label, pressureValue)} / ${formatValue(label, normalValue)}</span>
    </div>`;
  }).join("");
  container.insertAdjacentHTML("beforeend", `<p class="chart-unit">${numberFormat.format(num(pressure.sample_balls))} pressure balls · ${numberFormat.format(num(normal.sample_balls))} normal balls</p>`);
}

function profileNumber(value, digits = 1, suffix = "") {
  if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value))) return "—";
  return `${fmt(value, digits)}${suffix}`;
}

function profileDifference(left, right) {
  if ([left, right].some((value) => value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value)))) return null;
  return Number(left) - Number(right);
}

function profileDelta(value, digits = 1, suffix = "") {
  if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value))) return "No baseline comparison";
  const parsed = Number(value);
  return `${parsed > 0 ? "+" : ""}${fmt(parsed, digits)}${suffix.startsWith(" ") || !suffix ? "" : " "}${suffix} vs baseline`;
}

function profileMetric(label, pressure, baseline, unit, detail, digits = 1) {
  const baselineAvailable = baseline !== null && baseline !== undefined && String(baseline).trim() !== "" && Number.isFinite(Number(baseline));
  return `<article class="profile-metric">
    <span>${escapeHtml(label)}</span>
    <strong>${profileNumber(pressure, digits)}${unit ? ` ${escapeHtml(unit)}` : ""}</strong>
    <small>${baselineAvailable ? `Baseline: ${profileNumber(baseline, digits)}${unit ? ` ${escapeHtml(unit)}` : ""}` : "Pressure-only metric"}</small>
    <p>${escapeHtml(detail)}</p>
  </article>`;
}

function profileKpi(label, value, note) {
  return `<article class="profile-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function renderProfileCharts(player, role) {
  const metrics = role === "bat"
    ? [
      { label: "Strike rate", pressure: player.pressure_sr, baseline: player.baseline_sr, unit: "SR", digits: 1 },
      { label: "Dot-ball rate", pressure: player.pressure_dot_pct, baseline: player.baseline_dot_pct, unit: "%", digits: 1 },
      { label: "Dismissal rate", pressure: player.pressure_dismissal_rate, baseline: player.baseline_dismissal_rate, unit: "outs / 100 balls", digits: 2 }
    ]
    : [
      { label: "Economy", pressure: player.pressure_economy, baseline: player.baseline_economy, unit: "runs / 6 balls", digits: 2 },
      { label: "Wicket rate", pressure: player.pressure_wicket_rate, baseline: player.baseline_wicket_rate, unit: "wickets / 6 balls", digits: 2 },
      { label: "Dot-ball rate", pressure: player.pressure_dot_pct, baseline: player.baseline_dot_pct, unit: "%", digits: 1 },
      { label: "Boundary rate", pressure: player.pressure_boundary_pct, baseline: player.baseline_boundary_pct, unit: "%", digits: 1 }
    ];
  const cards = metrics.map((metric) => {
    const valuesAvailable = [metric.pressure, metric.baseline].every((value) =>
      value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value))
    );
    if (!valuesAvailable) {
      return `<article class="profile-chart-card"><h4>${escapeHtml(metric.label)}</h4><p>Pressure comparison unavailable for this profile.</p></article>`;
    }
    const pressure = Number(metric.pressure);
    const baseline = Number(metric.baseline);
    const max = Math.max(Math.abs(pressure), Math.abs(baseline), .0001);
    const barWidth = (value) => `${Math.min(Math.abs(value) / max * 100, 100)}%`;
    const format = (value) => `${profileNumber(value, metric.digits)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}`;
    return `<article class="profile-chart-card">
      <h4>${escapeHtml(metric.label)}</h4>
      <div class="profile-chart-line"><span>Pressure</span><div class="profile-chart-track" aria-hidden="true"><i class="profile-chart-pressure" style="width:${barWidth(pressure)}"></i></div><b>${format(pressure)}</b></div>
      <div class="profile-chart-line"><span>Baseline</span><div class="profile-chart-track" aria-hidden="true"><i class="profile-chart-baseline" style="width:${barWidth(baseline)}"></i></div><b>${format(baseline)}</b></div>
    </article>`;
  }).join("");
  return `<div class="profile-chart-block">
    <div class="profile-chart-heading"><h4>Visual comparison</h4><span>Each metric has its own scale</span></div>
    <div class="profile-chart-grid">${cards}</div>
  </div>`;
}

function eligibilityCriterion(label, value, threshold, unit) {
  const count = num(value);
  const met = count >= threshold;
  const width = Math.min(count / threshold * 100, 100);
  return `<div class="eligibility-criterion">
    <div><span>${escapeHtml(label)}</span><b class="${met ? "criterion-met" : "criterion-missed"}">${numberFormat.format(count)} / ${numberFormat.format(threshold)} ${escapeHtml(unit)} · ${met ? "MET" : "NOT MET"}</b></div>
    <div class="eligibility-track" role="img" aria-label="${escapeHtml(`${numberFormat.format(count)} of ${numberFormat.format(threshold)} ${unit}`)}"><span style="width:${width}%"></span></div>
  </div>`;
}

function renderV02Eligibility(player, role) {
  const sampleField = role === "bat" ? "pressure_balls" : "pressure_legal_balls";
  const eligible = isEligible(player);
  const status = player.eligibility_status || (eligible ? "Eligible" : "Eligibility requirements not met");
  const rank = player.rank
    ? `Role rank ${numberFormat.format(num(player.rank))}`
    : eligible ? "No role rank available" : "Not ranked";
  return `<section class="profile-section">
    <div class="profile-section-heading"><div><p class="eyebrow">VERSION 0.2 · FULL PLAYER POOL</p><h3>Eligibility analysis</h3></div><span class="eligibility-pill ${eligible ? "eligible" : "no-sample"}">${eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</span></div>
    <div class="profile-status ${eligible ? "status-eligible" : "status-ineligible"}"><strong>${escapeHtml(status)}</strong><span>${escapeHtml(rank)} · eligible status is separate from the score</span></div>
    <div class="eligibility-grid">
      ${eligibilityCriterion("Pressure sample", player[sampleField], 60, role === "bat" ? "balls" : "legal balls")}
      ${eligibilityCriterion("Pressure matches", player.pressure_matches, 5, "matches")}
    </div>
    <p class="profile-footnote">Both minimums must be met to qualify for the v0.2 eligible ranking pool. Ineligible profiles are still scored, but are not auction targets from this ranking.</p>
  </section>`;
}

function renderV02Metrics(player, role) {
  const metrics = role === "bat"
    ? [
      profileMetric("Strike rate", player.pressure_sr, player.baseline_sr, "runs / 100 balls", profileDelta(player.sr_delta, 1, "SR points"), 1),
      profileMetric("Dot-ball rate", player.pressure_dot_pct, player.baseline_dot_pct, "%", profileDelta(profileDifference(player.baseline_dot_pct, player.pressure_dot_pct), 1, " pp dots"), 1),
      profileMetric("Dismissal rate", player.pressure_dismissal_rate, player.baseline_dismissal_rate, "outs / 100 balls", profileDelta(profileDifference(player.baseline_dismissal_rate, player.pressure_dismissal_rate), 1, " outs / 100 balls"), 2),
      profileMetric("Boundary rate", player.pressure_boundary_pct, null, "% of pressure balls", "Pressure boundaries per 100 balls", 1),
      profileMetric("Match-to-match SR spread", player.pressure_match_sr_std, null, "SR points", "Lower spread means less variation across pressure matches", 1)
    ]
    : [
      profileMetric("Economy", player.pressure_economy, player.baseline_economy, "runs / 6 balls", profileDelta(player.economy_improvement, 2, "runs / 6 balls saved"), 2),
      profileMetric("Wicket rate", player.pressure_wicket_rate, player.baseline_wicket_rate, "wickets / 6 balls", profileDelta(profileDifference(player.pressure_wicket_rate, player.baseline_wicket_rate), 2, " wickets / 6 balls"), 2),
      profileMetric("Dot-ball rate", player.pressure_dot_pct, player.baseline_dot_pct, "%", profileDelta(player.dot_delta, 1, " pp"), 1),
      profileMetric("Boundary rate", player.pressure_boundary_pct, player.baseline_boundary_pct, "%", profileDelta(player.boundary_reduction, 1, " pp reduced"), 1),
      profileMetric("Match-to-match economy spread", player.pressure_match_economy_std, null, "runs / 6 balls", "Lower spread means less variation across pressure matches", 2)
    ];
  const pressureCount = role === "bat" ? player.pressure_balls : player.pressure_legal_balls;
  const baselineCount = role === "bat" ? player.baseline_balls : player.baseline_legal_balls;
  const pressureOutput = role === "bat" ? `${profileNumber(player.pressure_runs, 0)} runs · ${profileNumber(player.pressure_outs, 0)} outs` : `${profileNumber(player.pressure_wickets, 0)} wickets · ${profileNumber(player.pressure_conceded, 0)} runs conceded`;
  const baselineOutput = role === "bat" ? `${profileNumber(player.baseline_runs, 0)} runs · ${profileNumber(player.baseline_outs, 0)} outs` : `${profileNumber(player.baseline_wickets, 0)} wickets · ${profileNumber(player.baseline_conceded, 0)} runs conceded`;
  return `<section class="profile-section">
    <div class="profile-section-heading"><div><p class="eyebrow">PRESSURE VS BASELINE</p><h3>Performance evidence</h3></div></div>
    <div class="profile-sample-grid">
      ${profileKpi("Pressure sample", `${profileNumber(pressureCount, 0)} ${role === "bat" ? "balls" : "legal balls"}`, `${profileNumber(player.pressure_matches, 0)} pressure matches`)}
      ${profileKpi("Pressure output", pressureOutput, `Baseline sample: ${profileNumber(baselineCount, 0)} balls`)}
      ${profileKpi("Baseline output", baselineOutput, `${profileNumber(player.baseline_matches, 0)} baseline matches`)}
    </div>
    ${renderProfileCharts(player, role)}
    <div class="profile-metrics">${metrics.join("")}</div>
  </section>`;
}

function renderV02ScoreBreakdown(player) {
  const componentPercent = (value) => value === null || value === undefined || String(value).trim() === ""
    ? "—"
    : profileNumber(Number(value) * 100, 1, "%");
  const metrics = [
    profileKpi("Performance component", componentPercent(player.performance_component), "Role-relative component"),
    profileKpi("Consistency component", componentPercent(player.consistency_component), "Role-relative component"),
    profileKpi("Sample confidence", componentPercent(player.sample_confidence), "Evidence strength"),
    profileKpi("Raw score", profileNumber(player.raw_score, 2), "Before confidence adjustment")
  ];
  return `<section class="profile-section">
    <div class="profile-section-heading"><div><p class="eyebrow">SCORE TRANSPARENCY</p><h3>How the score is built</h3></div></div>
    <div class="profile-sample-grid">${metrics.join("")}</div>
    <p class="profile-footnote">v0.2 combines performance and consistency components, then uses sample confidence to pull low-evidence raw scores toward neutral (PRI 50). PRI is comparable only within the same role and model.</p>
  </section>`;
}

function renderS2Snapshot(player, role) {
  const sampleMin = role === "bat" ? 100 : 90;
  const sample = num(player.p_n);
  const matches = num(player.p_m);
  const sampleMet = sample >= sampleMin;
  const matchesMet = matches >= 12;
  const stable = num(player.scen_stable) >= 1;
  const sampleEligible = sampleMet && matchesMet;
  const roleLabel = role === "bat" ? "batter" : "bowler";
  return `<section class="profile-section">
    <div class="profile-section-heading"><div><p class="eyebrow">S2 · RESEARCH MODEL</p><h3>Ranking snapshot</h3></div><div class="profile-heading-badges"><span class="eligibility-pill ${sampleEligible ? "eligible" : "no-sample"}">SAMPLE GATES ${sampleEligible ? "MET" : "NOT MET"}</span><span class="badge ${String(player.robustness).toLowerCase() === "strong" ? "strong" : ""}">${escapeHtml(player.robustness || "RANKED")}</span></div></div>
    <p class="profile-footnote">This player appears in the supplied S2 ${roleLabel} top-25 export. The bundled S2 data is a ranked-player snapshot, not a full-pool score file.</p>
    <div class="eligibility-grid">
      ${eligibilityCriterion("Pressure sample", sample, sampleMin, role === "bat" ? "balls" : "legal balls")}
      ${eligibilityCriterion("Pressure matches", matches, 12, "matches")}
    </div>
    <div class="profile-sample-grid">
      ${profileKpi("S2 PRI", profileNumber(player.PRI_scaled, 2), `S2 role rank #${numberFormat.format(num(player.rank))}`)}
      ${profileKpi("Top-10 probability", profileNumber(num(player.p_top10) * 100, 0, "%"), "Across S2 scenarios")}
      ${profileKpi("Median scenario rank", profileNumber(player.median_rank, 1), stable ? "Stable across scenarios" : "Scenario-sensitive")}
      ${profileKpi("Net value / 100", profileNumber(player.P_net100, 2), "Model-defined pressure contribution")}
      ${profileKpi("Run value / 100", profileNumber(player.P_run100, 2), "Model-defined batting contribution")}
      ${profileKpi("Wicket value / 100", profileNumber(player.P_wk100, 2), "Model-defined bowling contribution")}
    </div>
    ${player.auction_note ? `<p class="profile-footnote profile-auction-note">${escapeHtml(player.auction_note)}</p>` : ""}
  </section>`;
}

async function loadS2Profiles() {
  if (!state.s2ProfilesPromise) {
    state.s2ProfilesPromise = Promise.all([
      loadCsv("data/s2/bat_rankings_top25.csv"),
      loadCsv("data/s2/bowl_rankings_top25.csv")
    ]).then(([batters, bowlers]) => ({ batters, bowlers })).catch((error) => {
      state.s2ProfilesPromise = null;
      throw error;
    });
  }
  return state.s2ProfilesPromise;
}

async function openPlayerDashboard(role, playerId, model) {
  const allPlayers = role === "bat" ? state.allBatters : state.allBowlers;
  const profile = allPlayers.find((player) => String(player.player_id) === String(playerId));
  let s2Profile = null;
  if (model === "s2") {
    const profiles = await loadS2Profiles();
    const rows = role === "bat" ? profiles.batters : profiles.bowlers;
    s2Profile = rows.find((player) => String(player.player_id) === String(playerId));
    if (!s2Profile) throw new Error("The S2 detail row is not available in the bundled top-25 data.");
  }
  if (!profile && !s2Profile) throw new Error("No score profile was found for this player.");

  const source = profile || s2Profile;
  const dialog = document.getElementById("player-dialog");
  const roleElement = document.getElementById("player-dialog-role");
  roleElement.className = `role-pill ${role}`;
  roleElement.textContent = role === "bat" ? "BATTER" : "BOWLER";
  document.getElementById("player-dialog-model").textContent = model === "s2"
    ? "S2 ranking + v0.2 eligibility"
    : "v0.2 full-pool profile";
  document.getElementById("player-dialog-name").textContent = playerName(source);
  document.getElementById("player-dialog-team").textContent = teamOf(source);

  const score = model === "s2" && s2Profile ? scoreOf(s2Profile) : profile ? scoreOf(profile) : scoreOf(source);
  const rank = model === "s2" && s2Profile ? s2Profile.rank : profile ? profile.rank : "";
  const scoreLabel = model === "s2" ? "S2 PRI" : "v0.2 PRI";
  const rankingLabel = rank ? `Rank #${numberFormat.format(num(rank))}` : "No rank available";
  let content = `<div class="profile-hero-stats">
    ${profileKpi(scoreLabel, profileNumber(score, 2), rankingLabel)}
    ${profileKpi("Role", role === "bat" ? "Batter" : "Bowler", "Scores are role-relative")}
    ${profileKpi("Team", teamOf(source), "Latest IPL team or national team")}
  </div>`;
  if (profile) {
    content += renderV02Eligibility(profile, role);
    content += renderV02Metrics(profile, role);
    content += renderV02ScoreBreakdown(profile);
  } else {
    content += `<section class="profile-section"><p class="profile-footnote">No matching v0.2 full-pool record was found. The dashboard below is limited to the S2 ranked-player export.</p></section>`;
  }
  if (s2Profile) content += renderS2Snapshot(s2Profile, role);
  document.getElementById("player-dashboard-content").innerHTML = content;
  dialog.showModal();
}

function showError(error) {
  const status = document.getElementById("status-message");
  status.textContent = `${error.message} Serve the web/ folder over HTTP (for example: python -m http.server 8000).`;
  status.classList.add("visible");
  for (const id of ["top-batter-rows", "top-bowler-rows", "must-target-rows", "all-player-rows"]) {
    const body = document.getElementById(id);
    if (body) body.innerHTML = `<tr><td class="loading-cell" colspan="8">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function updateView() {
  const model = MODELS[state.model];
  try {
    const [batters, bowlers, targets, summary, pressure] = await Promise.all([
      loadCsv(model.batters),
      loadCsv(model.bowlers),
      loadCsv(model.mix),
      loadCsv("data/v02/learning_summary.csv"),
      loadCsv("data/v02/pressure_context_summary.csv")
    ]);
    const [allBatters, allBowlers] = await Promise.all([
      loadCsv("data/v02/all_batter_scores.csv"),
      loadCsv("data/v02/all_bowler_scores.csv")
    ]);
    state.allBatters = allBatters;
    state.allBowlers = allBowlers;
    renderTopRows(batters, "bat", "top-batter-rows");
    renderTopRows(bowlers, "bowl", "top-bowler-rows");
    renderMustTargets(targets);
    renderStats(summary);
    renderPressureChart(pressure.filter((row) => row.role === (state.learningRole === "bat" ? "Batter" : "Bowler")));
    renderAllPlayers();
    document.getElementById("download-batters").href = model.batters;
    document.getElementById("download-batters").download = `${state.model}_top_10_batters.csv`;
    document.getElementById("download-bowlers").href = model.bowlers;
    document.getElementById("download-bowlers").download = `${state.model}_top_10_bowlers.csv`;
  } catch (error) {
    showError(error);
  }
}

document.querySelectorAll(".model-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.model = button.dataset.model;
    document.querySelectorAll(".model-button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    updateView();
  });
});

document.querySelectorAll("[data-learning-role]").forEach((button) => {
  button.addEventListener("click", () => {
    state.learningRole = button.dataset.learningRole;
    document.querySelectorAll("[data-learning-role]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    loadCsv("data/v02/pressure_context_summary.csv")
      .then((rows) => renderPressureChart(rows.filter((row) => row.role === (state.learningRole === "bat" ? "Batter" : "Bowler"))))
      .catch(showError);
  });
});

document.getElementById("player-role").addEventListener("change", (event) => {
  state.allRole = event.target.value;
  state.page = 0;
  renderAllPlayers();
});

document.getElementById("eligibility-filter").addEventListener("change", (event) => {
  state.eligibility = event.target.value;
  state.page = 0;
  renderAllPlayers();
});

document.getElementById("player-search").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.page = 0;
  renderAllPlayers();
});

document.getElementById("player-prev").addEventListener("click", () => {
  state.page = Math.max(0, state.page - 1);
  renderAllPlayers();
});

document.getElementById("player-next").addEventListener("click", () => {
  state.page += 1;
  renderAllPlayers();
});

document.addEventListener("click", (event) => {
  const trigger = event.target instanceof Element ? event.target.closest("[data-player-open]") : null;
  if (!trigger) return;
  openPlayerDashboard(trigger.dataset.role, trigger.dataset.playerId, trigger.dataset.model).catch((error) => {
    const status = document.getElementById("status-message");
    status.textContent = `Player dashboard could not load: ${error.message}`;
    status.classList.add("visible");
  });
});

const playerDialog = document.getElementById("player-dialog");
document.getElementById("player-dialog-close").addEventListener("click", () => {
  playerDialog.close();
});

playerDialog.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) playerDialog.close();
});

playerDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    playerDialog.close();
  }
});

updateView();
