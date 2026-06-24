/**
 * ============================================
 * 前端渲染模块 - render.js
 * ============================================
 * 功能：
 * 1. 自动检测浏览器语言并切换多语种
 * 2. 从 JSON 文件加载监控数据并渲染页面
 * 3. 绘制响应时间折线图（Canvas）
 * 4. 绘制30天可用性色块条
 * 5. 深色模式切换
 * 6. 分组折叠展开
 * 7. 自动定时刷新
 * ============================================
 */

// 导入 MDUI（注册 Web Components）
import "https://cdn.jsdelivr.net/npm/mdui@2/mdui.js";

// ==========================================
// 国际化翻译表
// ==========================================
const I18N = {
  "zh-CN": {
    allNormal: "系统一切正常",
    partialDown: "部分服务故障",
    allDown: "全部服务离线",
    lastUpdated: "最后更新于",
    secondsAgo: "{n}秒前",
    minutesAgo: "{n}分钟前",
    hoursAgo: "{n}小时前",
    online: "在线",
    uptime: "可用率",
    responseTime: "响应时间",
    sslExpiry: "SSL 剩余",
    days: "天",
    operational: "正常运行",
    degraded: "性能降级",
    down: "服务离线",
    serviceStatus: "服务状态总览",
    autoRefresh: "每60秒自动刷新",
    poweredBy: "基于 GitHub Actions 静态检测",
    loading: "加载中...",
    refresh: "刷新",
    errorLoad: "数据加载失败，请稍后重试",
    noData: "暂无数据",
    ms: "ms",
    sslWarning: "SSL 即将过期！",
    sslExpired: "SSL 已过期！",
  },
  "zh-TW": {
    allNormal: "系統一切正常",
    partialDown: "部分服務故障",
    allDown: "全部服務離線",
    lastUpdated: "最後更新於",
    secondsAgo: "{n}秒前",
    minutesAgo: "{n}分鐘前",
    hoursAgo: "{n}小時前",
    online: "在線",
    uptime: "可用率",
    responseTime: "回應時間",
    sslExpiry: "SSL 剩餘",
    days: "天",
    operational: "正常運行",
    degraded: "效能降級",
    down: "服務離線",
    serviceStatus: "服務狀態總覽",
    autoRefresh: "每60秒自動重新整理",
    poweredBy: "基於 GitHub Actions 靜態偵測",
    loading: "載入中...",
    refresh: "重新整理",
    errorLoad: "資料載入失敗，請稍後重試",
    noData: "暫無資料",
    ms: "ms",
    sslWarning: "SSL 即將過期！",
    sslExpired: "SSL 已過期！",
  },
  "en-US": {
    allNormal: "All Systems Operational",
    partialDown: "Partial System Outage",
    allDown: "All Systems Down",
    lastUpdated: "Last updated",
    secondsAgo: "{n}s ago",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    online: "online",
    uptime: "Uptime",
    responseTime: "Response Time",
    sslExpiry: "SSL Expires",
    days: "days",
    operational: "Operational",
    degraded: "Degraded",
    down: "Down",
    serviceStatus: "Service Status",
    autoRefresh: "Auto-refresh every 60s",
    poweredBy: "Powered by GitHub Actions",
    loading: "Loading...",
    refresh: "Refresh",
    errorLoad: "Failed to load data. Please try again later.",
    noData: "No data",
    ms: "ms",
    sslWarning: "SSL expiring soon!",
    sslExpired: "SSL expired!",
  },
  "ja-JP": {
    allNormal: "全システム正常",
    partialDown: "一部サービス障害",
    allDown: "全サービス停止",
    lastUpdated: "最終更新",
    secondsAgo: "{n}秒前",
    minutesAgo: "{n}分前",
    hoursAgo: "{n}時間前",
    online: "オンライン",
    uptime: "稼働率",
    responseTime: "レスポンス時間",
    sslExpiry: "SSL 残り",
    days: "日",
    operational: "正常稼働",
    degraded: "性能低下",
    down: "サービス停止",
    serviceStatus: "サービス一覧",
    autoRefresh: "60秒ごとに自動更新",
    poweredBy: "GitHub Actions による静的監視",
    loading: "読み込み中...",
    refresh: "更新",
    errorLoad: "データの読み込みに失敗しました",
    noData: "データなし",
    ms: "ms",
    sslWarning: "SSL証明書の有効期限が近い！",
    sslExpired: "SSL証明書が期限切れ！",
  },
  "ko-KR": {
    allNormal: "모든 시스템 정상",
    partialDown: "일부 서비스 장애",
    allDown: "모든 서비스 중단",
    lastUpdated: "마지막 업데이트",
    secondsAgo: "{n}초 전",
    minutesAgo: "{n}분 전",
    hoursAgo: "{n}시간 전",
    online: "온라인",
    uptime: "가동률",
    responseTime: "응답 시간",
    sslExpiry: "SSL 남은",
    days: "일",
    operational: "정상 운영",
    degraded: "성능 저하",
    down: "서비스 중단",
    serviceStatus: "서비스 현황",
    autoRefresh: "60초마다 자동 새로고침",
    poweredBy: "GitHub Actions 기반 정적 모니터링",
    loading: "로딩 중...",
    refresh: "새로고침",
    errorLoad: "데이터를 불러오지 못했습니다",
    noData: "데이터 없음",
    ms: "ms",
    sslWarning: "SSL 인증서 만료 임박!",
    sslExpired: "SSL 인증서 만료!",
  },
};

