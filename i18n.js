/**
 * ============================================
 *  多语言模块 (i18n)
 *  支持：中文(zh) / English(en) / 日本語(ja)
 *  自动检测浏览器语言，可手动切换
 * ============================================
 */

const I18N = {
  // ── 中文 ──
  zh: {
    "status.operational": "系统一切正常",
    "status.partial": "部分服务故障",
    "status.major": "全部服务离线",
    "ui.lastUpdate": "最后更新于",
    "ui.justNow": "刚刚",
    "ui.secondsAgo": "秒前",
    "ui.minutesAgo": "分钟前",
    "ui.hoursAgo": "小时前",
    "ui.online": "在线",
    "ui.offline": "离线",
    "ui.total": "总计",
    "ui.uptime": "可用率",
    "ui.avgResponse": "平均响应",
    "ui.responseTime": "响应时间",
    "ui.refresh": "刷新",
    "ui.darkMode": "深色模式",
    "ui.lightMode": "浅色模式",
    "ui.sslExpiring": "SSL 证书剩余 {days} 天",
    "ui.noData": "暂无数据",
    "ui.waitingFirstCheck": "等待首次检测完成后将自动显示",
    "ui.loading": "加载中...",
    "ui.unknown": "未知",
    "ui.group.online": "{online}/{total} 在线",
    "chart.responseTime": "响应时间 (ms)",
    "chart.uptime30d": "近 30 天可用性",
    "services.title": "服务状态",
    "services.operational": "正常运行",
    "services.degraded": "性能降级",
    "services.down": "服务中断",
    "banner.activeIncident": "当前存在活跃故障",
    "incidents.title": "历史故障记录",
    "footer.poweredBy": "由 GitHub Actions 驱动",
    "ui.search": "搜索站点...",
    "ui.noResults": "没有匹配的站点",
    "ui.min": "最小",
    "ui.max": "最大",
    "ui.avg": "平均",
    "ui.viewSite": "访问站点",
    "ui.shortcuts": "快捷键",
    "ui.expandAll": "展开全部",
    "ui.collapseAll": "收起全部",
  },

  // ── English ──
  en: {
    "status.operational": "All Systems Operational",
    "status.partial": "Partial System Outage",
    "status.major": "Major System Outage",
    "ui.lastUpdate": "Last updated",
    "ui.justNow": "just now",
    "ui.secondsAgo": "seconds ago",
    "ui.minutesAgo": "minutes ago",
    "ui.hoursAgo": "hours ago",
    "ui.online": "online",
    "ui.offline": "offline",
    "ui.total": "total",
    "ui.uptime": "Uptime",
    "ui.avgResponse": "Avg Response",
    "ui.responseTime": "Response Time",
    "ui.refresh": "Refresh",
    "ui.darkMode": "Dark Mode",
    "ui.lightMode": "Light Mode",
    "ui.sslExpiring": "SSL expires in {days} days",
    "ui.noData": "No Data Yet",
    "ui.waitingFirstCheck": "Data will appear after the first check completes",
    "ui.loading": "Loading...",
    "ui.unknown": "Unknown",
    "ui.group.online": "{online}/{total} online",
    "chart.responseTime": "Response Time (ms)",
    "chart.uptime30d": "30-Day Uptime",
    "services.title": "Service Status",
    "services.operational": "Operational",
    "services.degraded": "Degraded",
    "services.down": "Outage",
    "banner.activeIncident": "Active Incident Detected",
    "incidents.title": "Incident History",
    "footer.poweredBy": "Powered by GitHub Actions",
    "ui.search": "Search sites...",
    "ui.noResults": "No matching sites",
    "ui.min": "Min",
    "ui.max": "Max",
    "ui.avg": "Avg",
    "ui.viewSite": "Visit site",
    "ui.shortcuts": "Shortcuts",
    "ui.expandAll": "Expand all",
    "ui.collapseAll": "Collapse all",
  },

  // ── 日本語 ──
  ja: {
    "status.operational": "すべてのシステムが正常に動作しています",
    "status.partial": "一部のシステムに障害が発生しています",
    "status.major": "重大なシステム障害が発生しています",
    "ui.lastUpdate": "最終更新",
    "ui.justNow": "たった今",
    "ui.secondsAgo": "秒前",
    "ui.minutesAgo": "分前",
    "ui.hoursAgo": "時間前",
    "ui.online": "オンライン",
    "ui.offline": "オフライン",
    "ui.total": "合計",
    "ui.uptime": "稼働率",
    "ui.avgResponse": "平均応答",
    "ui.responseTime": "応答時間",
    "ui.refresh": "更新",
    "ui.darkMode": "ダークモード",
    "ui.lightMode": "ライトモード",
    "ui.sslExpiring": "SSL証明書 残り{days}日",
    "ui.noData": "データがありません",
    "ui.waitingFirstCheck": "初回チェック完了後にデータが表示されます",
    "ui.loading": "読み込み中...",
    "ui.unknown": "不明",
    "ui.group.online": "{online}/{total} オンライン",
    "chart.responseTime": "応答時間 (ms)",
    "chart.uptime30d": "30日間の稼働率",
    "services.title": "サービス状態",
    "services.operational": "正常",
    "services.degraded": "低下",
    "services.down": "障害",
    "banner.activeIncident": "障害が発生中です",
    "incidents.title": "障害履歴",
    "footer.poweredBy": "GitHub Actions で稼働",
    "ui.search": "サイトを検索...",
    "ui.noResults": "一致するサイトがありません",
    "ui.min": "最小",
    "ui.max": "最大",
    "ui.avg": "平均",
    "ui.viewSite": "サイトを開く",
    "ui.shortcuts": "ショートカット",
    "ui.expandAll": "すべて展開",
    "ui.collapseAll": "すべて折りたたむ",
  },
};

let _currentLang = "zh";

function detectLanguage() {
  const saved = localStorage.getItem("status_lang");
  if (saved && I18N[saved]) {
    _currentLang = saved;
    return _currentLang;
  }
  const nav = (navigator.language || navigator.userLanguage || "zh").toLowerCase();
  if (nav.startsWith("ja")) _currentLang = "ja";
  else if (nav.startsWith("en")) _currentLang = "en";
  else _currentLang = "zh";
  return _currentLang;
}

function t(key, vars = {}) {
  let str =
    (I18N[_currentLang] && I18N[_currentLang][key]) ||
    (I18N["en"] && I18N["en"][key]) ||
    key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

function setLanguage(lang) {
  if (!I18N[lang]) return;
  _currentLang = lang;
  localStorage.setItem("status_lang", lang);
  document.documentElement.lang = lang;
}

function getLanguage() {
  return _currentLang;
}
