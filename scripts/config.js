/**
 * ============================================
 *  站点监控配置文件 — 修改本文件即可增删监控目标
 *  修改后提交到仓库，GitHub Actions 会自动生效
 * ============================================
 */

module.exports = {

  // ── 页面基础设置 ──────────────────────────
  page: {
    title: "lyc8503's Status Page",   // 页面标题（支持中英文自动切换时用 i18n 覆盖）
    footer: "Powered by GitHub Actions · © 2024",  // 页脚文案
    logo: "",                          // 可选：顶部 logo 图片 URL，留空则不显示
  },

  // ── 探测参数 ─────────────────────────────
  check: {
    timeout: 15000,      // 单次请求超时（毫秒）
    retries: 2,          // 失败后重试次数
    retryDelay: 3000,    // 重试间隔（毫秒）
  },

  // ── 站点分组 ─────────────────────────────
  //  每个分组包含 name / icon / sites
  //  每个站点包含 name / url / keyword(可选)
  //
  //  ★ 增删网址只需修改下方 sites 数组 ★
  //  ★ 提交后 Actions 自动检测并更新页面 ★
  groups: [
    {
      name: "Public",         // 分组名称
      icon: "public",         // Material Icons 图标名
      sites: [
        {
          name: "Homepage",
          url: "https://example.com",
          keyword: "",        // 页面关键词检测，留空则只检查状态码
        },
        {
          name: "API Server",
          url: "https://api.example.com/health",
          keyword: "ok",
        },
        {
          name: "Blog",
          url: "https://blog.example.com",
          keyword: "",
        },
        {
          name: "CDN",
          url: "https://cdn.example.com",
          keyword: "",
        },
      ],
    },
    {
      name: "Internal",
      icon: "lock",
      sites: [
        {
          name: "Dashboard",
          url: "https://dash.example.com",
          keyword: "login",
        },
        {
          name: "Database Monitor",
          url: "https://db.example.com/status",
          keyword: "healthy",
        },
      ],
    },
    // ── 新增分组示例 ──
    // {
    //   name: "Anime",
    //   icon: "anime",
    //   sites: [
    //     { name: "Bangumi", url: "https://bgm.tv", keyword: "" },
    //   ],
    // },
  ],

  // ── 历史数据保留天数 ─────────────────────
  history: {
    daysKeep: 90,           // 保留最近多少天的每日可用率数据
    maxResponsePoints: 288, // 响应时间曲线最大数据点数（每5分钟一个 = 288/天）
    // 当 history.json 超过 90MB 时自动将旧月份数据归档到 data/archive/history-YYYY-MM.json
    // 无需手动配置，脚本自动检测并拆分，确保单文件不超 GitHub 100MB 限制
  },

  // ── 告警设置 ─────────────────────────────
  alert: {
    enabled: true,          // 是否启用 GitHub Issue 告警
    sslWarnDays: 30,        // SSL 证书剩余天数低于此值时告警
  },
};
