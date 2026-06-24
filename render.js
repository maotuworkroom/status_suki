/**
 * ============================================
 *  前端渲染引擎 — 纯原生 JS，无任何框架依赖
 *  读取 data/status.json + data/history.json
 *  使用 MDUI 组件 + Canvas 图表渲染全部 UI
 * ============================================
 */

(function () {
  "use strict";

  // ── 全局状态 ──────────────────────────────
  let statusData = null;
  let historyData = null;
  let refreshTimer = null;
  let countdownTimer = null;
  let countdownSec = 60;
  const REFRESH_INTERVAL = 60;
  let _searchQuery = "";
  let _tooltipAbort = null; // 用于取消旧的 tooltip 监听器

  // ── 数据加载（支持归档文件合并）──────────

  async function loadData() {
    try {
      const [s, h] = await Promise.all([
        fetch("data/status.json?v=" + Date.now()).then((r) => {
          if (!r.ok) throw new Error("status.json " + r.status);
          return r.json();
        }),
        fetch("data/history.json?v=" + Date.now()).then((r) => {
          if (!r.ok) throw new Error("history.json " + r.status);
          return r.json();
        }),
      ]);
      statusData = s;
      historyData = h;

      // 尝试加载归档清单，合并归档数据
      await mergeArchiveData();
    } catch (err) {
      console.error("数据加载失败:", err);
      statusData = null;
      historyData = null;
    }
  }

  /**
   * 读取 data/archive/manifest.json，加载所有归档文件
   * 将归档中的 daily / responseTime / incidents 合并到 historyData
   */
  async function mergeArchiveData() {
    try {
      const manifestResp = await fetch("data/archive/manifest.json?v=" + Date.now());
      if (!manifestResp.ok) return; // 没有归档文件，正常退出
      const manifest = await manifestResp.json();
      if (!manifest.files || manifest.files.length === 0) return;

      // 并行加载所有归档文件
      const archivePromises = manifest.files.map((fileName) =>
        fetch("data/archive/" + fileName + "?v=" + Date.now())
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
      const archives = await Promise.all(archivePromises);

      // 合并每个归档文件的数据到 historyData
      for (const archive of archives) {
        if (!archive || !archive.sites) continue;
        for (const [key, archSite] of Object.entries(archive.sites)) {
          if (!historyData.sites) historyData.sites = {};
          if (!historyData.sites[key]) {
            historyData.sites[key] = {
              daily: [],
              responseTime: [],
              incidents: [],
              currentDown: null,
            };
          }
          const mainSite = historyData.sites[key];

          // 合并 daily（按日期去重）
          if (archSite.daily?.length) {
            const existingDates = new Set(mainSite.daily.map((d) => d.date));
            for (const d of archSite.daily) {
              if (!existingDates.has(d.date)) {
                mainSite.daily.push(d);
              }
            }
            mainSite.daily.sort((a, b) => a.date.localeCompare(b.date));
          }

          // 合并 incidents（按 start 去重）
          if (archSite.incidents?.length) {
            const existingStarts = new Set(mainSite.incidents.map((i) => i.start));
            for (const inc of archSite.incidents) {
              if (!existingStarts.has(inc.start)) {
                mainSite.incidents.push(inc);
              }
            }
            mainSite.incidents.sort((a, b) => a.start.localeCompare(b.start));
          }

          // responseTime 不合并到图表（归档数据量太大，图表只用主文件的近期数据）
          // 但保留归档数据用于计算长期可用率
        }
      }
    } catch (err) {
      console.warn("归档数据加载跳过:", err.message);
    }
  }

  // ── 工具函数 ──────────────────────────────

  /** HTML 转义，防止 XSS */
  function esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function timeAgo(isoStr) {
    if (!isoStr) return "";
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 5) return t("ui.justNow");
    if (diff < 60) return `${diff} ${t("ui.secondsAgo")}`;
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t("ui.minutesAgo")}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ${t("ui.hoursAgo")}`;
    return new Date(isoStr).toLocaleString();
  }

  function getHistoryKey(groupName, siteName) {
    return `${groupName}|${siteName}`;
  }

  function uptimeColor(uptime) {
    if (uptime >= 99.5) return "#22c55e";
    if (uptime >= 95) return "#86efac";
    if (uptime >= 50) return "#fbbf24";
    return "#ef4444";
  }

  function statusIconSVG(type) {
    if (type === "operational") {
      return `<svg class="status-icon-svg green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.15" fill="currentColor"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    }
    if (type === "partial") {
      return `<svg class="status-icon-svg yellow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.15" fill="currentColor"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    }
    return `<svg class="status-icon-svg red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.15" fill="currentColor"/><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  }

  /** 安全拆分 history key "group|site"，允许名称中含 | */
  function parseHistoryKey(key) {
    const idx = key.indexOf("|");
    if (idx === -1) return [key, key];
    return [key.slice(0, idx), key.slice(idx + 1)];
  }
  function formatDuration(ms) {
    if (ms < 1000) return ms + "ms";
    if (ms < 60000) return Math.floor(ms / 1000) + "s";
    if (ms < 3600000) return Math.floor(ms / 60000) + "m";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h + "h " + m + "m";
  }

  /** 获取 isDark 状态 */
  function isDark() {
    return document.body.classList.contains("mdui-theme-layout-dark");
  }

  // ── 渲染：总状态横幅 ──────────────────────

  function renderOverallStatus() {
    const el = document.getElementById("overall-status");
    if (!el) return;

    if (!statusData || !statusData.groups || statusData.groups.length === 0) {
      el.className = "overall-status operational";
      el.innerHTML = `
        <div class="overall-icon">${statusIconSVG("operational")}</div>
        <div class="overall-text">${t("ui.noData")}</div>
        <div class="overall-time">${t("ui.waitingFirstCheck")}</div>
      `;
      return;
    }

    const overall = statusData.overallStatus || "operational";
    const textMap = {
      operational: t("status.operational"),
      partial: t("status.partial"),
      major: t("status.major"),
    };

    el.className = `overall-status ${overall} fade-in`;
    el.innerHTML = `
      <div class="overall-icon">${statusIconSVG(overall)}</div>
      <div class="overall-text">${textMap[overall]}</div>
      <div class="overall-stats">
        <span class="stat-pill up">${statusData.upSites || 0} ${t("ui.online")}</span>
        <span class="stat-pill down">${(statusData.totalSites || 0) - (statusData.upSites || 0)} ${t("ui.offline")}</span>
        <span class="stat-pill total">${statusData.totalSites || 0} ${t("ui.total")}</span>
      </div>
      <div class="overall-time">${t("ui.lastUpdate")}：${timeAgo(statusData.lastUpdate)}</div>
    `;
  }

  // ── 渲染：分组列表 ────────────────────────

  function renderGroups() {
    const el = document.getElementById("groups");
    if (!el) return;

    if (!statusData || !statusData.groups || statusData.groups.length === 0) {
      el.innerHTML = `
        <div class="no-data fade-in">
          <i class="mdui-icon material-icons">hourglass_empty</i>
          <p>${t("ui.noData")}</p>
        </div>
      `;
      return;
    }

    let html = "";
    let idx = 0;

    for (const group of statusData.groups) {
      const onlineCount = group.sites.filter((s) => s.status === "up").length;
      const totalCount = group.sites.length;

      html += `
        <div class="group-card fade-in" style="animation-delay:${idx * 0.08}s">
          <div class="group-header" onclick="toggleGroup(this)">
            <div class="group-header-left">
              <i class="mdui-icon material-icons group-icon">${esc(group.icon) || "dns"}</i>
              <span class="group-name">${esc(group.name)}</span>
            </div>
            <div class="group-header-right">
              <span class="group-count ${onlineCount < totalCount ? 'has-offline' : ''}">${t("ui.group.online", { online: onlineCount, total: totalCount })}</span>
              <i class="mdui-icon material-icons group-arrow">expand_more</i>
            </div>
          </div>
          <div class="group-body open">
            ${renderSites(group)}
          </div>
        </div>
      `;
      idx++;
    }

    el.innerHTML = html;

    requestAnimationFrame(() => {
      for (const group of statusData.groups) {
        for (const site of group.sites) {
          drawResponseChart(group.name, site.name);
        }
      }
      bindChartTooltips();
    });
  }

  function renderSites(group) {
    let html = "";

    for (const site of group.sites) {
      const isUp = site.status === "up";
      const histKey = getHistoryKey(group.name, site.name);
      const hist = historyData?.sites?.[histKey];

      let uptime30d = 100;
      if (hist?.daily?.length) {
        const totalChecks = hist.daily.reduce((s, d) => s + d.checks, 0);
        const totalPasses = hist.daily.reduce((s, d) => s + d.passes, 0);
        uptime30d = totalChecks > 0
          ? parseFloat(((totalPasses / totalChecks) * 100).toFixed(2))
          : 100;
      }

      const uptimeBarHTML = buildUptimeBar(hist);

      let sslHTML = "";
      if (site.sslDaysLeft >= 0) {
        const cls = site.sslDaysLeft <= 30 ? "ssl-warn" : "ssl-ok";
        sslHTML = `<span class="ssl-badge ${cls}" title="${t("ui.sslExpiring", { days: site.sslDaysLeft })}">
          <i class="mdui-icon material-icons" style="font-size:12px">lock</i> ${site.sslDaysLeft}d
        </span>`;
      }

      const canvasId = `chart-${group.name}-${site.name}`.replace(/[^a-zA-Z0-9-]/g, "_");

      // 响应时间统计
      const rtStats = calcResponseStats(hist);

      // 搜索过滤标记
      const siteVisible = !_searchQuery || site.name.toLowerCase().includes(_searchQuery.toLowerCase());

      html += `
        <div class="site-item" data-site-name="${esc(site.name.toLowerCase())}" style="${siteVisible ? '' : 'display: none'}">
          <div class="site-row">
            <div class="site-left">
              <span class="site-status-dot ${isUp ? "up pulse" : "down pulse-red"}"></span>
              <a class="site-name site-link" href="${esc(site.url)}" target="_blank" rel="noopener" title="${esc(t("ui.viewSite") + ": " + site.url)}">${esc(site.name)}</a>
              ${sslHTML}
            </div>
            <div class="site-right">
              <span class="site-uptime" style="color: ${uptimeColor(uptime30d)}">${uptime30d.toFixed(2)}%</span>
              <span class="site-rt ${isUp ? "" : "rt-offline"}">${isUp ? site.responseTime + "ms" : t("ui.offline")}</span>
            </div>
          </div>
          ${rtStats ? `<div class="rt-stats"><span>${t("ui.min")} ${rtStats.min}ms</span><span>${t("ui.avg")} ${rtStats.avg}ms</span><span>${t("ui.max")} ${rtStats.max}ms</span></div>` : ''}
          <div class="uptime-bar-wrap" title="${t("chart.uptime30d")}">
            ${uptimeBarHTML}
          </div>
          <div class="chart-container">
            <canvas id="${canvasId}" class="response-chart" data-group="${esc(group.name)}" data-site="${esc(site.name)}"></canvas>
            <div class="chart-tooltip" id="tip-${canvasId}"></div>
          </div>
        </div>
      `;
    }

    return html;
  }

  /** 计算响应时间统计 */
  function calcResponseStats(hist) {
    if (!hist?.responseTime?.length || hist.responseTime.length < 3) return null;
    const vals = hist.responseTime.map((d) => d.value);
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    };
  }

  /** 构建近 30 天可用性色块条形图 */
  function buildUptimeBar(hist) {
    if (!hist?.daily?.length) {
      let empty = "";
      for (let i = 0; i < 30; i++) {
        empty += `<div class="uptime-day empty" title="${t("ui.noData")}"></div>`;
      }
      return empty;
    }

    const days = hist.daily.slice(-30);
    let html = "";

    for (const day of days) {
      const color = uptimeColor(day.uptime);
      const tip = `${day.date}\n${t("ui.uptime")}: ${day.uptime}%\n${t("ui.avgResponse")}: ${day.avgResponseTime || "-"}ms`;
      html += `<div class="uptime-day" style="background:${color}" data-tip="${tip}"></div>`;
    }

    const missing = 30 - days.length;
    for (let i = 0; i < missing; i++) {
      html = `<div class="uptime-day empty"></div>` + html;
    }

    return html;
  }

  // ── Canvas 图表绘制（平滑贝塞尔曲线）──────

  function drawResponseChart(groupName, siteName) {
    const canvasId = `chart-${groupName}-${siteName}`.replace(/[^a-zA-Z0-9-]/g, "_");
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const histKey = getHistoryKey(groupName, siteName);
    const hist = historyData?.sites?.[histKey];
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
    const pad = { top: 14, right: 14, bottom: 26, left: 46 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const values = data.map((d) => d.value);
    let maxVal = Math.max(...values, 100);
    maxVal = Math.ceil(maxVal / 50) * 50;
    if (maxVal < 100) maxVal = 100;

    const dk = isDark();
    const gridColor = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    const textColor = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
    const lineColor = dk ? "#60a5fa" : "#3b82f6";
    const fillColorTop = dk ? "rgba(96,165,250,0.18)" : "rgba(59,130,246,0.12)";
    const fillColorBot = dk ? "rgba(96,165,250,0.01)" : "rgba(59,130,246,0.01)";

    ctx.clearRect(0, 0, W, H);

    // 网格 + Y 轴
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = textColor;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const y = pad.top + (ch / yTicks) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = Math.round(maxVal - (maxVal / yTicks) * i);
      ctx.fillText(val + "", pad.left - 6, y + 3);
    }

    // X 轴
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(data.length / 5));
    for (let i = 0; i < data.length; i += step) {
      const x = pad.left + (cw / (data.length - 1)) * i;
      const d = new Date(data[i].time);
      const label = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
      ctx.fillText(label, x, H - 6);
    }

    // 计算点坐标
    const pts = data.map((d, i) => ({
      x: pad.left + (cw / (data.length - 1)) * i,
      y: pad.top + ch - (d.value / maxVal) * ch,
      value: d.value,
      time: d.time,
    }));

    // 平滑贝塞尔曲线
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.stroke();

    // 渐变填充
    const lastPt = pts[pts.length - 1];
    ctx.lineTo(lastPt.x, pad.top + ch);
    ctx.lineTo(pts[0].x, pad.top + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, fillColorTop);
    grad.addColorStop(1, fillColorBot);
    ctx.fillStyle = grad;
    ctx.fill();

    // 数据点
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 12))) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 2, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }

    // 最新点高亮
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = dk ? "#1e293b" : "#ffffff";
    ctx.fill();

    // 存储点数据用于 tooltip
    canvas._chartPts = pts;
    canvas._maxVal = maxVal;
    canvas._pad = pad;
    canvas._cw = cw;
  }

  // ── 图表 Tooltip ─────────────────────────

  function bindChartTooltips() {
    // 取消旧的事件监听器，防止泄漏
    if (_tooltipAbort) _tooltipAbort.abort();
    _tooltipAbort = new AbortController();
    const signal = _tooltipAbort.signal;

    document.querySelectorAll(".response-chart").forEach((canvas) => {
      if (!canvas._chartPts) return;

      const tooltipId = "tip-" + canvas.id;
      const tooltip = document.getElementById(tooltipId);
      if (!tooltip) return;

      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const pts = canvas._chartPts;
        if (!pts || pts.length < 2) return;

        const pad = canvas._pad;
        const cw = canvas._cw;
        const ratio = (mx - pad.left) / cw;
        const idx = Math.round(ratio * (pts.length - 1));
        if (idx < 0 || idx >= pts.length) {
          tooltip.style.opacity = "0";
          return;
        }

        const pt = pts[idx];
        const d = new Date(pt.time);
        const timeStr = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");

        tooltip.innerHTML = `<strong>${pt.value}ms</strong><br>${timeStr}`;
        tooltip.style.opacity = "1";
        tooltip.style.left = pt.x + "px";
        tooltip.style.top = (pt.y - 36) + "px";
      }, { signal });

      canvas.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
      }, { signal });
    });
  }

  // ── 渲染：事件历史 ────────────────────────

  function renderIncidentHistory() {
    const el = document.getElementById("incident-history");
    if (!el || !historyData?.sites) return;

    const allIncidents = [];
    for (const [key, siteHist] of Object.entries(historyData.sites)) {
      const [groupName, siteName] = parseHistoryKey(key);
      for (const inc of siteHist.incidents || []) {
        if (inc.end) {
          allIncidents.push({ ...inc, siteName, groupName });
        }
      }
    }

    if (allIncidents.length === 0) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }

    // 按时间倒序，取最近 10 条
    allIncidents.sort((a, b) => new Date(b.start) - new Date(a.start));
    const recent = allIncidents.slice(0, 10);

    let html = `<div class="incidents-title"><i class="mdui-icon material-icons">history</i> ${t("incidents.title")}</div>`;
    for (const inc of recent) {
      const startStr = new Date(inc.start).toLocaleString();
      const dur = formatDuration(inc.duration);
      html += `
        <div class="incident-row">
          <div class="incident-dot"></div>
          <div class="incident-info">
            <div class="incident-site">${esc(inc.siteName)} <span class="incident-group">${esc(inc.groupName)}</span></div>
            <div class="incident-detail">${esc(inc.reason) || t("ui.unknown")}</div>
            <div class="incident-time">${startStr} · ${dur}</div>
          </div>
        </div>
      `;
    }

    el.style.display = "block";
    el.innerHTML = html;
  }

  // ── 渲染：服务状态列表 ────────────────────

  function renderServices() {
    const el = document.getElementById("services-list");
    if (!el || !statusData?.groups) return;

    let html = "";
    for (const group of statusData.groups) {
      html += `<div class="service-group-title">${esc(group.name)}</div>`;
      for (const site of group.sites) {
        const isUp = site.status === "up";
        const statusLabel = isUp ? t("services.operational") : t("services.down");
        const statusClass = isUp ? "svc-up" : "svc-down";

        html += `
          <div class="service-row">
            <span class="service-name">${esc(site.name)}</span>
            <span class="service-status ${statusClass}">
              <span class="svc-dot ${isUp ? "svc-dot-up" : "svc-dot-down"}"></span>
              ${statusLabel}
            </span>
          </div>
        `;
      }
    }
    el.innerHTML = html;
  }

  // ── 渲染：公告横幅 ────────────────────────

  function renderBanner() {
    const el = document.getElementById("incident-banner");
    if (!el || !statusData) return;

    const downSites = [];
    for (const group of statusData.groups || []) {
      for (const site of group.sites || []) {
        if (site.status !== "up") downSites.push(site);
      }
    }

    if (downSites.length === 0) {
      el.style.display = "none";
      return;
    }

    el.style.display = "flex";
    el.className = "incident-banner fade-in";
    el.innerHTML = `
      <i class="mdui-icon material-icons">warning</i>
      <span><strong>${t("banner.activeIncident")}</strong> — ${downSites.map((s) => esc(s.name)).join(", ")}</span>
    `;
  }

  // ── 渲染全部 ──────────────────────────────

  async function renderAll() {
    showLoading(true);
    await loadData();
    renderOverallStatus();
    renderGroups();
    renderServices();
    renderBanner();
    renderIncidentHistory();
    updateLastRefresh();
    showLoading(false);
    countdownSec = REFRESH_INTERVAL;
  }

  function showLoading(show) {
    const el = document.getElementById("loading-overlay");
    if (el) el.style.display = show ? "flex" : "none";
  }

  function updateLastRefresh() {
    const el = document.getElementById("last-refresh-text");
    if (el && statusData?.lastUpdate) {
      el.textContent = `${t("ui.lastUpdate")}：${timeAgo(statusData.lastUpdate)}`;
    }
  }

  // ── 倒计时显示 ────────────────────────────

  function startCountdown() {
    const el = document.getElementById("countdown-text");
    countdownTimer = setInterval(() => {
      countdownSec--;
      if (countdownSec <= 0) countdownSec = 0;
      if (el) {
        el.textContent = countdownSec + "s";
      }
    }, 1000);
  }

  // ── 交互：分组折叠展开 ────────────────────

  window.toggleGroup = function (headerEl) {
    const body = headerEl.nextElementSibling;
    const arrow = headerEl.querySelector(".group-arrow");
    const isOpen = body.classList.contains("open");

    if (isOpen) {
      body.classList.remove("open");
      body.style.maxHeight = "0";
      arrow.style.transform = "rotate(0deg)";
    } else {
      body.classList.add("open");
      body.style.maxHeight = body.scrollHeight + "px";
      arrow.style.transform = "rotate(180deg)";
      // 折叠时 canvas 宽高为 0，展开后需重绘图表
      requestAnimationFrame(() => {
        body.querySelectorAll(".response-chart").forEach((canvas) => {
          const g = canvas.dataset.group;
          const s = canvas.dataset.site;
          if (g && s) drawResponseChart(g, s);
        });
      });
    }
  };

  // ── 交互：手动刷新 ────────────────────────

  window.refreshData = function () {
    const btn = document.querySelector(".refresh-btn");
    if (btn) btn.classList.add("spinning");
    renderAll().then(() => {
      setTimeout(() => {
        if (btn) btn.classList.remove("spinning");
      }, 600);
    });
  };

  // ── 交互：深色模式切换 ────────────────────

  window.toggleTheme = function () {
    const body = document.body;
    body.classList.toggle("mdui-theme-layout-dark");
    const dk = body.classList.contains("mdui-theme-layout-dark");
    localStorage.setItem("status_theme", dk ? "dark" : "light");

    if (statusData) {
      for (const group of statusData.groups || []) {
        for (const site of group.sites || []) {
          drawResponseChart(group.name, site.name);
        }
      }
      bindChartTooltips();
    }

    const icon = document.getElementById("theme-icon");
    if (icon) icon.textContent = dk ? "light_mode" : "dark_mode";
  };

  // ── 交互：搜索过滤 ────────────────────────

  window.toggleSearch = function () {
    const bar = document.getElementById("search-bar");
    if (!bar) return;
    const visible = bar.style.display !== "none";
    bar.style.display = visible ? "none" : "flex";
    if (!visible) {
      const input = document.getElementById("search-input");
      if (input) { input.value = ""; input.focus(); }
      _searchQuery = "";
    }
  };

  window.filterSites = function (query) {
    _searchQuery = query;
    document.querySelectorAll(".site-item").forEach((el) => {
      const name = el.dataset.siteName || "";
      el.style.display = !query || name.includes(query.toLowerCase()) ? "" : "none";
    });
    // 如果搜索为空，显示 "没有匹配" 提示
    const noResults = document.getElementById("no-results-msg");
    if (noResults) {
      const visible = document.querySelectorAll(".site-item:not([style*='display: none'])").length;
      noResults.style.display = visible === 0 && query ? "block" : "none";
    }
  };

  window.clearSearch = function () {
    _searchQuery = "";
    const input = document.getElementById("search-input");
    if (input) input.value = "";
    filterSites("");
  };

  // ── 交互：展开/收起全部 ──────────────────

  window.expandAllGroups = function () {
    document.querySelectorAll(".group-body").forEach((body) => {
      body.classList.add("open");
      body.style.maxHeight = body.scrollHeight + "px";
    });
    document.querySelectorAll(".group-arrow").forEach((a) => {
      a.style.transform = "rotate(180deg)";
    });
  };

  window.collapseAllGroups = function () {
    document.querySelectorAll(".group-body").forEach((body) => {
      body.classList.remove("open");
      body.style.maxHeight = "0";
    });
    document.querySelectorAll(".group-arrow").forEach((a) => {
      a.style.transform = "rotate(0deg)";
    });
  };

  // ── 交互：语言切换 ────────────────────────

  window.switchLang = function (lang) {
    setLanguage(lang);
    renderAll();
    updateStaticTexts();
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
    document.querySelectorAll(".mobile-lang-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
  };

  /** 更新 HTML 中硬编码的静态文本为当前语言 */
  function updateStaticTexts() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.placeholder = t("ui.search");
    const expandAll = document.getElementById("expand-all-text");
    if (expandAll) expandAll.textContent = t("ui.expandAll");
    const collapseAll = document.getElementById("collapse-all-text");
    if (collapseAll) collapseAll.textContent = t("ui.collapseAll");
    const servicesHeading = document.getElementById("services-heading");
    if (servicesHeading) servicesHeading.textContent = t("services.title");
    const footerText = document.getElementById("footer-text");
    if (footerText) footerText.textContent = t("footer.poweredBy") + " · © 2024";
    const refreshHint = document.getElementById("footer-refresh-hint");
    if (refreshHint) refreshHint.textContent = t("ui.refresh");
    const themeHint = document.getElementById("footer-theme-hint");
    if (themeHint) themeHint.textContent = t("ui.darkMode");
  }

  // ── 初始化 ────────────────────────────────

  function init() {
    detectLanguage();
    document.documentElement.lang = getLanguage();

    const savedTheme = localStorage.getItem("status_theme");
    if (savedTheme === "dark") {
      document.body.classList.add("mdui-theme-layout-dark");
      const icon = document.getElementById("theme-icon");
      if (icon) icon.textContent = "light_mode";
    }

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === getLanguage());
    });

    renderAll();

    // 更新 i18n 静态文本
    updateStaticTexts();

    refreshTimer = setInterval(() => {
      renderAll();
    }, REFRESH_INTERVAL * 1000);

    startCountdown();

    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (statusData) {
          for (const group of statusData.groups || []) {
            for (const site of group.sites || []) {
              drawResponseChart(group.name, site.name);
            }
          }
          bindChartTooltips();
        }
      }, 200);
    });

    // 键盘快捷键
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") clearSearch();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        refreshData();
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        toggleTheme();
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleSearch();
      }
    });

    // 显示分组工具栏
    const toolbar = document.getElementById("group-toolbar");
    if (toolbar) toolbar.style.display = "flex";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
