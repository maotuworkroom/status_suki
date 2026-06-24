/**
 * ============================================
 *  Sukiing 服务状态 — 前端渲染引擎
 *  纯原生 JS · ES6+ · Canvas 图表
 * ============================================
 */

(() => {
  "use strict";

  const REFRESH_INTERVAL = 60;
  let statusData = null;
  let historyData = null;
  let refreshTimer = null;
  let countdownTimer = null;
  let countdownSec = REFRESH_INTERVAL;
  let searchQuery = "";
  let tooltipAbort = null;

  // ── 工具函数 ──

  const esc = (s) =>
    s == null
      ? ""
      : String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const isDark = () => document.body.classList.contains("dark-mode");

  const historyKey = (g, s) => `${g}|${s}`;

  const parseHistoryKey = (k) => {
    const i = k.indexOf("|");
    return i === -1 ? [k, k] : [k.slice(0, i), k.slice(i + 1)];
  };

  const uptimeColor = (u) => {
    if (u >= 99.5) return "#22c55e";
    if (u >= 95) return "#86efac";
    if (u >= 50) return "#fbbf24";
    return "#ef4444";
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const timeAgo = (iso) => {
    if (!iso) return "";
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 5) return t("ui.justNow");
    if (sec < 60) return `${sec} ${t("ui.secondsAgo")}`;
    if (sec < 3600) return `${Math.floor(sec / 60)} ${t("ui.minutesAgo")}`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} ${t("ui.hoursAgo")}`;
    return new Date(iso).toLocaleString();
  };

  const statusIcon = (type) => {
    const map = {
      operational: { icon: "check_circle", color: "#22C55E" },
      partial: { icon: "warning", color: "#F59E0B" },
      major: { icon: "error", color: "#EF4444" },
    };
    const s = map[type] || map.operational;
    return `<i class="mdui-icon material-icons" style="font-size:52px;color:${s.color}">${s.icon}</i>`;
  };

  // ── 数据加载 ──

  const fetchJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };

  const loadData = async () => {
    try {
      const [s, h] = await Promise.all([
        fetchJSON(`data/status.json?v=${Date.now()}`),
        fetchJSON(`data/history.json?v=${Date.now()}`),
      ]);
      statusData = s;
      historyData = h;
      await mergeArchiveData();
    } catch (err) {
      console.error("数据加载失败:", err);
      statusData = null;
      historyData = null;
    }
  };

  const mergeArchiveData = async () => {
    try {
      const resp = await fetch(`data/archive/manifest.json?v=${Date.now()}`);
      if (!resp.ok) return;
      const manifest = await resp.json();
      if (!manifest.files?.length) return;

      const archives = await Promise.all(
        manifest.files.map((f) =>
          fetchJSON(`data/archive/${f}?v=${Date.now()}`).catch(() => null)
        )
      );

      for (const arc of archives) {
        if (!arc?.sites) continue;
        for (const key of Object.keys(arc.sites)) {
          if (!historyData.sites) historyData.sites = {};
          if (!historyData.sites[key]) {
            historyData.sites[key] = { daily: [], responseTime: [], incidents: [], currentDown: null };
          }
          const main = historyData.sites[key];

          if (arc.sites[key].daily) {
            const dates = new Set(main.daily.map((d) => d.date));
            for (const d of arc.sites[key].daily) {
              if (!dates.has(d.date)) main.daily.push(d);
            }
            main.daily.sort((a, b) => (a.date < b.date ? -1 : 1));
          }

          if (arc.sites[key].incidents) {
            const starts = new Set(main.incidents.map((i) => i.start));
            for (const i of arc.sites[key].incidents) {
              if (!starts.has(i.start)) main.incidents.push(i);
            }
            main.incidents.sort((a, b) => (a.start < b.start ? -1 : 1));
          }
        }
      }
    } catch (_) {}
  };

  // ── 计算工具 ──

  const calcUptime = (hist) => {
    if (!hist?.daily?.length) return 100;
    let total = 0, passes = 0;
    for (const d of hist.daily) {
      total += d.checks;
      passes += d.passes;
    }
    return total > 0 ? parseFloat(((passes / total) * 100).toFixed(2)) : 100;
  };

  const calcResponseStats = (hist) => {
    if (!hist?.responseTime || hist.responseTime.length < 3) return null;
    const vals = hist.responseTime.map((d) => d.value);
    let min = vals[0], max = vals[0], sum = 0;
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, avg: Math.round(sum / vals.length) };
  };

  const buildUptimeBar = (hist) => {
    if (!hist?.daily?.length) {
      return Array.from({ length: 30 }, () => '<div class="uptime-day empty"></div>').join("");
    }
    const days = hist.daily.slice(-30);
    const filled = days
      .map((d) => `<div class="uptime-day" style="background:${uptimeColor(d.uptime)}" title="${d.date}: ${d.uptime}%"></div>`)
      .join("");
    const empty = Array.from({ length: Math.max(0, 30 - days.length) }, () => '<div class="uptime-day empty"></div>').join("");
    return empty + filled;
  };

  // ── 渲染：总状态 ──

  const renderOverallStatus = () => {
    const el = $("overall-status");
    if (!el) return;

    if (!statusData?.groups?.length) {
      el.innerHTML = `
        <div class="overall-card status-operational fade-in">
          ${statusIcon("operational")}
          <div class="overall-title">${t("ui.noData")}</div>
          <div style="font-size:12px;opacity:0.35">${t("ui.waitingFirstCheck")}</div>
        </div>`;
      return;
    }

    const o = statusData.overallStatus || "operational";
    const textMap = {
      operational: t("status.operational"),
      partial: t("status.partial"),
      major: t("status.major"),
    };
    const up = statusData.upSites || 0;
    const total = statusData.totalSites || 0;

    el.innerHTML = `
      <div class="overall-card status-${o} fade-in">
        ${statusIcon(o)}
        <div class="overall-title">${textMap[o]}</div>
        <div class="overall-stats">
          <span class="stat-chip green">${up} ${t("ui.online")}</span>
          <span class="stat-chip red">${total - up} ${t("ui.offline")}</span>
          <span class="stat-chip">${total} ${t("ui.total")}</span>
        </div>
        <div class="overall-time">${t("ui.lastUpdate")}：${timeAgo(statusData.lastUpdate)}</div>
      </div>`;
  };

  // ── 渲染：分组列表 ──

  const renderSites = (group) => {
    return group.sites
      .map((site) => {
        const isUp = site.status === "up";
        const hist = historyData?.sites?.[historyKey(group.name, site.name)];
        const uptime = calcUptime(hist);
        const uptimeBar = buildUptimeBar(hist);
        const rtStats = calcResponseStats(hist);
        const canvasId = `chart-${group.name}-${site.name}`.replace(/[^a-zA-Z0-9-]/g, "_");
        const visible = !searchQuery || site.name.toLowerCase().includes(searchQuery.toLowerCase());

        let sslHTML = "";
        if (site.sslDaysLeft >= 0) {
          const cls = site.sslDaysLeft <= 30 ? "warn" : "ok";
          sslHTML = `<span class="ssl-chip ${cls}"><i class="mdui-icon material-icons">lock</i>${site.sslDaysLeft}d</span>`;
        }

        let statsHTML = "";
        if (rtStats) {
          statsHTML = `
            <div class="rt-stats">
              <span>${t("ui.min")} ${rtStats.min}ms</span>
              <span>${t("ui.avg")} ${rtStats.avg}ms</span>
              <span>${t("ui.max")} ${rtStats.max}ms</span>
            </div>`;
        }

        return `
          <div class="site-item" data-site-name="${esc(site.name.toLowerCase())}" style="${visible ? '' : 'display:none'}">
            <div class="site-row">
              <div class="site-left">
                <span class="site-dot ${isUp ? 'up' : 'down'}"></span>
                <a class="site-name" href="${esc(site.url)}" target="_blank" rel="noopener">${esc(site.name)}</a>
                ${sslHTML}
              </div>
              <div class="site-right">
                <span class="site-uptime" style="color:${uptimeColor(uptime)}">${uptime.toFixed(2)}%</span>
                <span class="site-rt${isUp ? '' : ' offline'}">${isUp ? site.responseTime + 'ms' : t("ui.offline")}</span>
              </div>
            </div>
            ${statsHTML}
            <div class="uptime-bar-wrap">${uptimeBar}</div>
            <div class="chart-container">
              <canvas id="${canvasId}" class="response-chart" data-group="${esc(group.name)}" data-site="${esc(site.name)}"></canvas>
              <div class="chart-tooltip" id="tip-${canvasId}"></div>
            </div>
          </div>`;
      })
      .join("");
  };

  const renderGroups = () => {
    const el = $("groups");
    if (!el) return;

    if (!statusData?.groups?.length) {
      el.innerHTML = `
        <div class="group-card fade-in">
          <div class="empty-state">
            <i class="mdui-icon material-icons">hourglass_empty</i>
            <p>${t("ui.noData")}</p>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = statusData.groups
      .map((group, idx) => {
        const on = group.sites.filter((s) => s.status === "up").length;
        const tot = group.sites.length;
        const countClass = on < tot ? "has-down" : "all-up";

        return `
          <div class="group-card fade-in" style="animation-delay:${idx * 0.06}s">
            <div class="group-header" onclick="toggleGroup(this)">
              <div class="group-icon">
                <i class="mdui-icon material-icons">${esc(group.icon || "dns")}</i>
              </div>
              <span class="group-name">${esc(group.name)}</span>
              <span class="group-count ${countClass}">${on}/${tot} ${t("ui.online")}</span>
              <i class="mdui-icon material-icons group-chevron">expand_more</i>
            </div>
            <div class="group-body">
              ${renderSites(group)}
            </div>
          </div>`;
      })
      .join("");

    requestAnimationFrame(() => {
      for (const body of el.querySelectorAll(".group-body")) {
        body.style.maxHeight = `${body.scrollHeight}px`;
      }
      for (const group of statusData.groups) {
        for (const site of group.sites) {
          drawResponseChart(group.name, site.name);
        }
      }
      bindChartTooltips();
    });
  };

  // ── Canvas 图表 ──

  const drawResponseChart = (groupName, siteName) => {
    const canvasId = `chart-${groupName}-${siteName}`.replace(/[^a-zA-Z0-9-]/g, "_");
    const canvas = $(canvasId);
    if (!canvas) return;

    const hist = historyData?.sites?.[historyKey(groupName, siteName)];
    const data = hist?.responseTime || [];
    if (data.length < 2) {
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "block";

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 12, right: 12, bottom: 24, left: 44 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const values = data.map((d) => d.value);
    let maxVal = Math.max(...values, 100);
    maxVal = Math.ceil(maxVal / 50) * 50;
    if (maxVal < 100) maxVal = 100;

    const dk = isDark();
    const gridColor = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const textColor = dk ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    const lineColor = dk ? "#F48FB1" : "#EC407A";
    const fillTop = dk ? "rgba(244,143,177,0.08)" : "rgba(236,64,126,0.06)";
    const fillBot = dk ? "rgba(244,143,177,0)" : "rgba(236,64,126,0)";

    ctx.clearRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = textColor;
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(maxVal - (maxVal / 4) * i)}`, pad.left - 6, y + 3);
    }

    // X轴标签
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(data.length / 5));
    for (let j = 0; j < data.length; j += step) {
      const x = pad.left + (cw / (data.length - 1)) * j;
      const d = new Date(data[j].time);
      ctx.fillText(
        `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`,
        x,
        H - 4
      );
    }

    // 数据点
    const pts = data.map((d, idx) => ({
      x: pad.left + (cw / (data.length - 1)) * idx,
      y: pad.top + ch - (d.value / maxVal) * ch,
      value: d.value,
      time: d.time,
    }));

    // 贝塞尔曲线
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) {
      const cpx = (pts[k - 1].x + pts[k].x) / 2;
      ctx.bezierCurveTo(cpx, pts[k - 1].y, cpx, pts[k].y, pts[k].x, pts[k].y);
    }
    ctx.stroke();

    // 渐变填充
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, pad.top + ch);
    ctx.lineTo(pts[0].x, pad.top + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, fillTop);
    grad.addColorStop(1, fillBot);
    ctx.fillStyle = grad;
    ctx.fill();

    // 最新点标记
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = dk ? "#1a1a1a" : "#fff";
    ctx.fill();

    canvas._chartPts = pts;
    canvas._pad = pad;
    canvas._cw = cw;
  };

  const bindChartTooltips = () => {
    if (tooltipAbort) tooltipAbort.abort();
    tooltipAbort = new AbortController();
    const signal = tooltipAbort.signal;

    for (const canvas of $$(".response-chart")) {
      if (!canvas._chartPts) continue;
      const tip = $(`tip-${canvas.id}`);
      if (!tip) continue;

      canvas.addEventListener(
        "mousemove",
        (e) => {
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const pts = canvas._chartPts;
          if (!pts || pts.length < 2) return;
          const ratio = (mx - canvas._pad.left) / canvas._cw;
          const idx = Math.round(ratio * (pts.length - 1));
          if (idx < 0 || idx >= pts.length) {
            tip.style.opacity = "0";
            return;
          }
          const pt = pts[idx];
          const d = new Date(pt.time);
          tip.innerHTML = `<strong>${pt.value}ms</strong><br>${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
          tip.style.opacity = "1";
          tip.style.left = `${pt.x}px`;
          tip.style.top = `${pt.y - 34}px`;
        },
        { signal }
      );

      canvas.addEventListener("mouseleave", () => {
        tip.style.opacity = "0";
      }, { signal });
    }
  };

  // ── 渲染：事件历史 ──

  const renderIncidentHistory = () => {
    const el = $("incident-history");
    if (!el || !historyData?.sites) return;

    const all = [];
    for (const key of Object.keys(historyData.sites)) {
      const [groupName, siteName] = parseHistoryKey(key);
      for (const inc of historyData.sites[key].incidents || []) {
        if (inc.end) {
          all.push({ ...inc, siteName, groupName });
        }
      }
    }

    if (!all.length) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }

    all.sort((a, b) => new Date(b.start) - new Date(a.start));
    const recent = all.slice(0, 10);

    el.style.display = "block";
    el.innerHTML = `
      <div class="incident-card fade-in">
        <div class="incident-card-title">
          <i class="mdui-icon material-icons">history</i>${t("incidents.title")}
        </div>
        ${recent
          .map(
            (inc) => `
          <div class="incident-item">
            <div class="incident-dot"></div>
            <div class="incident-info">
              <div class="incident-site">${esc(inc.siteName)}<span>${esc(inc.groupName)}</span></div>
              <div class="incident-reason">${esc(inc.reason) || t("ui.unknown")}</div>
              <div class="incident-time">${new Date(inc.start).toLocaleString()} · ${formatDuration(inc.duration)}</div>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  };

  // ── 渲染：服务列表 ──

  const renderServices = () => {
    const el = $("services-list");
    if (!el || !statusData?.groups) return;

    el.innerHTML = `
      <div class="services-title" id="services-heading">${t("services.title")}</div>
      ${statusData.groups
        .map(
          (group) => `
        <div class="service-group-label">${esc(group.name)}</div>
        ${group.sites
          .map((site) => {
            const isUp = site.status === "up";
            const label = isUp ? t("services.operational") : t("services.down");
            return `
              <div class="service-item">
                <span class="service-item-name">${esc(site.name)}</span>
                <span class="service-status-chip ${isUp ? "up" : "down"}">
                  <i class="mdui-icon material-icons">fiber_manual_record</i>${label}
                </span>
              </div>`;
          })
          .join("")}`
        )
        .join("")}`;
  };

  // ── 渲染：公告横幅 ──

  const renderBanner = () => {
    const el = $("incident-banner");
    if (!el || !statusData) return;

    const down = [];
    for (const g of statusData.groups || []) {
      for (const s of g.sites || []) {
        if (s.status !== "up") down.push(s);
      }
    }

    if (!down.length) {
      el.style.display = "none";
      return;
    }

    el.style.display = "flex";
    el.querySelector("span").innerHTML =
      `<strong>${t("banner.activeIncident")}</strong> — ${down.map((s) => esc(s.name)).join(", ")}`;
  };

  // ── 渲染全部 ──

  const renderAll = async () => {
    showLoading(true);
    await loadData();
    renderOverallStatus();
    renderGroups();
    renderServices();
    renderBanner();
    renderIncidentHistory();
    showLoading(false);
    countdownSec = REFRESH_INTERVAL;
  };

  const showLoading = (show) => {
    const el = $("loading-overlay");
    if (el) el.style.display = show ? "flex" : "none";
  };

  // ── 倒计时 ──

  const startCountdown = () => {
    const el = $("countdown-text");
    countdownTimer = setInterval(() => {
      countdownSec = Math.max(0, countdownSec - 1);
      if (el) el.textContent = `${countdownSec}s`;
    }, 1000);
  };

  // ── 全局交互 ──

  window.refreshData = () => {
    const btn = document.querySelector(".refresh-btn");
    if (btn) btn.classList.add("spinning");
    renderAll().then(() => {
      setTimeout(() => btn?.classList.remove("spinning"), 500);
    });
  };

  window.toggleTheme = () => {
    document.body.classList.toggle("dark-mode");
    const dk = isDark();
    localStorage.setItem("status_theme", dk ? "dark" : "light");

    if (statusData?.groups) {
      for (const g of statusData.groups) {
        for (const s of g.sites) {
          drawResponseChart(g.name, s.name);
        }
      }
      bindChartTooltips();
    }

    const icon = $("theme-icon");
    if (icon) icon.textContent = dk ? "light_mode" : "dark_mode";
  };

  window.toggleSearch = () => {
    const bar = $("search-bar");
    if (!bar) return;
    const show = !bar.classList.contains("show");
    bar.classList.toggle("show", show);
    if (show) {
      const input = $("search-input");
      if (input) {
        input.value = "";
        input.focus();
      }
      searchQuery = "";
    }
  };

  window.filterSites = (q) => {
    searchQuery = q;
    for (const el of $$(".site-item")) {
      const name = el.dataset.siteName || "";
      el.style.display = !q || name.includes(q.toLowerCase()) ? "" : "none";
    }
  };

  window.clearSearch = () => {
    searchQuery = "";
    const input = $("search-input");
    if (input) input.value = "";
    filterSites("");
  };

  window.toggleGroup = (header) => {
    const card = header.closest(".group-card");
    if (!card) return;
    const body = card.querySelector(".group-body");
    if (!body) return;
    const collapsed = card.classList.toggle("collapsed");
    body.style.maxHeight = collapsed ? "0" : `${body.scrollHeight}px`;
  };

  window.expandAllGroups = () => {
    for (const card of $$(".group-card")) {
      card.classList.remove("collapsed");
      const body = card.querySelector(".group-body");
      if (body) body.style.maxHeight = `${body.scrollHeight}px`;
    }
  };

  window.collapseAllGroups = () => {
    for (const card of $$(".group-card")) {
      card.classList.add("collapsed");
      const body = card.querySelector(".group-body");
      if (body) body.style.maxHeight = "0";
    }
  };

  window.switchLang = (lang) => {
    setLanguage(lang);
    renderAll();
    updateStaticTexts();
    for (const b of $$(".lang-btn")) {
      b.classList.toggle("active", b.dataset.lang === lang);
    }
    for (const b of $$("#mobile-lang-menu .mdui-menu-item")) {
      b.classList.toggle("active", b.dataset.lang === lang);
    }
  };

  const updateStaticTexts = () => {
    const map = {
      "search-input": ["placeholder", t("ui.search")],
      "expand-all-text": ["textContent", t("ui.expandAll")],
      "collapse-all-text": ["textContent", t("ui.collapseAll")],
      "services-heading": ["textContent", t("services.title")],
      "footer-powered": ["textContent", t("footer.poweredBy")],
    };
    for (const [id, [prop, val]] of Object.entries(map)) {
      const el = $(id);
      if (el) el[prop] = val;
    }
  };

  // ── 初始化 ──

  const init = () => {
    detectLanguage();
    document.documentElement.lang = getLanguage();

    if (localStorage.getItem("status_theme") === "dark") {
      document.body.classList.add("dark-mode");
      const icon = $("theme-icon");
      if (icon) icon.textContent = "light_mode";
    }

    for (const b of $$(".lang-btn")) {
      b.classList.toggle("active", b.dataset.lang === getLanguage());
    }

    renderAll();
    updateStaticTexts();

    refreshTimer = setInterval(renderAll, REFRESH_INTERVAL * 1000);
    startCountdown();

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (statusData?.groups) {
          for (const g of statusData.groups) {
            for (const s of g.sites) {
              drawResponseChart(g.name, s.name);
            }
          }
          bindChartTooltips();
        }
      }, 200);
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") clearSearch();
        return;
      }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); refreshData(); }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); toggleTheme(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); toggleSearch(); }
    });

    $("group-toolbar")?.classList.add("show");
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