// ==========================================
// 全局状态
// ==========================================
let currentLang = "zh-CN";
let statusData = null;
let historyData = null;
let refreshTimer = null;
let isDarkMode = false;

// ==========================================
// 工具函数
// ==========================================

/**
 * 获取当前语言（自动检测浏览器语言）
 */
function detectLanguage() {
  const saved = localStorage.getItem("status_lang");
  if (saved && I18N[saved]) return saved;

  const browserLang = navigator.language || navigator.userLanguage || "zh-CN";
  // 精确匹配
  if (I18N[browserLang]) return browserLang;
  // 前缀匹配（如 zh -> zh-CN）
  const prefix = browserLang.split("-")[0];
  for (const key of Object.keys(I18N)) {
    if (key.startsWith(prefix)) return key;
  }
  return "zh-CN";
}

/**
 * 翻译函数
 * @param {string} key - 翻译键名
 * @param {Object} params - 替换参数 {n: value}
 * @returns {string}
 */
function t(key, params = {}) {
  let text = (I18N[currentLang] && I18N[currentLang][key]) || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

/**
 * 应用翻译到页面中所有带 data-i18n 属性的元素
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = t(key);
    if (translated !== key) {
      el.textContent = translated;
    }
  });
  // 更新页面标题
  if (typeof CONFIG !== "undefined" && CONFIG.pageTitle) {
    document.title = CONFIG.pageTitle;
    const titleEl = document.getElementById("pageTitle");
    if (titleEl) titleEl.textContent = CONFIG.pageTitle;
  }
}

/**
 * 格式化相对时间
 * @param {string} isoTime - ISO 时间字符串
 * @returns {string}
 */
function formatTimeAgo(isoTime) {
  if (!isoTime) return "";
  const diff = Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000);
  if (diff < 0) return t("secondsAgo", { n: 0 });
  if (diff < 60) return t("secondsAgo", { n: diff });
  if (diff < 3600) return t("minutesAgo", { n: Math.floor(diff / 60) });
  return t("hoursAgo", { n: Math.floor(diff / 3600) });
}

/**
 * 格式化时钟时间 HH:MM:SS
 */
