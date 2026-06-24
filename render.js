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

  function statusIcon(type) {
    var map = {
      operational: { icon: "check_circle", color: "#22C55E" },
      partial: { icon: "warning", color: "#F59E0B" },
      major: { icon: "error", color: "#EF4444" }
    };
    var s = map[type] || map.operational;
    return '<i class="mdui-icon material-icons" style="font-size:52px;color:' + s.color + '">' + s.icon + '</i>';
  }

  // ── 渲染：总状态 ──

  function renderOverallStatus() {
    var el = document.getElementById("overall-status");
    if (!el) return;

    if (!statusData || !statusData.groups || !statusData.groups.length) {
      el.innerHTML =
        '<div class="overall-card status-operational fade-in">' +
          statusIcon("operational") +
          '<div class="overall-title">' + t("ui.noData") + '</div>' +
          '<div style="font-size:12px;opacity:0.35">' + t("ui.waitingFirstCheck") + '</div>' +
        '</div>';
      return;
    }

    var o = statusData.overallStatus || "operational";
    var textMap = { operational: t("status.operational"), partial: t("status.partial"), major: t("status.major") };

    el.innerHTML =
      '<div class="overall-card status-' + o + ' fade-in">' +
        statusIcon(o) +
        '<div class="overall-title">' + textMap[o] + '</div>' +
        '<div class="overall-stats">' +
          '<span class="stat-chip green">' + (statusData.upSites || 0) + ' ' + t("ui.online") + '</span>' +
          '<span class="stat-chip red">' + ((statusData.totalSites || 0) - (statusData.upSites || 0)) + ' ' + t("ui.offline") + '</span>' +
          '<span class="stat-chip">' + (statusData.totalSites || 0) + ' ' + t("ui.total") + '</span>' +
        '</div>' +
        '<div class="overall-time">' + t("ui.lastUpdate") + '：' + timeAgo(statusData.lastUpdate) + '</div>' +
      '</div>';
  }

  // ── 渲染：分组列表 ──

  function renderGroups() {
    var el = document.getElementById("groups");
    if (!el) return;

    if (!statusData || !statusData.groups || !statusData.groups.length) {
      el.innerHTML =
        '<div class="group-card fade-in">' +
          '<div class="empty-state">' +
            '<i class="mdui-icon material-icons">hourglass_empty</i>' +
            '<p>' + t("ui.noData") + '</p>' +
          '</div>' +
        '</div>';
      return;
    }

    var html = "";
    statusData.groups.forEach(function(group, idx) {
      var on = group.sites.filter(function(s) { return s.status === "up"; }).length;
      var tot = group.sites.length;
      var countClass = on < tot ? "has-down" : "all-up";

      html += '<div class="group-card fade-in" style="animation-delay:' + (idx * 0.06) + 's">';
      html += '<div class="group-header" onclick="toggleGroup(this)">';
      html += '<div class="group-icon"><i class="mdui-icon material-icons">' + esc(group.icon || "dns") + '</i></div>';
      html += '<span class="group-name">' + esc(group.name) + '</span>';
      html += '<span class="group-count ' + countClass + '">' + on + "/" + tot + " " + t("ui.online") + '</span>';
      html += '<i class="mdui-icon material-icons group-chevron">expand_more</i>';
      html += '</div>';
      html += '<div class="group-body">';
      html += renderSites(group);
      html += '</div>';
      html += '</div>';
    });

    el.innerHTML = html;

    requestAnimationFrame(function() {
      // Set max-height for collapse animation
      el.querySelectorAll('.group-body').forEach(function(body) {
        body.style.maxHeight = body.scrollHeight + 'px';
      });
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
        var sslCls = site.sslDaysLeft <= 30 ? "warn" : "ok";
        sslHTML = '<span class="ssl-chip ' + sslCls + '"><i class="mdui-icon material-icons">lock</i>' + site.sslDaysLeft + 'd</span>';
      }

      var canvasId = ("chart-" + group.name + "-" + site.name).replace(/[^a-zA-Z0-9-]/g, "_");
      var rtStats = calcResponseStats(hist);
      var visible = !_searchQuery || site.name.toLowerCase().indexOf(_searchQuery.toLowerCase()) !== -1;

      var uptimeColorStr = uptimeColor(uptime30d);

      html += '<div class="site-item" data-site-name="' + esc(site.name.toLowerCase()) + '" style="' + (visible ? '' : 'display:none') + '">';

      // 站点行
      html += '<div class="site-row">';
      html += '<div class="site-left">';
      html += '<span class="site-dot ' + (isUp ? "up" : "down") + '"></span>';
      html += '<a class="site-name" href="' + esc(site.url) + '" target="_blank" rel="noopener">' + esc(site.name) + '</a>';
      html += sslHTML;
      html += '</div>';
      html += '<div class="site-right">';
      html += '<span class="site-uptime" style="color:' + uptimeColorStr + '">' + uptime30d.toFixed(2) + '%</span>';
      html += '<span class="site-rt' + (isUp ? '' : ' offline') + '">' + (isUp ? site.responseTime + "ms" : t("ui.offline")) + '</span>';
      html += '</div>';
      html += '</div>';

      // 响应时间统计
      if (rtStats) {
        html += '<div class="rt-stats">';
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
    var lc = dk ? "#F48FB1" : "#EC407A";
    var ft = dk ? "rgba(244,143,177,0.08)" : "rgba(236,64,126,0.06)";
    var fb = dk ? "rgba(244,143,177,0)" : "rgba(236,64,126,0)";

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

    var html = '<div class="incident-card fade-in">';
    html += '<div class="incident-card-title"><i class="mdui-icon material-icons">history</i>' + t("incidents.title") + '</div>';
    recent.forEach(function(inc) {
      html += '<div class="incident-item">';
      html += '<div class="incident-dot"></div>';
      html += '<div class="incident-info">';
      html += '<div class="incident-site">' + esc(inc.siteName) + '<span>' + esc(inc.groupName) + '</span></div>';
      html += '<div class="incident-reason">' + (esc(inc.reason) || t("ui.unknown")) + '</div>';
      html += '<div class="incident-time">' + new Date(inc.start).toLocaleString() + ' · ' + formatDuration(inc.duration) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';

    el.style.display = "block";
    el.innerHTML = html;
  }

  // ── 渲染：服务列表 ──

  function renderServices() {
    var el = document.getElementById("services-list");
    if (!el || !statusData || !statusData.groups) return;

    var html = '<div class="services-title" id="services-heading">' + t("services.title") + '</div>';
    statusData.groups.forEach(function(group) {
      html += '<div class="service-group-label">' + esc(group.name) + '</div>';
      group.sites.forEach(function(site) {
        var isUp = site.status === "up";
        var label = isUp ? t("services.operational") : t("services.down");
        var cls = isUp ? "up" : "down";
        html += '<div class="service-item">';
        html += '<span class="service-item-name">' + esc(site.name) + '</span>';
        html += '<span class="service-status-chip ' + cls + '"><i class="mdui-icon material-icons">fiber_manual_record</i>' + label + '</span>';
        html += '</div>';
      });
    });
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

    el.style.display = "flex";
    el.querySelector('span').innerHTML = '<strong>' + t("banner.activeIncident") + '</strong> — ' + down.map(function(s) { return esc(s.name); }).join(", ");
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
    var show = !bar.classList.contains("show");
    bar.classList.toggle("show", show);
    if (show) {
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

  window.toggleGroup = function(header) {
    var card = header.closest('.group-card');
    if (!card) return;
    var body = card.querySelector('.group-body');
    if (!body) return;
    var isCollapsed = card.classList.toggle('collapsed');
    if (isCollapsed) {
      body.style.maxHeight = '0';
    } else {
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  };

  window.expandAllGroups = function() {
    document.querySelectorAll('.group-card').forEach(function(card) {
      card.classList.remove('collapsed');
      var body = card.querySelector('.group-body');
      if (body) body.style.maxHeight = body.scrollHeight + 'px';
    });
  };

  window.collapseAllGroups = function() {
    document.querySelectorAll('.group-card').forEach(function(card) {
      card.classList.add('collapsed');
      var body = card.querySelector('.group-body');
      if (body) body.style.maxHeight = '0';
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
      "footer-powered": ["textContent", t("footer.poweredBy")]
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

    document.getElementById("group-toolbar").classList.add("show");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
