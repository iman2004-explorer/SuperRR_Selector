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
  allBowlers: []
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
      <td class="player-cell">${escapeHtml(playerName(player))}${player.auction_note ? '<span title="' + escapeHtml(player.auction_note) + '"> †</span>' : ""}</td>
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
      <td class="player-cell">${escapeHtml(player.player_name)}</td>
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
      <td class="player-cell">${escapeHtml(playerName(player))}</td>
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

updateView();
