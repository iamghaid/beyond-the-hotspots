(() => {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const AREA = "Pantanal study area";
  const TRANSITION = "2012-02";
  const SERIES = {
    modis: { label: "Observed MODIS", short: "MODIS", dec: 0 },
    snpp: { label: "Observed S-NPP VIIRS", short: "S-NPP", dec: 0 },
    est: { label: "MODIS estimated on the S-NPP scale", short: "Estimate", dec: 2 }
  };
  const VIEWS = {
    default: "Observed MODIS until January 2012, then MODIS estimated on the S-NPP scale.",
    modis: "Observed MODIS for every month: one consistent measurement across both eras.",
    snpp: "Observed S-NPP VIIRS. Available from February 2012.",
    est: "MODIS × 1.84, estimated on the S-NPP scale. Available from February 2012."
  };
  const SCALE_MAX = 8000;
  const RAMPS = {
    light: ["#FBEBD3", "#F7C98C", "#EE9446", "#CF5A23", "#8F2A14"],
    dark: ["#4A3426", "#8A4A26", "#C8692C", "#F0A050", "#FFE0A6"]
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
  function colorFor(v) {
    const stops = RAMPS[isDarkTheme() ? "dark" : "light"].map(hexToLab);
    const t = Math.min(1, Math.log10(1 + Math.max(0, v)) / Math.log10(1 + SCALE_MAX)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const lab = stops[i].map((c, j) => c + (stops[i + 1][j] - c) * f);
    const rgb = labToRgb(lab);
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return { bg: "rgb(" + rgb.map(toSrgb).join(",") + ")", ink: lum > 0.28 ? "#13202E" : "#FFFFFF" };
  }

  const state = { view: "default", sel: "2023-11", from: 2003, to: 2025, rows: [], byKey: {}, meta: {} };
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
  function drawCalendar() {
    const cal = $("calendar");
    const y = split(state.sel).y;
    let h = "";
    for (let m = 1; m <= 12; m++) {
      const k = y + "-" + String(m).padStart(2, "0");
      const r = state.byKey[k];
      const era = k === TRANSITION ? '<span class="chip" title="S-NPP VIIRS starts in February 2012">S-NPP</span>' : "";
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
    const ticks = [0, 10, 100, 1000, SCALE_MAX];
    const pos = (v) => (100 * Math.log10(1 + v) / Math.log10(1 + SCALE_MAX)).toFixed(1) + "%";
    const grad = Array.from({ length: 11 }, (_, i) => colorFor(Math.pow(1 + SCALE_MAX, i / 10) - 1).bg).join(",");
    const head = state.view === "default" ? "Before Feb 2012: observed MODIS · from Feb 2012: estimate on the S-NPP scale" : "Active cell-days";
    $("legend").innerHTML = '<span class="legend-head">' + head + '</span><div class="ramp" style="background:linear-gradient(90deg,' + grad + ')"></div><div class="ticks">' +
      ticks.map((t) => '<span style="left:' + pos(t) + '">' + fmt(t) + "</span>").join("") + '</div><span class="key"><i class="hatch"></i>Unavailable</span><span class="key"><b class="chip-key">S-NPP</b>first S-NPP month, Feb 2012</span>';
  }

  // ---------- month detail ----------
  function drawDetail() {
    const r = state.byKey[state.sel];
    const k = r.start, { y, m } = split(k);
    const paired = r.display === "est";
    const max = Math.max(r.modis || 0, r.snpp || 0, r.est || 0) || 1;
    const bar = (name, cls, v, d) => '<div class="bar-row"><span>' + name + '</span><div class="bar-track">' +
      (v == null ? '<span class="bar-na">Unavailable</span>' : '<div class="bar ' + cls + '" style="width:' + (100 * v / max).toFixed(1) + '%"></div>') +
      '</div><span class="n">' + fmt(v, d) + "</span></div>";
    const kv = (name, v, d, hint) => '<div class="kv' + (v == null ? " muted" : "") + '"><small>' + name + "</small><b>" + fmt(v, d) + "</b>" + (hint ? "<em>" + hint + "</em>" : "") + "</div>";
    $("detail").innerHTML =
      '<h2 id="detail-title">' + label(k, true) + ' · ' + AREA + "</h2>" +
      '<p class="note">' + MONTHS[m - 1] + " 1–" + lastDay(k) + ", " + y + " · season " + seasonLabel(r.season) + " · active cell-days (2 × 2 km)</p>" +
      '<div class="kvs">' +
      kv("Observed MODIS", r.modis, 0, "Terra + Aqua") +
      kv("Observed S-NPP VIIRS", r.snpp, 0, paired ? "375 m pixels" : "Before Feb 2012") +
      kv("MODIS on S-NPP scale", r.est, 2, paired ? "estimate, × 1.84" : "Before Feb 2012") +
      "</div>" +
      '<div class="compare">' + bar("Observed MODIS", "modis", r.modis, 0) + bar("Observed S-NPP", "snpp", r.snpp, 0) + bar("MODIS on S-NPP scale", "est", r.est, 2) + "</div>" +
      '<p class="status"><span aria-hidden="true">⚠</span> Satellite coverage unverified' + (paired ? " · S-NPP hotspot type provisional" : "") + " · MODIS v" + r.versions.replace("|", " and v") + "</p>";
    if (mapLabel) mapLabel.setTooltipContent(AREA + " · " + label(k) + ": " + fmt(valueOf(r, state.view), viewDec(r, state.view)));
  }

  // ---------- chart ----------
  function drawChart() {
    const rows = rangeRows();
    const box = $("chart");
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
    let xt = "";
    const step = rows.length > 120 ? 3 : 1;
    rows.forEach((r, i) => { const { y: yy, m: mm } = split(r.start); if (mm === 1 && yy % step === 0) xt += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + yy + "</text>"; });
    const ti = rows.findIndex((r) => r.start === TRANSITION);
    const trans = ti >= 0 ? '<line x1="' + x(ti) + '" x2="' + x(ti) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--text-2") + '" stroke-width="1.5"/><text class="t-label" x="' + (x(ti) + 5) + '" y="' + (m.t + 12) + '">S-NPP starts</text>' : "";
    const si = rows.findIndex((r) => r.start === state.sel);
    const selLine = si >= 0 ? '<line x1="' + x(si) + '" x2="' + x(si) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--text") + '" stroke-width="1.5" stroke-dasharray="2 3"/>' : "";
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Monthly active cell-days for observed MODIS, observed S-NPP VIIRS and the S-NPP-scale estimate, ' + seasonLabel(state.from) + " to " + seasonLabel(state.to) + '">' +
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
      tip.innerHTML = "<b>" + label(r.start, true) + " · " + AREA + "</b>" +
        "<span><em>Observed MODIS</em>" + fmt(r.modis) + "</span><span><em>Observed S-NPP</em>" + fmt(r.snpp) + "</span><span><em>MODIS on S-NPP scale</em>" + fmt(r.est, 2) + "</span>";
      const bx = box.getBoundingClientRect(), sx = (x(i) / W) * bx.width;
      tip.style.left = (sx + 230 > bx.width ? sx - 236 : sx + 14) + "px";
      tip.style.top = (box.offsetTop + 8) + "px";
    });
    hit.addEventListener("pointerleave", () => { hl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    hit.addEventListener("click", (ev) => select(rows[idxAt(ev)].start));
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p; return 10 * p; }

  function drawTable() {
    $("table").innerHTML = "<thead><tr><th>Month</th><th>Season</th><th>Observed MODIS</th><th>Observed S-NPP</th><th>MODIS on S-NPP scale</th></tr></thead><tbody>" +
      rangeRows().map((r) => "<tr><td>" + label(r.start) + "</td><td>" + seasonLabel(r.season) + "</td><td>" + fmt(r.modis) + "</td><td>" + fmt(r.snpp) + "</td><td>" + fmt(r.est, 2) + "</td></tr>").join("") + "</tbody>";
  }

  // ---------- 2017–2018 methods example ----------
  function drawAgreement() {
    const rows = state.rows.filter((r) => r.flags);
    const methods = [
      { i: 0, name: "S-NPP VIIRS", sub: "reference", short: "S-NPP" },
      { i: 1, name: "MODIS raw", sub: "S-NPP threshold", short: "raw" },
      { i: 2, name: "MODIS raw", sub: "own threshold", short: "own threshold" },
      { i: 3, name: "MODIS estimate", sub: "S-NPP threshold", short: "estimate" }
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
      '<p class="ag-sum-line"><b>Months that disagree with S-NPP:</b> ' + ms.map((x) => x.short + " " + x.sum.off + "/" + x.sum.n).join(" · ") +
      "<br><b>S-NPP-high month caught:</b> " + ms.map((x) => x.short + " " + x.sum.caught + "/" + x.sum.ref).join(" · ") + " (one high month: a first result, not proof)</p>";
  }

  // ---------- map ----------
  let map, mapLabel;
  function drawMap() {
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
  function download() {
    const meta = state.meta;
    const cols = ["month_id", "period_start_local", "period_end_local", "season", "study_area", "observed_modis_cell_days", "aqua_cell_days", "terra_cell_days", "observed_snpp_viirs_cell_days", "modis_estimated_on_snpp_scale_cell_days", "calendar_view_value", "calendar_view_series", "coverage_status", "viirs_type_status", "modis_versions", "timezone", "grid_crs", "cell_size_m", "method_version", "modis_to_snpp_factor", "source"];
    const lines = [cols.join(",")];
    for (const r of rangeRows()) {
      const paired = r.display === "est";
      const vals = [r.start, r.start + "-01", r.start + "-" + lastDay(r.start), seasonLabel(r.season), AREA, r.modis, r.aqua, r.terra, r.snpp ?? "", r.est ?? "", r[r.display],
        paired ? "MODIS estimated on the S-NPP scale" : "Observed MODIS", meta.coverage_status, paired ? meta.viirs_type_status_paired : "", r.versions.replace("|", " "),
        meta.timezone, meta.grid_crs, meta.cell_size_m, meta.method_version, meta.modis_to_snpp_factor, "NASA FIRMS active fire archive"];
      lines.push(vals.map((v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }));
    a.download = "pantanal_activity_" + seasonLabel(state.from) + "_to_" + seasonLabel(state.to) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- interactions ----------
  function select(k, focus) {
    if (!state.byKey[k]) {
      const { y, m } = split(k);
      const near = state.rows.find((r) => split(r.start).y === y && split(r.start).m >= m) || state.rows.filter((r) => split(r.start).y === y).pop();
      if (!near) return;
      k = near.start;
    }
    state.sel = k; drawCalendar(); drawDetail(); drawChart();
    if (focus) document.querySelector('.tile[data-k="' + k + '"]')?.focus();
  }
  function setView(v) {
    state.view = v;
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.src === v)));
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
    cal.addEventListener("click", (e) => { const b = e.target.closest("button.tile"); if (b) select(b.dataset.k, true); });
    cal.addEventListener("keydown", (e) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4, Home: -999, End: 999 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      let k = shift(state.sel, moves[e.key]);
      if (!state.byKey[k]) k = moves[e.key] < 0 ? first : last;
      select(k, true);
    });
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.src)));
    $("download").addEventListener("click", download);
    let rt;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawChart(); fitCells(); }, 120); });
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { drawChart(); fitCells(); }, 80); }).observe($("chart"));

    setupTheme(); drawMap(); setupRange(); renderRange(); drawDetail(); drawAgreement();
  }
  init().catch((err) => console.error(err));
})();
