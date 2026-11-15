(() => {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const AREA = "Pantanal study area";
  const TRANSITION = "2012-02";
  const SERIES = {
    modis: { label: "Observed MODIS (Terra + Aqua)", short: "MODIS", dec: 0 },
    snpp: { label: "Observed VIIRS (S-NPP)", short: "VIIRS", dec: 0 },
    est: { label: "Harmonized MODIS (FRP ensemble, VIIRS scale)", short: "Harmonized MODIS", dec: 2 }
  };
  const VIEWS = {
    default: "Observed MODIS until January 2012, then harmonized MODIS (FRP ensemble, on the VIIRS scale).",
    modis: "Observed MODIS for every month: one consistent measurement across both eras.",
    snpp: "Observed VIIRS (S-NPP). Available from February 2012.",
    est: "Harmonized MODIS: an ensemble of the 1.84× factor and a fire-intensity (FRP) calibration, on the VIIRS scale. Available from February 2012."
  };
  const WEEK_VIEWS = {
    default: "Weeks run Monday to Sunday, cut at the February season start. Shown: harmonized MODIS.",
    modis: "Observed MODIS for each week, from February 2012.",
    snpp: "Observed VIIRS (S-NPP) for each week, from February 2012.",
    est: "Harmonized MODIS (FRP ensemble) for each full week. Partial weeks are not harmonized."
  };
  const SCALE_MAX = 8000;
  const RAMPS = {
    light: ["#FBEBD3", "#F7C98C", "#EE9446", "#CF5A23", "#8F2A14"],
    dark: ["#E9CFA6", "#E3A261", "#D57537", "#B94B21", "#9A3418"]
  };
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const toSrgb = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  function hexToLab(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16)));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function labToRgb([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  }
  const isDarkTheme = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const _brk = {};
  const niceRound = (v) => v < 10 ? Math.round(v) : v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100;
  function breaksFor(grain, view) {
    const key = grain + ":" + view;
    if (_brk[key]) return _brk[key];
    const src = grain === "week" ? (state.weeks || []).map((w) => weekValue(w, view)) : state.rows.map((r) => valueOf(r, view));
    const vals = src.filter((v) => v != null).sort((p, q) => p - q);
    if (!vals.length) return [1, 10, 100, 1000];
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))];
    const br = [0.2, 0.4, 0.6, 0.8].map((p) => Math.max(1, niceRound(q(p))));
    for (let i = 1; i < br.length; i++) if (br[i] <= br[i - 1]) br[i] = br[i - 1] + 1;
    if (grain === "week" && !state.weeks) return br;
    return (_brk[key] = br);
  }
  const curBreaks = () => breaksFor(state.grain === "week" ? "week" : "month", state.view);
  function rampColor(i) {
    const hex = RAMPS[isDarkTheme() ? "dark" : "light"][i];
    const [r, g, b] = [1, 3, 5].map((j) => toLin(parseInt(hex.slice(j, j + 2), 16)));
    return { bg: hex, ink: 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.28 ? "#13202E" : "#FFFFFF" };
  }
  function colorFor(v) { const br = curBreaks(); return rampColor(br.filter((t) => v >= t).length); }

  const state = { view: "default", sel: "2023-11", from: 2003, to: 2025, rows: [], byKey: {}, meta: {}, grain: "month", chart: "values", weeks: null, weekIdx: {}, selWeek: null };
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 0) => v == null ? "Unavailable" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
  const split = (k) => { const [y, m] = k.split("-").map(Number); return { y, m }; };
  const label = (k, long) => { const { y, m } = split(k); return (long ? MONTHS_LONG : MONTHS)[m - 1] + " " + y; };
  const seasonLabel = (s) => s + "–" + (s + 1);
  const lastDay = (k) => { const { y, m } = split(k); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const bin = (v) => { let i = 0; while (i < BINS.length && v >= BINS[i]) i++; return i + 1; };
  const inRange = (r) => r.season >= state.from && r.season <= state.to;
  const rangeRows = () => state.rows.filter(inRange);
  const valueOf = (r, view) => view === "default" ? r[r.display] : r[view];
  const viewDec = (r, view) => (view === "est" || (view === "default" && r.display === "est")) ? 2 : 0;
  const shift = (k, n) => { const { y, m } = split(k); const t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0"); };

  // ---------- calendar ----------
  function weeksOfMonth(k) { return (state.weeks || []).filter((w) => w.start.slice(0, 7) === k || w.end.slice(0, 7) === k); }
  function weekValue(w, view) { return view === "default" ? w.est : w[view]; }
  function drawWeekCalendar() {
    const cal = $("calendar");
    cal.classList.add("weeks");
    const { y, m } = split(state.sel);
    const list = weeksOfMonth(state.sel);
    let h = "";
    if (!list.length) {
      h = '<div class="empty-cal"><span>Weekly data start in February 2012. ' + MONTHS_LONG[m - 1] + " " + y + " has monthly data only.</span>" +
        '<button type="button" data-go="2012-02">Go to February 2012</button></div>';
    } else {
      for (const w of list) {
        const v = weekValue(w, state.view), dec = state.view === "est" || state.view === "default" ? 2 : 0;
        const sel = w.start === state.selWeek;
        const name = shortSpan(w);
        const common = ' role="gridcell" data-w="' + w.start + '" tabindex="' + (sel ? 0 : -1) + '" aria-selected="' + sel + '"';
        const tag = w.partial ? '<span class="chip" title="Partial week at the season boundary">' + w.days + " days</span>" : "";
        if (v == null) h += '<button class="tile unavail"' + common + ' aria-label="' + spanLabel(w) + ': unavailable"><span class="mn">' + name + '</span><span class="tv">Unavailable</span>' + tag + "</button>";
        else { const col = colorFor(v); h += '<button class="tile"' + common + ' style="background:' + col.bg + ";color:" + col.ink + '" aria-label="' + spanLabel(w) + ": " + fmt(v, dec) + ' active cell-days"><span class="mn">' + name + '</span><span class="tv">' + fmt(v, dec) + '</span><span class="tu">cell-days</span>' + tag + "</button>"; }
      }
    }
    cal.innerHTML = h;
    $("year").value = y; $("month").value = m;
    $("src-note").textContent = WEEK_VIEWS[state.view];
    drawLegend();
  }
  function drawYearGrid() {
    const cal = $("calendar");
    cal.classList.remove("weeks"); cal.classList.add("years");
    const years = [...new Set(state.rows.map((r) => split(r.start).y))];
    const fit = document.documentElement.classList.contains("fit");
    cal.style.gridTemplateRows = "auto repeat(" + years.length + ", " + (fit ? "minmax(0, 1fr)" : "22px") + ")";
    let h = '<div class="yg-h" aria-hidden="true"></div>' + MONTHS.map((m) => '<div class="yg-h" aria-hidden="true">' + m.slice(0, 1) + "</div>").join("");
    for (const y of years) {
      h += '<div class="yg-y' + (y === 2012 ? " era" : "") + '" role="rowheader">' + y + "</div>";
      for (let m = 1; m <= 12; m++) {
        const k = y + "-" + String(m).padStart(2, "0");
        const r = state.byKey[k];
        if (!r) { h += '<div class="yc na" aria-hidden="true"></div>'; continue; }
        const v = valueOf(r, state.view), sel = k === state.sel, era = k === TRANSITION ? " era-start" : "";
        const common = ' role="gridcell" data-k="' + k + '" tabindex="' + (sel ? 0 : -1) + '" aria-selected="' + sel + '"';
        if (v == null) { h += '<button class="yc unavail' + era + '"' + common + ' title="' + label(k, true) + ': unavailable" aria-label="' + label(k, true) + ': unavailable"></button>'; continue; }
        const col = colorFor(v), txt = fmt(v, viewDec(r, state.view));
        h += '<button class="yc' + era + '"' + common + ' style="background:' + col.bg + ";color:" + col.ink + '" title="' + label(k, true) + ": " + txt + ' cell-days" aria-label="' + label(k, true) + ": " + txt + ' active cell-days"><span>' + compact(v) + "</span></button>";
      }
    }
    cal.innerHTML = h;
    cal.classList.toggle("narrow", cal.clientWidth < 380);
    const { y, m } = split(state.sel);
    $("year").value = y; $("month").value = m;
    $("src-note").textContent = VIEWS[state.view] + " Each row is a year; click a month to see its details.";
    drawLegend();
  }
  function drawCalendar() {
    if (state.grain === "all") return drawYearGrid();
    $("calendar").classList.remove("years"); $("calendar").style.gridTemplateRows = "";
    if (state.grain === "week") return drawWeekCalendar();
    const cal = $("calendar");
    cal.classList.remove("weeks");
    const y = split(state.sel).y;
    let h = "";
    for (let m = 1; m <= 12; m++) {
      const k = y + "-" + String(m).padStart(2, "0");
      const r = state.byKey[k];
      const era = k === TRANSITION ? '<span class="chip" title="VIIRS on the S-NPP satellite starts in February 2012">VIIRS</span>' : "";
      if (!r) { h += '<div class="tile na" role="gridcell" aria-label="' + MONTHS_LONG[m - 1] + " " + y + ', outside the record"><span class="mn">' + MONTHS[m - 1] + '</span><span class="tv">No data</span></div>'; continue; }
      const v = valueOf(r, state.view);
      const dec = viewDec(r, state.view);
      const sel = k === state.sel;
      const common = ' role="gridcell" data-k="' + k + '" tabindex="' + (sel ? 0 : -1) + '" aria-selected="' + sel + '"';
      if (v == null) {
        h += '<button class="tile unavail"' + common + ' aria-label="' + label(k, true) + ': unavailable"><span class="mn">' + MONTHS[m - 1] + '</span><span class="tv">Unavailable</span>' + era + "</button>";
      } else {
        const col = colorFor(v);
        h += '<button class="tile"' + common + ' style="background:' + col.bg + ";color:" + col.ink + '" aria-label="' + label(k, true) + ": " + fmt(v, dec) + ' active cell-days"><span class="mn">' + MONTHS[m - 1] + '</span><span class="tv">' + fmt(v, dec) + '</span><span class="tu">cell-days</span>' + era + "</button>";
      }
    }
    cal.innerHTML = h;
    $("year").value = y; $("month").value = split(state.sel).m;
    $("src-note").textContent = VIEWS[state.view];
    drawLegend();
    requestAnimationFrame(fitCells);
  }
  function compact(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(Math.round(v)); }
  function fitCells() {
    const c = document.querySelector(".cell[data-k]");
    if (!c) return;
    const hgt = c.getBoundingClientRect().height;
    $("calendar").classList.toggle("tiny", hgt < 11);
    $("calendar").classList.toggle("small", hgt >= 11 && hgt < 16);
  }
  function drawLegend() {
    const br = curBreaks(), f = (v) => fmt(v);
    const labels = ["under " + f(br[0]), f(br[0]) + "–" + f(br[1]), f(br[1]) + "–" + f(br[2]), f(br[2]) + "–" + f(br[3]), f(br[3]) + " or more"];
    const unit = state.grain === "week" ? "weeks" : "months";
    const head = (state.grain === "week" ? "Weekly active cell-days" : state.view === "default" ? "Before Feb 2012: observed MODIS · from Feb 2012: harmonized MODIS" : "Active cell-days") + " · each color holds a fifth of all " + unit;
    $("legend").innerHTML = '<span class="legend-head">' + head + '</span><div class="qkey">' + labels.map((t, i) => '<span><i style="background:' + rampColor(i).bg + '"></i>' + t + "</span>").join("") + "</div>" +
      '<span class="key"><i class="hatch"></i>Unavailable</span>' + (state.grain === "week" ? '<span class="key"><b class="chip-key">5 days</b>partial week at the season start</span>' : state.grain === "all" ? '<span class="key"><i class="era-key"></i>first VIIRS month, Feb 2012</span>' : '<span class="key"><b class="chip-key">VIIRS</b>first VIIRS month, Feb 2012</span>');
  }

  // ---------- month detail ----------
  function drawDetail() {
    const wk = state.grain === "week" && state.selWeek ? state.weeks[state.weekIdx[state.selWeek]] : null;
    if (state.grain === "week" && !wk) { $("detail").innerHTML = '<h2 id="detail-title">' + label(state.sel, true) + " · " + AREA + '</h2><p class="note">No weekly data before February 2012. Switch to Monthly to see this month.</p>'; return; }
    const r = wk ? Object.assign({}, wk, { display: "est", versions: (state.byKey[wk.start.slice(0, 7)] || {}).versions || "" }) : state.byKey[state.sel];
    const k = r.start, { y, m } = split(k);
    const paired = r.display === "est";
    const max = Math.max(r.modis || 0, r.snpp || 0, r.est || 0) || 1;
    const bar = (name, cls, v, d) => '<div class="bar-row"><span>' + name + '</span><div class="bar-track">' +
      (v == null ? '<span class="bar-na">Unavailable</span>' : '<div class="bar ' + cls + '" style="width:' + (100 * v / max).toFixed(1) + '%"></div>') +
      '</div><span class="n">' + fmt(v, d) + "</span></div>";
    const kv = (name, v, d, hint) => '<div class="kv' + (v == null ? " muted" : "") + '"><small>' + name + "</small><b>" + fmt(v, d) + "</b>" + (hint ? "<em>" + hint + "</em>" : "") + "</div>";
    const estHint = wk ? (wk.partial ? "not harmonized: " + wk.days + "-day week" : r.est == null ? "not harmonized" : "FRP ensemble") : (paired ? "FRP ensemble" : "Before Feb 2012");
    $("detail").innerHTML =
      '<h2 id="detail-title">' + (wk ? shortSpan(wk) + ", " + split(wk.end).y : label(k, true)) + ' · ' + AREA + "</h2>" +
      '<p class="note">' + (wk ? "Week of " + spanLabel(wk) : MONTHS[m - 1] + " 1–" + lastDay(k) + ", " + y) + " · season " + seasonLabel(r.season) + " · active cell-days (2 × 2 km)</p>" +
      '<div class="kvs">' +
      kv("Observed MODIS", r.modis, 0, "Terra + Aqua") +
      kv("Observed VIIRS", r.snpp, 0, paired ? "S-NPP · 375 m pixels" : "Before Feb 2012") +
      kv("Harmonized MODIS", r.est, 2, estHint) +
      "</div>" +
      '<div class="compare">' + bar("Observed MODIS", "modis", r.modis, 0) + bar("Observed VIIRS", "snpp", r.snpp, 0) + bar("Harmonized MODIS", "est", r.est, 2) + "</div>" +
      '<p class="status"><span aria-hidden="true">⚠</span> Satellite coverage unverified' + (paired ? " · VIIRS hotspot type provisional" : "") + (r.versions ? " · MODIS v" + r.versions.replace("|", " and v") : "") + "</p>";
    const mapText = wk ? AREA + " · " + shortSpan(wk) + ", " + split(wk.end).y + ": " + fmt(weekValue(wk, state.view), state.view === "est" || state.view === "default" ? 2 : 0) : AREA + " · " + label(k) + ": " + fmt(valueOf(r, state.view), viewDec(r, state.view));
    lastMapText = mapText;
    if (globeLabel) globeLabel.textContent = mapText;
    if (mapLabel) mapLabel.setTooltipContent(mapText);
  }

  // ---------- weekly data (optional) ----------
  const iso = (d) => d.toISOString().slice(0, 10);
  async function loadWeeks() {
    if (state.weeks) return state.weeks;
    const res = await fetch("weekly.json");
    if (!res.ok) throw new Error(res.status);
    const raw = await res.json();
    let d = new Date(raw.first + "T00:00:00Z");
    state.weeks = raw.rows.map(([days, modis, snpp, est]) => {
      const start = iso(d), endD = new Date(d.getTime() + (days - 1) * 864e5), end = iso(endD);
      d = new Date(endD.getTime() + 864e5);
      const { y, m } = split(start);
      const partial = days < 7;
      return { start, end, days, partial, season: y - (m === 1 ? 1 : 0), modis, snpp, est: partial || est == null ? null : est };
    });
    state.weeks.forEach((w, i) => { state.weekIdx[w.start] = i; });
    return state.weeks;
  }
  const weekRows = () => (state.weeks || []).filter(inRange);
  function shortSpan(w) {
    const a = split(w.start), b = split(w.end), da = +w.start.slice(8), db = +w.end.slice(8);
    return MONTHS[a.m - 1] + " " + da + (w.days === 1 ? "" : "–" + (a.m === b.m ? "" : MONTHS[b.m - 1] + " ") + db);
  }
  function spanLabel(w) {
    const a = split(w.start), b = split(w.end), da = +w.start.slice(8), db = +w.end.slice(8);
    const left = MONTHS[a.m - 1] + " " + da, right = (a.m === b.m ? "" : MONTHS[b.m - 1] + " ") + db;
    return left + "–" + right + ", " + b.y + (w.partial ? " · partial week (" + w.days + " days)" : "");
  }
  async function setGrain(g) {
    if (g === "week") {
      try { await loadWeeks(); }
      catch (e) { $("src-note").textContent = "Weekly data didn't load. Refresh the page and try again."; return; }
    }
    document.querySelectorAll(".grain button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.grain === g)));
    state.grain = g;
    $("chart-title").textContent = g === "week" ? "Three series over time · weekly" : "Three series over time";
    if (g === "week") pickWeek();
    drawCalendar(); drawDetail(); drawChart(); drawTable();
  }
  function pickWeek() {
    const list = weeksOfMonth(state.sel);
    if (!list.some((w) => w.start === state.selWeek)) state.selWeek = list.length ? list[0].start : null;
  }
  function selectWeek(start, focus) {
    const w = state.weeks[state.weekIdx[start]];
    if (!w) return;
    state.selWeek = start;
    if (w.start.slice(0, 7) !== state.sel && w.end.slice(0, 7) !== state.sel) state.sel = start.slice(0, 7);
    drawCalendar(); drawDetail(); drawChart();
    if (focus) document.querySelector('.tile[data-w="' + start + '"]')?.focus();
  }

  // ---------- chart ----------
  // ---------- error by season ----------
  const FIT = [2013, 2014, 2015, 2016];
  function seasonErrors() {
    const by = {};
    for (const r of state.rows) {
      if (r.snpp == null || r.est == null) continue;
      const s = by[r.season] || (by[r.season] = { season: r.season, raw: 0, harm: 0, obs: 0, n: 0 });
      s.raw += Math.abs(r.modis - r.snpp); s.harm += Math.abs(r.est - r.snpp); s.obs += r.snpp; s.n++;
    }
    const list = Object.values(by).sort((a, b) => a.season - b.season).map((s) => ({ ...s, fit: FIT.includes(s.season), rawP: (100 * s.raw) / s.obs, harmP: (100 * s.harm) / s.obs }));
    const t = list.filter((s) => !s.fit).reduce((a, s) => ({ raw: a.raw + s.raw, harm: a.harm + s.harm, obs: a.obs + s.obs, n: a.n + s.n }), { raw: 0, harm: 0, obs: 0, n: 0 });
    return { list, rawP: (100 * t.raw) / t.obs, harmP: (100 * t.harm) / t.obs, months: t.n, seasons: list.filter((s) => !s.fit).length };
  }
  function drawErrorChart() {
    const box = $("chart"), E = seasonErrors(), L = E.list;
    const W = Math.max(320, box.clientWidth || 800), H = Math.max(140, box.clientHeight || 200);
    const m = { t: 24, r: 10, b: 22, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const nice = 60, y = (v) => m.t + ih - (Math.min(v, nice) / nice) * ih;
    const gw = iw / L.length, bw = Math.max(4, Math.min(18, gw * 0.32));
    const css = getComputedStyle(document.documentElement), c = (n) => css.getPropertyValue(n).trim();
    let g = "";
    for (let i = 0; i <= 3; i++) { const v = i * 20; g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "%</text>"; }
    let bars = "", xt = "";
    const showVals = gw >= 34;
    L.forEach((s, i) => {
      const cx = m.l + gw * i + gw / 2, op = s.fit ? 0.45 : 1;
      if (s.fit) bars += '<rect x="' + (m.l + gw * i + 1) + '" y="' + m.t + '" width="' + (gw - 2) + '" height="' + ih + '" fill="url(#fit-hatch)" opacity=".5"/>';
      bars += '<rect x="' + (cx - bw - 1) + '" y="' + y(s.rawP) + '" width="' + bw + '" height="' + (m.t + ih - y(s.rawP)) + '" rx="2" fill="' + c("--median") + '" opacity="' + (0.55 * op) + '"/>';
      bars += '<rect x="' + (cx + 1) + '" y="' + y(s.harmP) + '" width="' + bw + '" height="' + (m.t + ih - y(s.harmP)) + '" rx="2" fill="' + c("--est") + '" opacity="' + op + '"/>';
      if (showVals) bars += '<text class="bar-v" x="' + (cx + 1 + bw / 2) + '" y="' + (y(s.harmP) - 4) + '" text-anchor="middle">' + Math.round(s.harmP) + "</text>";
      const lab = gw >= 44 ? s.season + "–" + String((s.season + 1) % 100).padStart(2, "0") : "’" + String(s.season % 100).padStart(2, "0");
      xt += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + lab + "</text>";
      bars += '<rect class="err-hit" data-i="' + i + '" x="' + (m.l + gw * i) + '" y="' + m.t + '" width="' + gw + '" height="' + ih + '" fill="transparent"/>';
    });
    const sum = W >= 640 ? "Seasons outside fitting: raw MODIS " + E.rawP.toFixed(2) + "% → harmonized " + E.harmP.toFixed(2) + "% (" + E.months + " months, " + E.seasons + " seasons)"
      : W >= 420 ? "Outside fitting: raw " + E.rawP.toFixed(2) + "% → harmonized " + E.harmP.toFixed(2) + "%" : E.rawP.toFixed(1) + "% → " + E.harmP.toFixed(1) + "% outside fitting";
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Weighted absolute error against observed VIIRS by season. ' + sum + '. ' + L.map((s) => s.season + ": raw " + s.rawP.toFixed(1) + "%, harmonized " + s.harmP.toFixed(1) + "%" + (s.fit ? " (fitting season)" : "")).join("; ") + '">' +
      '<defs><pattern id="fit-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + c("--border") + '" stroke-width="2"/></pattern></defs>' +
      '<text class="err-sum" x="' + m.l + '" y="14">' + sum + "</text>" +
      '<g class="grid axis">' + g + xt + "</g>" + bars + "</svg>";
    const tip = $("tip");
    box.querySelectorAll(".err-hit").forEach((el) => {
      el.addEventListener("pointermove", () => {
        const s = L[+el.dataset.i];
        tip.hidden = false;
        tip.innerHTML = "<b>Season " + seasonLabel(s.season) + (s.fit ? " · used to fit the model" : " · outside fitting") + "</b>" +
          "<span><em>Raw MODIS error</em>" + s.rawP.toFixed(1) + "%</span><span><em>Harmonized MODIS error</em>" + s.harmP.toFixed(1) + "%</span><span><em>Months</em>" + s.n + "</span>";
        const bw2 = box.clientWidth, sx = ((m.l + gw * (+el.dataset.i) + gw / 2) / W) * bw2;
        tip.style.left = (sx + 230 > bw2 ? sx - 236 : sx + 14) + "px";
        tip.style.top = (box.offsetTop + 8) + "px";
      });
      el.addEventListener("pointerleave", () => { tip.hidden = true; });
    });
  }
  function setChartMode(mode) {
    state.chart = mode;
    document.querySelectorAll(".chart-mode button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.chart === mode)));
    const err = mode === "error";
    $("range").hidden = err; $("val-key").hidden = err; $("err-key").hidden = !err;
    $("chart-title").textContent = err ? "Error against VIIRS, by season" : "Three series over time";
    drawChart();
  }

  function drawChart() {
    if (state.chart === "error") return drawErrorChart();
    const weekly = state.grain === "week";
    const rows = weekly ? weekRows() : rangeRows();
    const box = $("chart");
    if (!rows.length) { box.innerHTML = '<p class="empty">No weekly data in these seasons. Weekly data start in February 2012 (season 2012–2013).</p>'; return; }
    const W = Math.max(320, box.clientWidth || 800), H = Math.max(140, box.clientHeight || 200);
    const m = { t: 10, r: 10, b: 22, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(...rows.map((r) => Math.max(r.modis || 0, r.snpp || 0, r.est || 0))) || 1;
    const nice = niceMax(max);
    const x = (i) => m.l + (rows.length === 1 ? iw / 2 : (i * iw) / (rows.length - 1));
    const y = (v) => m.t + ih - (v / nice) * ih;
    const path = (key) => { let d = "", pen = false; rows.forEach((r, i) => { const v = r[key]; if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); pen = true; }); return d; };
    const css = getComputedStyle(document.documentElement), c = (n) => css.getPropertyValue(n).trim();
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const v = (nice * i) / 4;
      g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      g += '<text x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + "</text>";
    }
    let xt = "", prevY = null;
    const years = new Set(rows.map((r) => split(r.start).y)).size;
    const step = years > 12 ? 3 : years > 6 ? 2 : 1;
    rows.forEach((r, i) => { const { y: yy } = split(r.start); if (prevY !== null && yy !== prevY && yy % step === 0) xt += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + yy + "</text>"; prevY = yy; });
    const ti = rows.findIndex((r) => r.start === TRANSITION);
    const trans = ti >= 0 ? '<line x1="' + x(ti) + '" x2="' + x(ti) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--text-2") + '" stroke-width="1.5"/><text class="t-label" x="' + (x(ti) + 5) + '" y="' + (m.t + 12) + '">VIIRS starts</text>' : "";
    let selLine = "";
    if (weekly) {
      const hits = rows.map((r, i) => r.start === state.selWeek ? i : -1).filter((i) => i >= 0);
      if (hits.length) { const x0 = x(hits[0]) - 2, x1 = x(hits[hits.length - 1]) + 2; selLine = '<rect x="' + x0 + '" y="' + m.t + '" width="' + Math.max(3, x1 - x0) + '" height="' + ih + '" fill="' + c("--text") + '" opacity=".12"/>'; }
    } else {
      const si = rows.findIndex((r) => r.start === state.sel);
      selLine = si >= 0 ? '<line x1="' + x(si) + '" x2="' + x(si) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--text") + '" stroke-width="1.5" stroke-dasharray="2 3"/>' : "";
    }
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Monthly active cell-days for observed MODIS, observed VIIRS (S-NPP) and harmonized MODIS, ' + seasonLabel(state.from) + " to " + seasonLabel(state.to) + '">' +
      '<g class="grid axis">' + g + xt + "</g>" + trans + selLine +
      '<path d="' + path("modis") + '" fill="none" stroke="' + c("--modis") + '" stroke-width="1.5"/>' +
      '<path d="' + path("snpp") + '" fill="none" stroke="' + c("--viirs") + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + path("est") + '" fill="none" stroke="' + c("--est") + '" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round"/>' +
      '<line id="hover-line" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--median") + '" visibility="hidden"/>' +
      '<rect id="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent" style="cursor:pointer"/></svg>';
    const svg = box.querySelector("svg"), hit = $("hit"), hl = $("hover-line"), tip = $("tip");
    const idxAt = (ev) => { const pt = svg.getBoundingClientRect(); const px = ((ev.clientX - pt.left) / pt.width) * W; return Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.l) / iw) * (rows.length - 1)))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = idxAt(ev), r = rows[i];
      hl.setAttribute("x1", x(i)); hl.setAttribute("x2", x(i)); hl.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = "<b>" + (weekly ? spanLabel(r) : label(r.start, true)) + " · " + AREA + "</b>" +
        "<span><em>Observed MODIS</em>" + fmt(r.modis) + "</span><span><em>Observed VIIRS (S-NPP)</em>" + fmt(r.snpp) + "</span><span><em>Harmonized MODIS</em>" + fmt(r.est, 2) + "</span>";
      const bw = box.clientWidth, sx = (x(i) / W) * bw;
      tip.style.left = (sx + 230 > bw ? sx - 236 : sx + 14) + "px";
      tip.style.top = (box.offsetTop + 8) + "px";
    });
    hit.addEventListener("pointerleave", () => { hl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    hit.addEventListener("click", (ev) => select(rows[idxAt(ev)].start.slice(0, 7)));
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p; return 10 * p; }

  function drawTable() {
    if (state.grain === "week") {
      $("table").innerHTML = "<thead><tr><th>Week</th><th>Season</th><th>Observed MODIS</th><th>Observed VIIRS (S-NPP)</th><th>Harmonized MODIS</th></tr></thead><tbody>" +
        weekRows().map((w) => "<tr><td>" + spanLabel(w) + "</td><td>" + seasonLabel(w.season) + "</td><td>" + fmt(w.modis) + "</td><td>" + fmt(w.snpp) + "</td><td>" + fmt(w.est, 2) + "</td></tr>").join("") + "</tbody>";
      return;
    }
    $("table").innerHTML = "<thead><tr><th>Month</th><th>Season</th><th>Observed MODIS</th><th>Observed VIIRS (S-NPP)</th><th>Harmonized MODIS</th></tr></thead><tbody>" +
      rangeRows().map((r) => "<tr><td>" + label(r.start) + "</td><td>" + seasonLabel(r.season) + "</td><td>" + fmt(r.modis) + "</td><td>" + fmt(r.snpp) + "</td><td>" + fmt(r.est, 2) + "</td></tr>").join("") + "</tbody>";
  }

  // ---------- 2017–2018 methods example ----------
  function drawAgreement() {
    const rows = state.rows.filter((r) => r.flags);
    const methods = [
      { i: 0, name: "VIIRS (S-NPP)", sub: "reference", short: "VIIRS" },
      { i: 1, name: "MODIS raw", sub: "VIIRS threshold", short: "raw" },
      { i: 2, name: "MODIS raw", sub: "own threshold", short: "own threshold" },
      { i: 3, name: "Harmonized MODIS", sub: "VIIRS threshold", short: "harmonized" }
    ];
    let h = "<div></div>" + rows.map((r) => { const { y, m } = split(r.start); return '<div class="hd">' + MONTHS[m - 1] + (m === 1 ? " '" + String(y).slice(2) : "") + "</div>"; }).join("");
    for (const md of methods) {
      h += '<div class="lbl">' + md.name + "<small>" + md.sub + "</small></div>";
      let off = 0, caught = 0, ref = 0;
      for (const r of rows) {
        const a = r.flags[0], b = r.flags[md.i];
        let cls = "ag", txt = "", lab = "Usual, agrees";
        if (md.i === 0) { if (a) { cls += " hit"; txt = "▲"; lab = "Above usual"; } }
        else if (a && b) { cls += " hit"; txt = "▲"; lab = "Caught"; caught++; }
        else if (a) { cls += " miss"; txt = "✕"; lab = "Missed"; off++; }
        else if (b) { cls += " extra"; txt = "+"; lab = "Extra high call"; off++; }
        if (a) ref++;
        h += '<div class="' + cls + '" title="' + label(r.start) + ": " + lab + '" aria-label="' + label(r.start) + ", " + md.name + " " + md.sub + ": " + lab + '">' + txt + "</div>";
      }
      md.sum = md.i ? { off, caught, ref, n: rows.length } : null;
    }
    $("agreement").innerHTML = h;
    const ms = methods.filter((x) => x.sum);
    $("ag-summary").innerHTML =
      '<div class="ag-key"><span><i style="background:var(--alert)"></i>Caught</span><span><i style="box-shadow:inset 0 0 0 2px var(--alert)"></i>Missed</span><span><i style="background:repeating-linear-gradient(45deg,var(--median) 0 3px,transparent 3px 7px)"></i>Extra high call</span></div>' +
      '<p class="ag-sum-line"><b>Months that disagree with VIIRS:</b> ' + ms.map((x) => x.short + " " + x.sum.off + "/" + x.sum.n).join(" · ") +
      "<br><b>VIIRS-high month caught:</b> " + ms.map((x) => x.short + " " + x.sum.caught + "/" + x.sum.ref).join(" · ") + " (one high month: a first result, not proof)</p>";
  }

  // ---------- map ----------
  let map, mapLabel, globe, globeLabel, lastMapText = "";
  const TEX = "https://unpkg.com/three-globe@2.31.1/example/img/";
  function drawMap() {
    if (window.Globe && drawGlobe()) return;
    drawFlatMap();
  }
  function drawGlobe() {
    try {
      const el = $("map");
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return false;
      const ring = [[-58, -19.5], [-58, -17], [-56, -17], [-56, -19.5], [-58, -19.5]];
      const target = { lat: -19.5, lng: -57, altitude: 0.7 };
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      globe = Globe()(el)
        .width(el.clientWidth).height(el.clientHeight)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(TEX + "earth-blue-marble.jpg")
        .bumpImageUrl(TEX + "earth-topology.png")
        .showAtmosphere(true).atmosphereColor("#7cc4ff").atmosphereAltitude(0.18)
        .polygonsData([{ geometry: { type: "Polygon", coordinates: [ring] } }])
        .polygonCapColor(() => "rgba(255,140,60,0.35)").polygonSideColor(() => "rgba(201,54,54,0.6)")
        .polygonStrokeColor(() => "#ff3b2f").polygonAltitude(0.006)
        .ringsData(calm ? [] : [{ lat: -18.25, lng: -57 }])
        .ringColor(() => (t) => "rgba(255,90,60," + (1 - t) + ")").ringMaxRadius(4).ringPropagationSpeed(2).ringRepeatPeriod(1800)
        .htmlElementsData([{ lat: -15.6, lng: -57 }])
        .htmlElement(() => { globeLabel = document.createElement("div"); globeLabel.className = "globe-label"; globeLabel.textContent = lastMapText || AREA; return globeLabel; });
      const c = globe.controls();
      c.enableZoom = false; c.enablePan = false; c.autoRotate = false;
      let back;
      c.addEventListener("start", () => clearTimeout(back));
      c.addEventListener("end", () => { clearTimeout(back); back = setTimeout(() => globe.pointOfView(target, 1200), 3000); });
      if (calm) globe.pointOfView(target, 0);
      else { globe.pointOfView({ lat: 5, lng: -30, altitude: 2.6 }, 0); setTimeout(() => globe.pointOfView(target, 2200), 300); }
      const sharp = () => { const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1; globe.renderer().setPixelRatio(Math.min(3, (devicePixelRatio || 1) * Math.max(1, z))); };
      sharp();
      if (window.ResizeObserver) new ResizeObserver(() => { sharp(); globe.width(el.clientWidth).height(el.clientHeight); }).observe(el);
      el.classList.add("is-globe");
      return true;
    } catch (e) {
      console.error(e);
      $("map").innerHTML = "";
      return false;
    }
  }
  function drawFlatMap() {
    if (!window.L) { $("map").textContent = "Map unavailable offline."; return; }
    const b = [[-19.5, -58], [-17, -56]];
    map = L.map("map", { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, attributionControl: true });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 12, attribution: "Map © Esri, HERE, Garmin, OpenStreetMap" }).addTo(map);
    mapLabel = L.rectangle(b, { color: "#C93636", weight: 3, fillColor: "#F38C48", fillOpacity: 0.22 }).addTo(map)
      .bindTooltip(AREA, { permanent: true, direction: "top", className: "area-label", offset: [0, -4] });
    const fit = () => { map.invalidateSize(); map.fitBounds(b, { padding: [40, 40], maxZoom: 8 }); };
    fit(); setTimeout(fit, 250);
    if (window.ResizeObserver) new ResizeObserver(fit).observe($("map"));
  }

  // ---------- range + export ----------
  function setupRange() {
    const seasons = [...new Set(state.rows.map((r) => r.season))];
    const opts = seasons.map((s) => '<option value="' + s + '">' + seasonLabel(s) + "</option>").join("");
    $("from").innerHTML = opts; $("to").innerHTML = opts;
    $("from").value = state.from; $("to").value = state.to;
    const onChange = () => {
      let f = +$("from").value, t = +$("to").value;
      if (f > t) [f, t] = [t, f];
      state.from = f; state.to = t; $("from").value = f; $("to").value = t;
      renderRange();
    };
    $("from").addEventListener("change", onChange); $("to").addEventListener("change", onChange);
  }
  function renderRange() {
    $("dl-range").textContent = "seasons " + seasonLabel(state.from) + " to " + seasonLabel(state.to) + " (" + rangeRows().length + " months), with all three series, season, coverage and source";
    drawCalendar(); drawChart(); drawTable();
  }
  const csvCell = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
  function downloadWeeks(rows, name) {
    const meta = state.meta;
    const cols = ["week_start_local", "week_end_local", "days", "is_partial_week", "season", "study_area", "observed_modis_cell_days", "observed_snpp_viirs_cell_days", "modis_estimated_on_snpp_scale_cell_days", "coverage_status", "viirs_type_status", "timezone", "grid_crs", "cell_size_m", "method_version", "calibration_model_status", "source"];
    const lines = [cols.join(",")];
    for (const w of rows) lines.push([w.start, w.end, w.days, w.partial ? "True" : "False", seasonLabel(w.season), AREA, w.modis, w.snpp, w.est ?? "", meta.coverage_status, meta.viirs_type_status_paired, meta.timezone, meta.grid_crs, meta.cell_size_m, meta.method_version, meta.calibration_model_status, "NASA FIRMS active fire archive"].map(csvCell).join(","));
    saveCsv(lines, name);
  }
  function saveCsv(lines, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadMonths(rows, name) {
    const meta = state.meta;
    const cols = ["month_id", "period_start_local", "period_end_local", "season", "study_area", "observed_modis_cell_days", "aqua_cell_days", "terra_cell_days", "observed_snpp_viirs_cell_days", "modis_estimated_on_snpp_scale_cell_days", "calendar_view_value", "calendar_view_series", "coverage_status", "viirs_type_status", "modis_versions", "timezone", "grid_crs", "cell_size_m", "method_version", "calibration_model_status", "source"];
    const lines = [cols.join(",")];
    for (const r of rows) {
      const paired = r.display === "est";
      const vals = [r.start, r.start + "-01", r.start + "-" + lastDay(r.start), seasonLabel(r.season), AREA, r.modis, r.aqua, r.terra, r.snpp ?? "", r.est ?? "", r[r.display],
        paired ? "Harmonized MODIS (FRP ensemble, VIIRS scale)" : "Observed MODIS", meta.coverage_status, paired ? meta.viirs_type_status_paired : "", r.versions.replace("|", " "),
        meta.timezone, meta.grid_crs, meta.cell_size_m, meta.method_version, paired ? meta.calibration_model_status : "", "NASA FIRMS active fire archive"];
      lines.push(vals.map(csvCell).join(","));
    }
    saveCsv(lines, name);
  }
  function downloadErrors() {
    const E = seasonErrors();
    const lines = ["season,role,months,observed_snpp_viirs_cell_days,raw_modis_abs_error_cell_days,harmonized_modis_abs_error_cell_days,raw_modis_weighted_abs_error_pct,harmonized_modis_weighted_abs_error_pct,method_version"];
    for (const s of E.list) lines.push([seasonLabel(s.season), s.fit ? "fitting" : "outside_fitting", s.n, s.obs, s.raw.toFixed(4), s.harm.toFixed(4), s.rawP.toFixed(2), s.harmP.toFixed(2), state.meta.method_version].join(","));
    lines.push(["all_outside_fitting", "outside_fitting", E.months, "", "", "", E.rawP.toFixed(2), E.harmP.toFixed(2), state.meta.method_version].join(","));
    saveCsv(lines, "pantanal_error_by_season.csv");
  }
  async function download(kind) {
    const first = state.rows[0].start, last = state.rows[state.rows.length - 1].start;
    if (kind === "all-months") return downloadMonths(state.rows, "pantanal_monthly_" + first + "_to_" + last + ".csv");
    if (kind === "all-weeks") { const w = await loadWeeks(); return downloadWeeks(w, "pantanal_weekly_" + w[0].start + "_to_" + w[w.length - 1].end + ".csv"); }
    if (kind === "range") {
      if (state.grain === "week") { await loadWeeks(); return downloadWeeks(weekRows(), "pantanal_weekly_" + seasonLabel(state.from) + "_to_" + seasonLabel(state.to) + ".csv"); }
      return downloadMonths(rangeRows(), "pantanal_monthly_" + seasonLabel(state.from) + "_to_" + seasonLabel(state.to) + ".csv");
    }
    if (kind === "year") { const y = state.sel.slice(0, 4); return downloadMonths(state.rows.filter((r) => r.start.startsWith(y)), "pantanal_monthly_" + y + ".csv"); }
    if (kind === "errors") return downloadErrors();
  }
  function syncDlLabels() {
    if (!state.rows.length) return;
    const f = state.rows[0].start, l = state.rows[state.rows.length - 1].start;
    $("dl-all-span").textContent = label(f) + " – " + label(l) + " · " + state.rows.length + " months";
    $("dl-range-span").textContent = (state.grain === "week" ? "Weeks" : "Months") + ", seasons " + seasonLabel(state.from) + " to " + seasonLabel(state.to);
    $("dl-year-span").textContent = "Months of " + state.sel.slice(0, 4) + " (calendar year)";
  }

  // ---------- interactions ----------
  function select(k, focus) {
    if (!state.byKey[k]) {
      const { y, m } = split(k);
      const near = state.rows.find((r) => split(r.start).y === y && split(r.start).m >= m) || state.rows.filter((r) => split(r.start).y === y).pop();
      if (!near) return;
      k = near.start;
    }
    state.sel = k;
    if (state.grain === "week") pickWeek();
    drawCalendar(); drawDetail(); drawChart();
    if (focus) document.querySelector('.tile[data-k="' + k + '"], .yc[data-k="' + k + '"]')?.focus();
  }
  function setView(v) {
    state.view = v;
    document.querySelectorAll(".seg button[data-src]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.src === v)));
    drawCalendar(); drawDetail();
  }
  function setupTheme() {
    const btn = $("theme-toggle");
    const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const sync = () => { btn.textContent = isDark() ? "Light mode" : "Dark mode"; };
    btn.addEventListener("click", () => {
      const t = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem("theme", t); } catch (e) {}
      sync(); drawChart(); drawCalendar();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { sync(); drawChart(); drawCalendar(); });
    sync();
  }

  async function init() {
    let raw;
    try {
      const res = await fetch("monthly.json");
      if (!res.ok) throw new Error(res.status);
      raw = await res.json();
    } catch (e) {
      document.querySelector(".dash").innerHTML = '<p class="card load-error">The activity data didn\'t load. Refresh the page or check your connection.</p>';
      throw e;
    }
    state.meta = raw.meta;
    state.rows = raw.rows.map((r) => {
      const o = Object.fromEntries(raw.keys.map((k, i) => [k, r[i]]));
      o.display = o.start >= TRANSITION ? "est" : "modis";
      return o;
    });
    state.rows.forEach((r) => { state.byKey[r.start] = r; });
    const seasons = state.rows.map((r) => r.season);
    state.from = Math.min(...seasons); state.to = Math.max(...seasons);
    const first = state.rows[0].start, last = state.rows[state.rows.length - 1].start;
    $("span-label").textContent = label(first, true) + " – " + label(last, true);

    const years = [...new Set(state.rows.map((r) => split(r.start).y))];
    $("year").innerHTML = years.map((y) => '<option value="' + y + '">' + y + "</option>").join("");
    $("month").innerHTML = MONTHS_LONG.map((n, i) => '<option value="' + (i + 1) + '">' + n + "</option>").join("");
    const pick = () => select($("year").value + "-" + String($("month").value).padStart(2, "0"));
    $("year").addEventListener("change", pick); $("month").addEventListener("change", pick);
    const cal = $("calendar");
    cal.addEventListener("click", (e) => {
      const go = e.target.closest("button[data-go]"); if (go) return select(go.dataset.go);
      const b = e.target.closest("button.tile, button.yc"); if (!b) return;
      if (b.dataset.w) selectWeek(b.dataset.w, true); else select(b.dataset.k, true);
    });
    cal.addEventListener("keydown", (e) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4, Home: -999, End: 999 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      if (state.grain === "week") {
        if (!state.selWeek) return;
        const n = state.weeks.length, step = Math.abs(moves[e.key]) === 999 ? moves[e.key] : moves[e.key] === -4 || moves[e.key] === 4 ? moves[e.key] / 4 * 3 : moves[e.key];
        const j = Math.max(0, Math.min(n - 1, state.weekIdx[state.selWeek] + step));
        return selectWeek(state.weeks[j].start, true);
      }
      const mv = state.grain === "all" && Math.abs(moves[e.key]) === 4 ? moves[e.key] * 3 : moves[e.key];
      let k = shift(state.sel, mv);
      if (!state.byKey[k]) k = mv < 0 ? first : last;
      select(k, true);
    });
    document.querySelectorAll(".seg button[data-src]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.src)));
    document.querySelectorAll(".chart-mode button").forEach((b) => b.addEventListener("click", () => setChartMode(b.dataset.chart)));
    $("dl").addEventListener("toggle", () => { if ($("dl").open) syncDlLabels(); });
    document.querySelectorAll(".dl-menu button").forEach((b) => b.addEventListener("click", async () => { $("dl").open = false; try { await download(b.dataset.dl); } catch (e) { console.error(e); } }));
    document.addEventListener("click", (e) => { if ($("dl").open && !$("dl").contains(e.target)) $("dl").open = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("dl").open) { $("dl").open = false; $("download").focus(); } });
    document.querySelectorAll(".grain button").forEach((b) => b.addEventListener("click", () => setGrain(b.dataset.grain)));
    let rt;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawChart(); fitCells(); }, 120); });
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { drawChart(); fitCells(); }, 80); }).observe($("chart"));

    setupTheme(); drawMap(); setupRange(); renderRange(); drawDetail(); drawAgreement();
  }
  init().catch((err) => console.error(err));
})();
