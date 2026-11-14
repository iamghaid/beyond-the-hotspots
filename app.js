(() => {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const AREA = "Pantanal study area";
  const SOURCES = {
    viirs: { label: "VIIRS observed", short: "VIIRS", flag: "high_viirs", note: "Observed Suomi NPP VIIRS active cell-days." },
    modis: { label: "MODIS raw", short: "MODIS raw", flag: "high_modis_raw", note: "Observed MODIS active cell-days, Terra and Aqua combined. Same color scale as VIIRS, so the gap is visible." },
    modis_cal: { label: "MODIS harmonized", short: "MODIS harmonized", flag: "high_modis_cal", note: "Estimated active cell-days on the VIIRS scale (combined MODIS × factor)." }
  };

  const state = { src: "viirs", sel: "2017-09-01", from: null, to: null, data: null, byKey: {} };
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 0) => v == null ? "–" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const ym = (k) => { const [y, m] = k.split("-").map(Number); return { y, m }; };
  const label = (k, long) => { const { y, m } = ym(k); return (long ? MONTHS_LONG : MONTHS)[m - 1] + " " + y; };
  const bin = (v) => v < 50 ? 1 : v < 150 ? 2 : v < 400 ? 3 : v < 1000 ? 4 : 5;
  const inRange = (k) => k >= state.from && k <= state.to;
  const rangeRows = () => state.data.months.filter((r) => inRange(r.start));

  function diff(row, value) {
    if (row.median == null) return null;
    const d = value - row.median;
    const pct = row.median > 0 ? Math.round((100 * d) / row.median) : null;
    return { d, pct };
  }
  function refYears(k) { const { y, m } = ym(k); return MONTHS[m - 1] + " " + (y - 5) + "–" + (y - 1); }

  // ---------- calendar ----------
  function drawCalendar() {
    const cal = $("calendar");
    const years = [...new Set(state.data.months.map((r) => ym(r.start).y))];
    const src = SOURCES[state.src];
    let h = '<div></div>' + MONTHS.map((m) => '<div class="hd" role="columnheader">' + m + '</div>').join("");
    for (const y of years) {
      h += '<div class="yr" role="rowheader">' + y + '</div>';
      for (let m = 1; m <= 12; m++) {
        const k = y + "-" + String(m).padStart(2, "0") + "-01";
        const r = state.byKey[k];
        if (!r) { h += '<div class="cell na" role="gridcell" aria-label="' + MONTHS_LONG[m - 1] + " " + y + ', no data"></div>'; continue; }
        const v = r[state.src];
        const b = bin(v);
        const flag = r[src.flag] === true;
        h += '<button class="cell' + (inRange(k) ? "" : " out") + '" role="gridcell" data-k="' + k + '" aria-selected="' + (k === state.sel) + '"' +
          ' style="background:var(--fire-' + b + ');color:var(--ink-' + b + ')"' +
          ' aria-label="' + label(k, true) + ", " + fmt(v) + " active cell-days" + (flag ? ", above usual" : "") + '">' +
          (flag ? '<span class="flag" aria-hidden="true">▲</span>' : "") + '<span class="v">' + fmt(v) + "</span></button>";
      }
    }
    cal.innerHTML = h;
    $("src-note").textContent = src.note;
  }

  // ---------- month detail ----------
  function drawDetail() {
    const r = state.byKey[state.sel];
    const src = SOURCES[state.src];
    const v = r[state.src];
    const isEst = state.src === "modis_cal";
    const high = r[src.flag] === true;
    const dd = diff(r, v);
    const max = Math.max(r.viirs, r.modis, r.modis_cal, r.median || 0) || 1;
    const pct = (x) => (100 * x / max).toFixed(1) + "%";
    const med = r.median != null ? '<span class="med-tick" style="left:' + pct(r.median) + '" title="Median"></span>' : "";

    let cmp;
    if (dd) {
      const sign = dd.d >= 0 ? "+" : "−";
      cmp = '<div class="kv"><small>Median, ' + refYears(state.sel) + ' (VIIRS)</small><b>' + fmt(r.median) + '</b></div>' +
        '<div class="kv"><small>Difference from median</small><b>' + sign + fmt(Math.abs(dd.d), isEst ? 1 : 0) +
        (dd.pct != null ? ' <span class="soft">(' + (dd.pct >= 0 ? "+" : "−") + Math.abs(dd.pct) + '%)</span>' : "") + '</b></div>';
    } else {
      cmp = '<div class="kv"><small>Same month, five prior years</small><b class="soft">Historical comparison unavailable</b></div>';
    }

    $("detail").innerHTML =
      '<h2 id="detail-title">' + label(state.sel, true) + ' · ' + AREA + (high ? '<span class="badge">▲ Above usual</span>' : "") + '</h2>' +
      '<div class="kvs">' +
      '<div class="kv"><small>' + src.label + (isEst ? " (estimate)" : "") + '</small><b>' + (isEst ? "≈ " : "") + fmt(v, isEst ? 1 : 0) + '</b></div>' +
      cmp +
      '<div class="kv"><small>Coverage</small><b class="soft">' + cap(r.coverage) + '</b></div>' +
      '</div>' +
      (state.src !== "viirs" && dd ? '<p class="note">The median and the above-usual threshold come from VIIRS. Raw MODIS sits on a smaller scale, so comparing it with them shows what goes wrong without harmonization.</p>' : "") +
      '<div class="compare" aria-label="All three sources for this month">' +
      bar("VIIRS observed", "viirs", r.viirs, pct, med, 0) +
      bar("MODIS raw", "modis", r.modis, pct, med, 0) +
      bar("MODIS harmonized", "cal", r.modis_cal, pct, med, 1) +
      (r.median != null ? '<p class="note">Grey tick: VIIRS median for this month.</p>' : "") +
      '</div>';
  }
  function bar(name, cls, v, pct, med, d) {
    return '<div class="bar-row"><span>' + name + '</span><div class="bar-track"><div class="bar ' + cls + '" style="width:' + pct(v) + '"></div>' + med + '</div><span class="n">' + fmt(v, d) + '</span></div>';
  }
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : "–";

  // ---------- chart ----------
  function drawChart() {
    const rows = rangeRows();
    const box = $("chart");
    const W = Math.max(320, box.clientWidth || 800), H = W < 560 ? 240 : 300;
    const m = { t: 12, r: 12, b: 28, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(...rows.map((r) => Math.max(r.viirs, r.modis, r.modis_cal))) || 1;
    const nice = niceMax(max);
    const x = (i) => m.l + (rows.length === 1 ? iw / 2 : (i * iw) / (rows.length - 1));
    const y = (v) => m.t + ih - (v / nice) * ih;
    const path = (key) => rows.map((r, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(r[key]).toFixed(1)).join("");
    const css = getComputedStyle(document.documentElement);
    const c = (n) => css.getPropertyValue(n).trim();

    let g = "";
    for (let i = 0; i <= 4; i++) {
      const v = (nice * i) / 4;
      g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke-width="' + (i ? 1 : 1.5) + '"/>';
      g += '<text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + "</text>";
    }
    let xt = "";
    rows.forEach((r, i) => {
      const { y: yy, m: mm } = ym(r.start);
      if (mm === 1 || i === 0) xt += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + (mm === 1 ? yy : MONTHS[mm - 1] + " " + yy) + "</text>";
    });
    const si = rows.findIndex((r) => r.start === state.sel);
    const selLine = si >= 0 ? '<line x1="' + x(si) + '" x2="' + x(si) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--text") + '" stroke-width="1.5" stroke-dasharray="2 3"/>' : "";
    const medDots = rows.map((r, i) => r.median != null ? '<rect x="' + (x(i) - 4) + '" y="' + (y(r.median) - 1.5) + '" width="8" height="3" rx="1" fill="' + c("--median") + '"/>' : "").join("");

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Line chart of monthly active cell-days for VIIRS, raw MODIS and harmonized MODIS">' +
      '<g class="grid axis">' + g + xt + "</g>" + selLine +
      '<path d="' + path("modis") + '" fill="none" stroke="' + c("--modis") + '" stroke-opacity=".55" stroke-width="1.5"/>' +
      '<path d="' + path("viirs") + '" fill="none" stroke="' + c("--viirs") + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + path("modis_cal") + '" fill="none" stroke="' + c("--modis") + '" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/>' +
      medDots +
      '<line id="hover-line" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + c("--median") + '" visibility="hidden"/>' +
      '<rect id="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent" style="cursor:pointer"/>' +
      "</svg>";

    const svg = box.querySelector("svg"), hit = $("hit"), hl = $("hover-line"), tip = $("tip");
    const idxAt = (ev) => {
      const pt = svg.getBoundingClientRect();
      const px = ((ev.clientX - pt.left) / pt.width) * W;
      return Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.l) / iw) * (rows.length - 1))));
    };
    hit.addEventListener("pointermove", (ev) => {
      const i = idxAt(ev), r = rows[i];
      hl.setAttribute("x1", x(i)); hl.setAttribute("x2", x(i)); hl.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = "<b>" + label(r.start, true) + "</b>" +
        "<span><em>VIIRS observed</em>" + fmt(r.viirs) + "</span>" +
        "<span><em>MODIS raw</em>" + fmt(r.modis) + "</span>" +
        "<span><em>MODIS harmonized</em>" + fmt(r.modis_cal, 1) + "</span>" +
        (r.median != null ? "<span><em>VIIRS median</em>" + fmt(r.median) + "</span>" : "");
      const bx = box.getBoundingClientRect(), sx = (x(i) / W) * bx.width;
      const left = sx + 14 + 200 > bx.width ? sx - 214 : sx + 14;
      tip.style.left = left + "px";
      tip.style.top = (box.offsetTop + 10) + "px";
    });
    hit.addEventListener("pointerleave", () => { hl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    hit.addEventListener("click", (ev) => select(rows[idxAt(ev)].start));
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p; return 10 * p; }

  function drawTable() {
    const rows = rangeRows();
    $("table").innerHTML = "<thead><tr><th>Month</th><th>VIIRS</th><th>MODIS raw</th><th>MODIS harmonized</th><th>VIIRS median</th><th>Difference</th></tr></thead><tbody>" +
      rows.map((r) => { const d = diff(r, r.viirs); return "<tr><td>" + label(r.start) + "</td><td>" + fmt(r.viirs) + "</td><td>" + fmt(r.modis) + "</td><td>" + fmt(r.modis_cal, 2) + "</td><td>" + fmt(r.median) + "</td><td>" + (d ? (d.d >= 0 ? "+" : "−") + fmt(Math.abs(d.d)) + (d.pct != null ? " (" + d.pct + "%)" : "") : "–") + "</td></tr>"; }).join("") + "</tbody>";
  }

  // ---------- agreement ----------
  function drawAgreement() {
    const rows = state.data.months.filter((r) => r.eligible === true);
    const methods = [
      { key: "high_viirs", name: "VIIRS", sub: "Reference" },
      { key: "high_modis_raw", name: "MODIS raw", sub: "VIIRS threshold" },
      { key: "high_modis_own", name: "MODIS raw", sub: "Its own threshold" },
      { key: "high_modis_cal", name: "MODIS harmonized", sub: "VIIRS threshold" }
    ];
    const el = $("agreement");
    el.style.gridTemplateColumns = "";
    let h = "<div></div>" + rows.map((r) => { const { y, m } = ym(r.start); return '<div class="hd">' + MONTHS[m - 1] + (m === 1 ? " '" + String(y).slice(2) : "") + "</div>"; }).join("");
    for (const md of methods) {
      h += '<div class="lbl">' + md.name + "<small>" + md.sub + "</small></div>";
      let off = 0, caught = 0, ref = 0;
      for (const r of rows) {
        const a = r.high_viirs === true, b = r[md.key] === true;
        let cls = "ag", txt = "", lab = "Usual, agrees";
        if (md.key === "high_viirs") { if (a) { cls += " hit"; txt = "▲"; lab = "Above usual"; } }
        else if (a && b) { cls += " hit"; txt = "▲"; lab = "Caught the high month"; caught++; }
        else if (a && !b) { cls += " miss"; txt = "✕"; lab = "Missed the high month"; off++; }
        else if (!a && b) { cls += " extra"; txt = "+"; lab = "Extra high call"; off++; }
        if (a) ref++;
        h += '<div class="' + cls + '" title="' + label(r.start) + ": " + lab + '" aria-label="' + label(r.start) + ": " + lab + '">' + txt + "</div>";
      }
      el.dataset.ref = ref;
      h += "";
      md.summary = md.key === "high_viirs" ? null : { off, caught, ref, n: rows.length };
    }
    el.innerHTML = h;
    const sums = methods.filter((m) => m.summary).map((m) =>
      "<li><b>" + m.name + ", " + m.sub + ":</b> " + m.summary.off + " of " + m.summary.n + " months disagree · caught " + m.summary.caught + " of " + m.summary.ref + " VIIRS-high month" + (m.summary.ref === 1 ? "" : "s") + "</li>").join("");
    el.insertAdjacentHTML("afterend", "");
    let s = document.getElementById("ag-summary");
    if (!s) { s = document.createElement("div"); s.id = "ag-summary"; el.after(s); }
    s.innerHTML =
      '<div class="ag-key"><span><i style="background:var(--alert)"></i>Above usual, agrees with VIIRS</span><span><i style="box-shadow:inset 0 0 0 2px var(--alert)"></i>Missed</span><span><i style="background:repeating-linear-gradient(45deg,var(--median) 0 3px,transparent 3px 7px)"></i>Extra high call</span><span><i style="background:var(--raised)"></i>Usual, agrees</span></div>' +
      '<ul class="facts">' + sums + "</ul>" +
      '<p class="note">The test year has one VIIRS-high month, so read this as a first result, not proof.</p>';
  }

  // ---------- map ----------
  function drawMap() {
    if (!window.L) { $("map").textContent = "Map unavailable offline."; return; }
    const b = [[-19.5, -58], [-17, -56]];
    const map = L.map("map", { scrollWheelZoom: false, attributionControl: true }).fitBounds(b, { padding: [24, 24] });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
    L.rectangle(b, { color: "#B23B1D", weight: 2, fillOpacity: 0.08 }).addTo(map).bindTooltip(AREA);
  }

  // ---------- range + export ----------
  function setupRange() {
    const opts = state.data.months.map((r) => '<option value="' + r.start + '">' + label(r.start) + "</option>").join("");
    $("from").innerHTML = opts; $("to").innerHTML = opts;
    $("from").value = state.from; $("to").value = state.to;
    const onChange = () => {
      let f = $("from").value, t = $("to").value;
      if (f > t) [f, t] = [t, f];
      state.from = f; state.to = t;
      $("from").value = f; $("to").value = t;
      renderRange();
    };
    $("from").addEventListener("change", onChange);
    $("to").addEventListener("change", onChange);
  }
  function renderRange() {
    $("dl-range").textContent = label(state.from) + " – " + label(state.to) + " (" + rangeRows().length + " months)";
    drawCalendar(); drawChart(); drawTable();
  }
  function download() {
    const cols = ["month_start", "month_end", "study_area", "viirs_observed_cell_days", "modis_raw_cell_days", "modis_harmonized_cell_days_estimate", "viirs_median_cell_days", "reference_years", "difference_from_median", "pct_difference_from_median", "viirs_above_usual", "coverage_status", "viirs_type_status", "timezone", "grid_crs", "cell_size_m", "method_version", "modis_to_snpp_factor", "source"];
    const meta = state.data.meta;
    const lines = [cols.join(",")];
    for (const r of rangeRows()) {
      const d = diff(r, r.viirs);
      const vals = [r.start, r.end, AREA, r.viirs, r.modis, r.modis_cal, r.median ?? "", r.ref_years ?? "", d ? d.d : "", d && d.pct != null ? d.pct : "", r.high_viirs == null ? "" : r.high_viirs, r.coverage, r.viirs_type, meta.timezone, meta.grid_crs, meta.cell_size_m, meta.method_version, meta.modis_to_snpp_factor, "NASA FIRMS (MODIS v" + meta.modis_version + ", VIIRS Suomi NPP v" + meta.viirs_version + ")"];
      lines.push(vals.map((v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(","));
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pantanal_activity_" + state.from.slice(0, 7) + "_to_" + state.to.slice(0, 7) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- interactions ----------
  function select(k) { state.sel = k; drawCalendar(); drawDetail(); drawChart(); }
  function setSource(s) {
    state.src = s;
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.src === s)));
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
      sync(); drawChart();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { sync(); drawChart(); });
    sync();
  }

  async function init() {
    const res = await fetch("monthly.json");
    const raw = await res.json();
    state.data = raw.rows ? { meta: raw.meta, months: raw.rows.map((r) => Object.fromEntries(raw.keys.map((k, i) => [k, r[i]]))) } : raw;
    state.data.months.forEach((r) => { state.byKey[r.start] = r; });
    const ms = state.data.months;
    state.from = ms[0].start; state.to = ms[ms.length - 1].start;
    $("span-label").textContent = label(state.from, true) + " – " + label(state.to, true);
    $("factor").textContent = state.data.meta.modis_to_snpp_factor;

    $("calendar").addEventListener("click", (e) => { const b = e.target.closest("button.cell"); if (b) select(b.dataset.k); });
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setSource(b.dataset.src)));
    $("download").addEventListener("click", download);
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawChart, 120); });

    setupTheme(); setupRange(); renderRange(); drawDetail(); drawAgreement(); drawMap();
    if (innerWidth < 760) { document.querySelector(".cal-scroll").scrollLeft = 9999; $("agreement").scrollLeft = 9999; }
  }
  init().catch((err) => {
    document.querySelector("main").insertAdjacentHTML("afterbegin", '<p class="card">The data file did not load. Refresh the page or check that monthly.json is deployed.</p>');
    console.error(err);
  });
})();