function formatClock(isoTime) {
  if (!isoTime) return "--:--:--";
  const d = new Date(isoTime);
  return d.toLocaleTimeString(currentLang.replace("_", "-"), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 获取可用率对应的色块级别
 */
function getUptimeLevel(uptime) {
  if (uptime === null || uptime === undefined) return "none";
  if (uptime >= 99.5) return "good";
  if (uptime >= 95) return "fair";
  if (uptime >= 90) return "warn";
  return "bad";
}

/**
 * 获取状态对应的 Material Symbol 图标名
 */
function getStatusIcon(status) {
  switch (status) {
    case "operational": return "check_circle";
    case "degraded": return "warning";
    case "down": return "cancel";
    default: return "help";
  }
}

// ==========================================
// 数据加载
// ==========================================

/**
 * 从 JSON 文件加载监控数据
 */
async function loadAllData() {
  const cacheBuster = `?t=${Date.now()}`;
  try {
    const [statusRes, historyRes] = await Promise.all([
      fetch(`data/status.json${cacheBuster}`),
      fetch(`data/history.json${cacheBuster}`),
    ]);

    if (statusRes.ok) {
      statusData = await statusRes.json();
    }
    if (historyRes.ok) {
      historyData = await historyRes.json();
    }
  } catch (e) {
    console.error("加载数据失败:", e);
  }
}

// ==========================================
// 渲染函数
// ==========================================

/**
 * 渲染全局状态概览
 */
function renderGlobalStatus() {
  const card = document.getElementById("globalStatusCard");
  const iconEl = document.getElementById("globalStatusIcon");
  const textEl = document.getElementById("globalStatusText");
  const subEl = document.getElementById("globalStatusSub");
  const timeEl = document.getElementById("lastUpdateTime");
  const agoEl = document.getElementById("lastUpdateAgo");

  if (!statusData) {
    card.setAttribute("data-status", "down");
    iconEl.querySelector(".material-symbols-outlined").textContent = "cloud_off";
    textEl.textContent = t("errorLoad");
    return;
  }

  const global = statusData.globalStatus || "operational";
  card.setAttribute("data-status", global);
  iconEl.querySelector(".material-symbols-outlined").textContent = getStatusIcon(global);

  // 设置状态文字
  switch (global) {
    case "operational":
      textEl.textContent = t("allNormal");
      break;
    case "degraded":
      textEl.textContent = t("partialDown");
      break;
    case "down":
      textEl.textContent = t("allDown");
      break;
  }

  // 更新时间
  timeEl.textContent = formatClock(statusData.lastUpdate);
  agoEl.textContent = `（${formatTimeAgo(statusData.lastUpdate)}）`;
}

/**
 * 渲染站点分组列表
 */
function renderGroups() {
  const container = document.getElementById("groupsContainer");
  container.innerHTML = "";

  if (!statusData || !statusData.groups) return;

  const theme = (typeof CONFIG !== "undefined" && CONFIG.theme) ? CONFIG.theme : {};

  statusData.groups.forEach((group, groupIdx) => {
    const groupCard = document.createElement("div");
    groupCard.className = "group-card fade-in";
    groupCard.style.animationDelay = `${groupIdx * 0.05}s`;

    // 判断分组状态
    const allUp = group.online === group.total;
    const allDown = group.online === 0;
    let badgeClass = "";
    let badgeText = `${group.online}/${group.total} ${t("online")}`;
    if (!allUp && !allDown) badgeClass = "partial";
    if (allDown) badgeClass = "offline";

    // 分组头部
    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `
      <div class="group-header-left">
        <span class="material-symbols-outlined">${getGroupIcon(group.name)}</span>
        <span class="group-name">${escapeHtml(group.name)}</span>
      </div>
      <div class="group-header-right">
        <span class="group-online-badge ${badgeClass}">${badgeText}</span>
        <span class="material-symbols-outlined group-toggle-icon">expand_more</span>
      </div>
    `;

    // 分组内容
    const body = document.createElement("div");
    body.className = "group-body";

    // 遍历站点
    group.sites.forEach((site) => {
      const siteEl = document.createElement("div");
      siteEl.className = "site-item";

      // 站点名称行
      const infoRow = document.createElement("div");
      infoRow.className = "site-info-row";
      infoRow.innerHTML = `
        <div class="site-name-row">
          <span class="site-status-dot ${site.status}"></span>
          <span class="site-name">${escapeHtml(site.name)}</span>
        </div>
        <span class="site-uptime">${(site.uptime || 0).toFixed(2)}%</span>
      `;

      // 30天可用性色块条
      const blocksContainer = document.createElement("div");
      blocksContainer.className = "uptime-blocks";
      renderUptimeBlocks(blocksContainer, site.name);

      // 响应时间图表
      const chartContainer = document.createElement("div");
      chartContainer.className = "chart-container";
      const canvas = document.createElement("canvas");
      chartContainer.appendChild(canvas);

      // 站点详情
      const detailRow = document.createElement("div");
      detailRow.className = "site-detail-row";
      detailRow.innerHTML = `
        <span class="site-detail-item">
          <span class="material-symbols-outlined">speed</span>
          ${t("responseTime")}: ${site.status === "up" ? site.responseTime + " " + t("ms") : "--"}
        </span>
        <span class="site-detail-item">
          <span class="material-symbols-outlined">lock</span>
          ${t("sslExpiry")}: ${site.sslDaysLeft > 0 ? site.sslDaysLeft + " " + t("days") : "--"}
          ${site.sslDaysLeft >= 0 && site.sslDaysLeft <= (theme.sslWarningDays || 30) ? '<span style="color:var(--color-danger);margin-left:4px;">⚠</span>' : ""}
        </span>
      `;

      siteEl.appendChild(infoRow);
      siteEl.appendChild(blocksContainer);
      siteEl.appendChild(chartContainer);
      siteEl.appendChild(detailRow);
      body.appendChild(siteEl);

      // 绘制图表（延迟执行确保 canvas 已在 DOM）
      requestAnimationFrame(() => {
        drawResponseChart(canvas, site.name, theme);
      });
    });

    // 折叠展开逻辑
    header.addEventListener("click", () => {
      const isCollapsed = body.classList.contains("collapsed");
      if (isCollapsed) {
        body.classList.remove("collapsed");
        body.style.maxHeight = body.scrollHeight + "px";
        header.classList.remove("collapsed");
      } else {
        body.style.maxHeight = body.scrollHeight + "px";
        requestAnimationFrame(() => {
          body.classList.add("collapsed");
          header.classList.add("collapsed");
        });
      }
    });

    groupCard.appendChild(header);
    groupCard.appendChild(body);
    container.appendChild(groupCard);

    // 初始展开：设置 max-height
    requestAnimationFrame(() => {
      body.style.maxHeight = body.scrollHeight + "px";
    });
  });
}

/**
 * 获取分组图标名
 */
function getGroupIcon(name) {
  if (typeof CONFIG !== "undefined" && CONFIG.groups) {
    const group = CONFIG.groups.find((g) => g.name === name);
    if (group && group.icon) return group.icon;
  }
  return "folder";
}

/**
 * 渲染30天可用性色块
 */
function renderUptimeBlocks(container, siteName) {
  container.innerHTML = "";

  const days = 30;
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split("T")[0];

    let uptime = null;
    if (historyData && historyData.daily && historyData.daily[dateKey]) {
      const dayData = historyData.daily[dateKey];
      if (dayData.sites && dayData.sites[siteName]) {
        const s = dayData.sites[siteName];
        if (s.checks > 0) {
          uptime = Math.round((s.upChecks / s.checks) * 10000) / 100;
        }
      }
    }

    const block = document.createElement("div");
    block.className = "uptime-block";
    block.setAttribute("data-level", getUptimeLevel(uptime));

    const tooltip = document.createElement("div");
    tooltip.className = "uptime-block-tooltip";
    tooltip.textContent = `${dateKey}: ${uptime !== null ? uptime + "%" : t("noData")}`;
    block.appendChild(tooltip);

    container.appendChild(block);
  }
}

/**
 * 绘制响应时间折线图
 * 使用纯 Canvas API，无外部依赖
 */
function drawResponseChart(canvas, siteName, theme) {
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const padding = { top: 10, right: 10, bottom: 22, left: 40 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  // 获取数据点
  let points = [];
  if (
    historyData &&
    historyData.responseTimeHistory &&
    historyData.responseTimeHistory[siteName]
  ) {
    points = historyData.responseTimeHistory[siteName].slice(-100);
  }

  // 无数据时显示提示
  if (points.length < 2) {
    ctx.fillStyle = isDarkMode ? "#757575" : "#9e9e9e";
    ctx.font = "12px 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t("noData"), W / 2, H / 2 + 4);
    return;
  }

  // 计算数据范围
  const values = points.map((p) => p.value);
  let maxVal = Math.max(...values);
  let minVal = Math.min(...values);

  // 确保有合理的 Y 轴范围
  if (maxVal === minVal) {
    maxVal = maxVal * 1.5 || 100;
    minVal = 0;
  }
  maxVal = Math.ceil(maxVal * 1.2 / 50) * 50;
  minVal = 0;

  // 绘制网格线和 Y 轴标签（使用 Sukiing 粉色调）
  const gridColor = isDarkMode ? "rgba(173,20,87,0.2)" : "rgba(248,187,208,0.25)";
  const textColor = isDarkMode ? "#757575" : "#9e9e9e";
  const gridSteps = 4;

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = textColor;
  ctx.font = "10px 'Noto Sans SC', sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (chartH / gridSteps) * i;
    const val = Math.round(maxVal - ((maxVal - minVal) / gridSteps) * i);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();

    ctx.fillText(val + "", padding.left - 6, y + 3);
  }

  // 绘制 X 轴时间标签
  ctx.textAlign = "center";
  const firstTime = new Date(points[0].time);
  const lastTime = new Date(points[points.length - 1].time);
  const xLabels = 5;

  for (let i = 0; i <= xLabels; i++) {
    const ratio = i / xLabels;
    const x = padding.left + chartW * ratio;
    const t2 = new Date(firstTime.getTime() + (lastTime.getTime() - firstTime.getTime()) * ratio);
    const label = t2.toLocaleTimeString(currentLang.replace("_", "-"), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    ctx.fillText(label, x, H - 4);
  }

  // 计算点坐标
  const coords = points.map((p, i) => ({
    x: padding.left + (i / (points.length - 1)) * chartW,
    y: padding.top + chartH - ((p.value - minVal) / (maxVal - minVal)) * chartH,
  }));

  // 绘制填充区域（使用 Sukiing 樱花粉色系）
  const fillColor = (theme.chartFill || "rgba(248,187,208,0.2)");
  const lineColor = (theme.chartLine || "#F48FB1");

  ctx.beginPath();
  ctx.moveTo(coords[0].x, padding.top + chartH);
  coords.forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.lineTo(coords[coords.length - 1].x, padding.top + chartH);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  gradient.addColorStop(0, lineColor + "40");
  gradient.addColorStop(1, lineColor + "05");
  ctx.fillStyle = gradient;
  ctx.fill();

  // 绘制折线
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  coords.forEach((c, i) => {
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.stroke();
}

/**
 * 渲染底部服务状态列表
 */
function renderServiceList() {
  const container = document.getElementById("serviceList");
  container.innerHTML = "";

  if (!statusData || !statusData.groups) return;

  statusData.groups.forEach((group) => {
    // 分组标题
    const groupTitle = document.createElement("div");
    groupTitle.style.cssText =
      "font-size:13px;font-weight:600;color:var(--text-secondary);padding:12px 0 6px;border-top:1px solid var(--border-color);";
    groupTitle.textContent = group.name;
    container.appendChild(groupTitle);

    group.sites.forEach((site) => {
      const item = document.createElement("div");
      item.className = "service-list-item";
      const isUp = site.status === "up";

      item.innerHTML = `
        <span class="service-list-name">
          <span class="site-status-dot ${site.status}" style="width:6px;height:6px;"></span>
          ${escapeHtml(site.name)}
        </span>
        <span class="service-list-status ${site.status}">
          <span class="material-symbols-outlined">${isUp ? "check_circle" : "cancel"}</span>
          ${isUp ? t("operational") : t("down")}
        </span>
      `;
      container.appendChild(item);
    });
  });
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================
// 深色模式
// ==========================================

function initTheme() {
  const saved = localStorage.getItem("status_theme");
  if (saved === "dark") {
    enableDarkMode();
  } else if (saved === "light") {
    disableDarkMode();
  } else {
    // 跟随系统
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      enableDarkMode();
    }
  }
}

function enableDarkMode() {
  isDarkMode = true;
  document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById("themeIcon").textContent = "light_mode";
  localStorage.setItem("status_theme", "dark");
  const logo = document.getElementById("appBarLogo");
  if (logo) logo.src = "logo-dark.webp";
}

function disableDarkMode() {
  isDarkMode = false;
  document.documentElement.removeAttribute("data-theme");
  document.getElementById("themeIcon").textContent = "dark_mode";
  localStorage.setItem("status_theme", "light");
  const logo = document.getElementById("appBarLogo");
  if (logo) logo.src = "logo.webp";
}

function toggleTheme() {
  if (isDarkMode) {
    disableDarkMode();
  } else {
    enableDarkMode();
  }
  // 重新绘制图表
  if (statusData) {
    document.querySelectorAll(".chart-container canvas").forEach((canvas) => {
      const siteName = canvas.closest(".site-item").querySelector(".site-name").textContent;
      const theme = (typeof CONFIG !== "undefined" && CONFIG.theme) ? CONFIG.theme : {};
      drawResponseChart(canvas, siteName, theme);
    });
  }
}

// ==========================================
// 语言切换
// ==========================================

function initLanguage() {
  currentLang = detectLanguage();
  applyTranslations();
  updateLangMenuActive();
}

function switchLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem("status_lang", lang);
  applyTranslations();
  updateLangMenuActive();
  // 重新渲染所有内容
  renderAll();
}

function updateLangMenuActive() {
  document.querySelectorAll(".lang-option").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-lang") === currentLang);
  });
}

// ==========================================
// 主渲染流程
// ==========================================

function renderAll() {
  renderGlobalStatus();
  renderGroups();
  renderServiceList();

  // 更新版权
  if (typeof CONFIG !== "undefined" && CONFIG.copyright) {
    const el = document.getElementById("copyrightText");
    if (el) el.textContent = CONFIG.copyright;
  }
}

async function refreshData() {
  const btn = document.getElementById("refreshBtn");
  btn.querySelector(".material-symbols-outlined").style.animation = "spin 0.8s linear infinite";

  await loadAllData();
  renderAll();

  setTimeout(() => {
    btn.querySelector(".material-symbols-outlined").style.animation = "";
  }, 800);
}

// ==========================================
// 初始化
// ==========================================

async function initApp() {
  // 初始化主题
  initTheme();

  // 初始化语言
  initLanguage();

  // 加载数据
  await loadAllData();

  // 隐藏加载状态
  const loadingEl = document.getElementById("loadingOverlay");
  if (loadingEl) loadingEl.classList.add("hidden");

  // 渲染页面
  renderAll();

  // 绑定事件
  document.getElementById("themeBtn").addEventListener("click", toggleTheme);
  document.getElementById("refreshBtn").addEventListener("click", refreshData);

  // 语言菜单
  const langBtn = document.getElementById("langBtn");
  const langMenu = document.getElementById("langMenu");

  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    langMenu.classList.toggle("show");
  });

  document.querySelectorAll(".lang-option").forEach((el) => {
    el.addEventListener("click", () => {
      switchLanguage(el.getAttribute("data-lang"));
      langMenu.classList.remove("show");
    });
  });

  // 点击外部关闭语言菜单
  document.addEventListener("click", () => {
    langMenu.classList.remove("show");
  });

  // 自动刷新（每 60 秒）
  refreshTimer = setInterval(refreshData, 60000);

  console.log("✅ Status Page 初始化完成");
}

// MDUI 导入为 ES module，脚本 defer 执行，DOM 已就绪
initApp();
