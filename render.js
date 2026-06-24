/**
 * ============================================
 *  Sukiing 服务状态 — 前端渲染引擎
 *  全部使用 MDUI 组件，纯原生 JS
 * ============================================
 */

(function () {
  "use strict";

  var statusData = null;
  var historyData = null;
  var refreshTimer = null;
  var countdownTimer = null;
  var countdownSec = 60;
  var REFRESH_INTERVAL = 60;
  var _searchQuery = "";
  var _tooltipAbort = null;

  // ── 数据加载 ──

  async function loadData() {
    try {
      var s = await fetch("data/status.json?v=" + Date.now()).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      var h = await fetch("data/history.json?v=" + Date.now()).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      statusData = s;
      historyData = h;
      await mergeArchiveData();
    } catch (err) {
      console.error("数据加载失败:", err);
      statusData = null;
      historyData = null;
    }
  }

  async function mergeArchiveData() {
    try {
      var resp = await fetch("data/archive/manifest.json?v=" + Date.now());
      if (!resp.ok) return;
      var manifest = await resp.json();
      if (!manifest.files || !manifest.files.length) return;
      var archives = await Promise.all(manifest.files.map(function(f) {
        return fetch("data/archive/" + f + "?v=" + Date.now()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
      }));
      archives.forEach(function(arc) {
        if (!arc || !arc.sites) return;
        Object.keys(arc.sites).forEach(function(key) {
          if (!historyData.sites) historyData.sites = {};
          if (!historyData.sites[key]) historyData.sites[key] = { daily: [], responseTime: [], incidents: [], currentDown: null };
          var main = historyData.sites[key];
          if (arc.sites[key].daily) {
            var dates = new Set(main.daily.map(function(d) { return d.date; }));
            arc.sites[key].daily.forEach(function(d) { if (!dates.has(d.date)) main.daily.push(d); });
            main.daily.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
          }
          if (arc.sites[key].incidents) {
            var starts = new Set(main.incidents.map(function(i) { return i.start; }));
            arc.sites[key].incidents.forEach(function(i) { if (!starts.has(i.start)) main.incidents.push(i); });
            main.incidents.sort(function(a, b) { return a.start < b.start ? -1 : 1; });
          }
        });
      });
    } catch (e) {}
  }

  // ── 工具函数 ──

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function timeAgo(iso) {
    if (!iso) return "";
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 5) return t("ui.justNow");
    if (d < 60) return d + " " + t("ui.secondsAgo");
    if (d < 3600) return Math.floor(d / 60) + " " + t("ui.minutesAgo");
    if (d < 86400) return Math.floor(d / 3600) + " " + t("ui.hoursAgo");
    return new Date(iso).toLocaleString();
  }

  function getHistoryKey(g, s) { return g + "|" + s; }

  function parseHistoryKey(k) {
    var i = k.indexOf("|");
    return i === -1 ? [k, k] : [k.slice(0, i), k.slice(i + 1)];
  }

  function uptimeColor(u) {
    if (u >= 99.5) return "#22c55e";
    if (u >= 95) return "#86efac";
    if (u >= 50) return "#fbbf24";
    return "#ef4444";
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + "ms";
    if (ms < 60000) return Math.floor(ms / 1000) + "s";
    if (ms < 3600000) return Math.floor(ms / 60000) + "m";
    return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
  }

  function isDark() { return document.body.classList.contains("dark-mode"); }

  function statusBadge(type) {
    var map = {
      operational: { icon: "check_circle", color: "green", text: t("status.operational") },
      partial: { icon: "warning", color: "amber", text: t("status.partial") },
      major: { icon: "error", color: "red", text: t("status.major") }
    };
    var s = map[type] || map.operational;
    return '<i class="mdui-icon material-icons mdui-text-color-' + s.color + '-400" style="font-size:48px">' + s.icon + '</i>';
  }

  // ── 渲染：总状态 ──

  function renderOverallStatus() {
    var el = document.getElementById("overall-status");
    if (!el) return;

    if (!statusData || !statusData.groups || !statusData.groups.length) {
      el.innerHTML =
        '<div class="mdui-card mdui-shadow-1" style="text-align:center;padding:36px 20px 28px">' +
          statusBadge("operational") +
          '<div style="font-size:20px;font-weight:700;margin:12px 0 6px">' + t("ui.noData") + '</div>' +
          '<div style="font-size:12px;opacity:0.5">' + t("ui.waitingFirstCheck") + '</div>' +
        '</div>';
      return;
    }

    var o = statusData.overallStatus || "operational";
    var textMap = { operational: t("status.operational"), partial: t("status.partial"), major: t("status.major") };
    var colorMap = { operational: "green", partial: "amber", major: "red" };
    var c = colorMap[o];

    el.innerHTML =
      '<div class="mdui-card mdui-shadow-1 fade-in" style="text-align:center;padding:36px 20px 28px;border-top:3px solid">' +
        '<div style="border-top-color:var(--' + c + '-color, #' + { green: "22c55e", amber: "f59e0b", red: "ef4444" }[c] + ');margin-top:-3px">' +
        statusBadge(o) +
        '<div style="font-size:22px;font-weight:700;margin:12px 0 10px">' + textMap[o] + '</div>' +
        '<div style="display:flex;justify-content:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
          '<span class="mdui-chip"><span class="mdui-chip-title mdui-text-color-green-400">' + (statusData.upSites || 0) + ' ' + t("ui.online") + '</span></span>' +
          '<span class="mdui-chip"><span class="mdui-chip-title mdui-text-color-red-400">' + ((statusData.totalSites || 0) - (statusData.upSites || 0)) + ' ' + t("ui.offline") + '</span></span>' +
          '<span class="mdui-chip"><span class="mdui-chip-title">' + (statusData.totalSites || 0) + ' ' + t("ui.total") + '</span></span>' +
        '</div>' +
        '<div style="font-size:12px;opacity:0.4">' + t("ui.lastUpdate") + '：' + timeAgo(statusData.lastUpdate) + '</div>' +
        '</div>' +
      '</div>';
  }

  // ── 渲染：分组列表 ──

  function renderGroups() {
    var el = document.getElementById("groups");
    if (!el) return;

    if (!statusData || !statusData.groups || !statusData.groups.length) {
      el.innerHTML = '<div class="mdui-card mdui-shadow-1" style="text-align:center;padding:48px 20px"><i class="mdui-icon material-icons" style="font-size:40px;opacity:0.15">hourglass_empty</i><p style="font-size:13px;opacity:0.4;margin-top:8px">' + t("ui.noData") + '</p></div>';
      return;
    }

    var html = "";
    statusData.groups.forEach(function(group, idx) {
      var on = group.sites.filter(function(s) { return s.status === "up"; }).length;
      var tot = group.sites.length;
      var countClass = on < tot ? "mdui-text-color-red-400" : "mdui-text-color-green-400";

      html += '<div class="mdui-card mdui-shadow-1 mdui-m-b-2 fade-in" style="animation-delay:' + (idx * 0.06) + 's">';
      html += '<div class="mdui-collapse-item mdui-collapse-item-open">';
      html += '<div class="mdui-collapse-item-header" style="padding:12px 16px">';
      html += '<i class="mdui-icon material-icons" style="font-size:20px;margin-right:8px;opacity:0.4">' + esc(group.icon || "dns") + '</i>';
      html += '<span style="font-size:14px;font-weight:600;flex:1">' + esc(group.name) + '</span>';
      html += '<span class="' + countClass + '" style="font-size:12px;font-weight:600;margin-right:8px">' + on + "/" + tot + " " + t("ui.online") + '</span>';
      html += '</div>';
      html += '<div class="mdui-collapse-item-body">';
      html += '<div class="mdui-divider"></div>';
      html += renderSites(group);
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    el.innerHTML = html;

    // 初始化折叠
    var collapse = el.querySelector('.mdui-collapse-item');
    if (collapse) new mdui.Collapse(el);

    requestAnimationFrame(function() {
      statusData.groups.forEach(function(group) {
        group.sites.forEach(function(site) { drawResponseChart(group.name, site.name); });
      });
      bindChartTooltips();
    });
  }

  function renderSites(group) {
    var html = "";
    group.sites.forEach(function(site) {
      var isUp = site.status === "up";
      var histKey = getHistoryKey(group.name, site.name);
      var hist = historyData && historyData.sites && historyData.sites[histKey];

      var uptime30d = 100;
      if (hist && hist.daily && hist.daily.length) {
        var tc = 0, tp = 0;
        hist.daily.forEach(function(d) { tc += d.checks; tp += d.passes; });
        uptime30d = tc > 0 ? parseFloat(((tp / tc) * 100).toFixed(2)) : 100;
      }

      var uptimeBarHTML = buildUptimeBar(hist);

      var sslHTML = "";
      if (site.sslDaysLeft >= 0) {
        var cls = site.sslDaysLeft <= 30 ? "mdui-color-orange-400" : "mdui-color-green-400";
        sslHTML = '<span class="mdui-chip" style="height:20px;margin-left:4px"><span class="mdui-chip-title ' + cls + '" style="font-size:10px"><i class="mdui-icon material-icons" style="font-size:11px">lock</i> ' + site.sslDaysLeft + 'd</span></span>';
      }

      var canvasId = ("chart-" + group.name + "-" + site.name).replace(/[^a-zA-Z0-9-]/g, "_");
      var rtStats = calcResponseStats(hist);
      var visible = !_searchQuery || site.name.toLowerCase().indexOf(_searchQuery.toLowerCase()) !== -1;

      var rtColor = isUp ? "" : "mdui-text-color-red-400";
      var dotColor = isUp ? "mdui-color-green-400" : "mdui-color-red-400";
      var uptimeColorStr = uptimeColor(uptime30d);

      html += '<div class="site-item mdui-p-x-3" data-site-name="' + esc(site.name.toLowerCase()) + '" style="' + (visible ? '' : 'display:none') + 'padding:10px 16px;border-top:1px solid rgba(0,0,0,0.06)">';

      // 站点行
      html += '<div style="display:flex;align-items:center;justify-content:space-between">';
      html += '<div style="display:flex;align-items:center;gap:8px;min-width:0">';
      html += '<span class="site-dot ' + (isUp ? "dot-up" : "dot-down") + '" style="background:currentColor;color:' + (isUp ? "#22c55e" : "#ef4444") + '"></span>';
      html += '<a class="mdui-text-color-black-text site-link" href="' + esc(site.url) + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(site.name) + '</a>';
      html += sslHTML;
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0">';
      html += '<span style="font-size:13px;font-weight:700;color:' + uptimeColorStr + ';font-variant-numeric:tabular-nums">' + uptime30d.toFixed(2) + '%</span>';
      html += '<span class="' + rtColor + '" style="font-size:11px;opacity:0.5;min-width:48px;text-align:right;font-variant-numeric:tabular-nums">' + (isUp ? site.responseTime + "ms" : t("ui.offline")) + '</span>';
      html += '</div>';
      html += '</div>';

      // 响应时间统计
      if (rtStats) {
        html += '<div style="display:flex;gap:14px;padding:2px 0 2px 16px;font-size:10px;opacity:0.35;font-variant-numeric:tabular-nums">';
        html += '<span>' + t("ui.min") + ' ' + rtStats.min + 'ms</span>';
        html += '<span>' + t("ui.avg") + ' ' + rtStats.avg + 'ms</span>';
        html += '<span>' + t("ui.max") + ' ' + rtStats.max + 'ms</span>';
        html += '</div>';
      }

      // 30天色块
      html += '<div class="uptime-bar-wrap">' + uptimeBarHTML + '</div>';

      // 图表
      html += '<div class="chart-container"><canvas id="' + canvasId + '" class="response-chart" data-group="' + esc(group.name) + '" data-site="' + esc(site.name) + '"></canvas><div class="chart-tooltip" id="tip-' + canvasId + '"></div></div>';

      html += '</div>';
    });
    return html;
  }

  function calcResponseStats(hist) {
    if (!hist || !hist.responseTime || hist.responseTime.length < 3) return null;
    var vals = hist.responseTime.map(function(d) { return d.value; });
    var min = vals[0], max = vals[0], sum = 0;
    vals.forEach(function(v) { if (v < min) min = v; if (v > max) max = v; sum += v; });
    return { min: min, max: max, avg: Math.round(sum / vals.length) };
  }

  function buildUptimeBar(hist) {
    if (!hist || !hist.daily || !hist.daily.length) {
      var e = "";
      for (var i = 0; i < 30; i++) e += '<div class="uptime-day empty"></div>';
      return e;
    }
    var days = hist.daily.slice(-30);
    var h = "";
    days.forEach(function(d) {
      h += '<div class="uptime-day" style="background:' + uptimeColor(d.uptime) + '" title="' + d.date + ': ' + d.uptime + '%"></div>';
    });
    var m = 30 - days.length;
    for (var j = 0; j < m; j++) h = '<div class="uptime-day empty"></div>' + h;
    return h;
  }

  // ── Canvas 图表 ──

  function drawResponseChart(groupName, siteName) {
    var canvasId = ("chart-" + groupName + "-" + siteName).replace(/[^a-zA-Z0-9-]/g, "_");
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var histKey = getHistoryKey(groupName, siteName);
    var hist = historyData && historyData.sites && historyData.sites[histKey];
    var data = (hist && hist.responseTime) || [];

    if (data.length < 2) { canvas.style.display = "none"; return; }
    canvas.style.display = "block";

    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var W = rect.width, H = rect.height;
    var pad = { top: 12, right: 12, bottom: 24, left: 44 };
    var cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;

    var values = data.map(function(d) { return d.value; });
    var maxVal = Math.max.apply(null, values.concat([100]));
    maxVal = Math.ceil(maxVal / 50) * 50;
    if (maxVal < 100) maxVal = 100;

    var dk = isDark();
    var gc = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    var tc = dk ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    var lc = dk ? "#666" : "#bbb";
    var ft = dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";
    var fb = dk ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)";

    ctx.clearRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = gc; ctx.lineWidth = 0.5;
    ctx.fillStyle = tc; ctx.font = "10px system-ui"; ctx.textAlign = "right";
    for (var i = 0; i <= 4; i++) {
      var y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i) + "", pad.left - 6, y + 3);
    }

    // X轴
    ctx.textAlign = "center";
    var step = Math.max(1, Math.floor(data.length / 5));
    for (var j = 0; j < data.length; j += step) {
      var x = pad.left + (cw / (data.length - 1)) * j;
      var dd = new Date(data[j].time);
      ctx.fillText(dd.getHours().toString().padStart(2, "0") + ":" + dd.getMinutes().toString().padStart(2, "0"), x, H - 4);
    }

    // 点坐标
    var pts = data.map(function(d, idx) {
      return { x: pad.left + (cw / (data.length - 1)) * idx, y: pad.top + ch - (d.value / maxVal) * ch, value: d.value, time: d.time };
    });

    // 贝塞尔曲线
    ctx.beginPath(); ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var k = 1; k < pts.length; k++) {
      var cpx = (pts[k - 1].x + pts[k].x) / 2;
      ctx.bezierCurveTo(cpx, pts[k - 1].y, cpx, pts[k].y, pts[k].x, pts[k].y);
    }
    ctx.stroke();

    // 填充
    var lp = pts[pts.length - 1];
    ctx.lineTo(lp.x, pad.top + ch); ctx.lineTo(pts[0].x, pad.top + ch); ctx.closePath();
    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, ft); grad.addColorStop(1, fb);
    ctx.fillStyle = grad; ctx.fill();

    // 最新点
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = lc; ctx.fill();
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = dk ? "#1a1a1a" : "#fff"; ctx.fill();

    canvas._chartPts = pts;
    canvas._pad = pad;
    canvas._cw = cw;
  }

  function bindChartTooltips() {
    if (_tooltipAbort) _tooltipAbort.abort();
    _tooltipAbort = new AbortController();
    var signal = _tooltipAbort.signal;

    document.querySelectorAll(".response-chart").forEach(function(canvas) {
      if (!canvas._chartPts) return;
      var tip = document.getElementById("tip-" + canvas.id);
      if (!tip) return;

      canvas.addEventListener("mousemove", function(e) {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var pts = canvas._chartPts;
        if (!pts || pts.length < 2) return;
        var ratio = (mx - canvas._pad.left) / canvas._cw;
        var idx = Math.round(ratio * (pts.length - 1));
        if (idx < 0 || idx >= pts.length) { tip.style.opacity = "0"; return; }
        var pt = pts[idx];
        var d = new Date(pt.time);
        tip.innerHTML = "<strong>" + pt.value + "ms</strong><br>" + d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
        tip.style.opacity = "1";
        tip.style.left = pt.x + "px";
        tip.style.top = (pt.y - 34) + "px";
      }, { signal: signal });

      canvas.addEventListener("mouseleave", function() { tip.style.opacity = "0"; }, { signal: signal });
    });
  }

  // ── 渲染：事件历史 ──

  function renderIncidentHistory() {
    var el = document.getElementById("incident-history");
    if (!el || !historyData || !historyData.sites) return;

    var all = [];
    Object.keys(historyData.sites).forEach(function(key) {
      var parts = parseHistoryKey(key);
      (historyData.sites[key].incidents || []).forEach(function(inc) {
        if (inc.end) all.push({ start: inc.start, end: inc.end, reason: inc.reason, duration: inc.duration, siteName: parts[1], groupName: parts[0] });
      });
    });

    if (!all.length) { el.innerHTML = ""; el.style.display = "none"; return; }

    all.sort(function(a, b) { return new Date(b.start) - new Date(a.start); });
    var recent = all.slice(0, 10);

    var html = '<div class="mdui-card mdui-shadow-1 mdui-m-t-2">';
    html += '<div class="mdui-card-primary" style="padding:14px 16px 8px"><div class="mdui-card-primary-title" style="font-size:15px"><i class="mdui-icon material-icons" style="font-size:20px;vertical-align:middle;margin-right:6px">history</i>' + t("incidents.title") + '</div></div>';
    html += '<div class="mdui-list">';
    recent.forEach(function(inc) {
      html += '<li class="mdui-list-item mdui-ripple" style="min-height:56px">';
      html += '<i class="mdui-list-item-icon mdui-icon material-icons mdui-text-color-amber-400" style="font-size:16px">fiber_manual_record</i>';
      html += '<div class="mdui-list-item-content">';
      html += '<div class="mdui-list-item-title" style="font-size:13px">' + esc(inc.siteName) + ' <span style="opacity:0.35;font-size:11px">' + esc(inc.groupName) + '</span></div>';
      html += '<div class="mdui-list-item-text" style="font-size:12px">' + (esc(inc.reason) || t("ui.unknown")) + '</div>';
      html += '<div class="mdui-list-item-text" style="font-size:11px;opacity:0.4">' + new Date(inc.start).toLocaleString() + ' · ' + formatDuration(inc.duration) + '</div>';
      html += '</div></li>';
    });
    html += '</div></div>';

    el.style.display = "block";
    el.innerHTML = html;
  }

  // ── 渲染：服务列表 ──

  function renderServices() {
    var el = document.getElementById("services-list");
    if (!el || !statusData || !statusData.groups) return;

    var html = '<div class="mdui-list">';
    statusData.groups.forEach(function(group) {
      html += '<li class="mdui-list-item" style="min-height:auto;padding:8px 16px 4px"><div class="mdui-list-item-content"><span style="font-size:11px;font-weight:700;opacity:0.35;text-transform:uppercase;letter-spacing:0.5px">' + esc(group.name) + '</span></div></li>';
      group.sites.forEach(function(site) {
        var isUp = site.status === "up";
        var label = isUp ? t("services.operational") : t("services.down");
        var color = isUp ? "green" : "red";
        html += '<li class="mdui-list-item" style="min-height:40px">';
        html += '<div class="mdui-list-item-content"><span style="font-size:13px">' + esc(site.name) + '</span></div>';
        html += '<span class="mdui-chip" style="height:22px"><span class="mdui-chip-title mdui-text-color-' + color + '-400" style="font-size:11px"><i class="mdui-icon material-icons" style="font-size:8px">fiber_manual_record</i> ' + label + '</span></span>';
        html += '</li>';
      });
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ── 渲染：公告横幅 ──

  function renderBanner() {
    var el = document.getElementById("incident-banner");
    if (!el || !statusData) return;

    var down = [];
    (statusData.groups || []).forEach(function(g) {
      (g.sites || []).forEach(function(s) { if (s.status !== "up") down.push(s); });
    });

    if (!down.length) { el.style.display = "none"; return; }

    el.style.display = "block";
    el.innerHTML = '<div class="mdui-card mdui-color-amber-100 mdui-shadow-1 mdui-m-b-2 fade-in" style="padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:8px">' +
      '<i class="mdui-icon material-icons mdui-text-color-amber-800">warning</i>' +
      '<span class="mdui-text-color-amber-900"><strong>' + t("banner.activeIncident") + '</strong> — ' + down.map(function(s) { return esc(s.name); }).join(", ") + '</span></div>';
  }

  // ── 渲染全部 ──

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
    var el = document.getElementById("loading-overlay");
    if (el) el.style.display = show ? "flex" : "none";
  }

  function updateLastRefresh() {
    var el = document.getElementById("last-refresh-text");
    if (el && statusData && statusData.lastUpdate) el.textContent = timeAgo(statusData.lastUpdate);
  }

  function startCountdown() {
    var el = document.getElementById("countdown-text");
    countdownTimer = setInterval(function() {
      countdownSec--;
      if (countdownSec < 0) countdownSec = 0;
      if (el) el.textContent = countdownSec + "s";
    }, 1000);
  }

  // ── 交互 ──

  window.refreshData = function() {
    var btn = document.querySelector(".refresh-btn");
    if (btn) btn.classList.add("spinning");
    renderAll().then(function() {
      setTimeout(function() { if (btn) btn.classList.remove("spinning"); }, 500);
    });
  };

  window.toggleTheme = function() {
    document.body.classList.toggle("dark-mode");
    var dk = isDark();
    localStorage.setItem("status_theme", dk ? "dark" : "light");
    if (statusData) {
      statusData.groups.forEach(function(g) {
        g.sites.forEach(function(s) { drawResponseChart(g.name, s.name); });
      });
      bindChartTooltips();
    }
    var icon = document.getElementById("theme-icon");
    if (icon) icon.textContent = dk ? "light_mode" : "dark_mode";
  };

  window.toggleSearch = function() {
    var bar = document.getElementById("search-bar");
    if (!bar) return;
    var vis = bar.style.display !== "none";
    bar.style.display = vis ? "none" : "block";
    if (!vis) {
      var input = document.getElementById("search-input");
      if (input) { input.value = ""; input.focus(); }
      _searchQuery = "";
    }
  };

  window.filterSites = function(q) {
    _searchQuery = q;
    document.querySelectorAll(".site-item").forEach(function(el) {
      var name = el.dataset.siteName || "";
      el.style.display = !q || name.indexOf(q.toLowerCase()) !== -1 ? "" : "none";
    });
  };

  window.clearSearch = function() {
    _searchQuery = "";
    var input = document.getElementById("search-input");
    if (input) input.value = "";
    filterSites("");
  };

  window.expandAllGroups = function() {
    document.querySelectorAll('.mdui-collapse-item').forEach(function(item) {
      item.classList.add('mdui-collapse-item-open');
    });
  };

  window.collapseAllGroups = function() {
    document.querySelectorAll('.mdui-collapse-item').forEach(function(item) {
      item.classList.remove('mdui-collapse-item-open');
    });
  };

  window.switchLang = function(lang) {
    setLanguage(lang);
    renderAll();
    updateStaticTexts();
    document.querySelectorAll(".lang-btn").forEach(function(b) { b.classList.toggle("active", b.dataset.lang === lang); });
    document.querySelectorAll("#mobile-lang-menu .mdui-menu-item").forEach(function(b) { b.classList.toggle("active", b.dataset.lang === lang); });
  };

  function updateStaticTexts() {
    var ids = {
      "search-input": ["placeholder", t("ui.search")],
      "expand-all-text": ["textContent", t("ui.expandAll")],
      "collapse-all-text": ["textContent", t("ui.collapseAll")],
      "services-heading": ["textContent", t("services.title")],
      "footer-powered": ["textContent", t("footer.poweredBy")],
      "footer-refresh-hint": ["textContent", t("ui.refresh")],
      "footer-theme-hint": ["textContent", t("ui.darkMode")]
    };
    Object.keys(ids).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el[ids[id][0]] = ids[id][1];
    });
  }

  // ── 初始化 ──

  function init() {
    detectLanguage();
    document.documentElement.lang = getLanguage();

    if (localStorage.getItem("status_theme") === "dark") {
      document.body.classList.add("dark-mode");
      var icon = document.getElementById("theme-icon");
      if (icon) icon.textContent = "light_mode";
    }

    document.querySelectorAll(".lang-btn").forEach(function(b) { b.classList.toggle("active", b.dataset.lang === getLanguage()); });

    renderAll();
    updateStaticTexts();

    refreshTimer = setInterval(renderAll, REFRESH_INTERVAL * 1000);
    startCountdown();

    var resizeTimer;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (statusData) {
          statusData.groups.forEach(function(g) { g.sites.forEach(function(s) { drawResponseChart(g.name, s.name); }); });
          bindChartTooltips();
        }
      }, 200);
    });

    document.addEventListener("keydown", function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") { if (e.key === "Escape") clearSearch(); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); refreshData(); }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); toggleTheme(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); toggleSearch(); }
    });

    document.getElementById("group-toolbar").style.display = "block";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
