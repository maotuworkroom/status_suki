/**
 * ============================================
 * 站点监控配置文件 - config.js
 * ============================================
 * 修改此文件即可自定义所有监控目标和页面设置
 * 前端页面和 GitHub Actions 探测脚本共用此配置
 * ============================================
 */

const CONFIG = {

  // ========== 页面基础设置 ==========
  pageTitle: "lyc8503's Status Page",    // 页面标题（显示在顶部）
  pageSubtitle: "Sukiing Service Monitor",  // 页面副标题
  copyright: "© 2024 lyc8503 · Powered by GitHub Actions & Pages",  // 底部版权文字

  // ========== 主题配色（对齐 Sukiing 圣地巡礼站樱花粉风格） ==========
  theme: {
    primary: "#F8BBD0",       // 主色调（樱花淡粉）
    primaryDark: "#F48FB1",   // 主色调深色
    primaryLight: "#FCE4EC",  // 主色调浅色
    accent: "#FF4081",        // 强调色
    success: "#66BB6A",       // 正常状态绿色（柔和）
    warning: "#FFA726",       // 警告状态橙色
    danger: "#EF5350",        // 故障状态红色
    uptimeGood: "#66BB6A",    // 可用率 ≥99.5% 深绿
    uptimeFair: "#A5D6A7",    // 可用率 95~99.5% 浅绿
    uptimeWarn: "#FFD54F",    // 可用率 90~95% 黄色
    uptimeBad: "#EF5350",     // 可用率 <90% 红色
    uptimeNone: "#BDBDBD",    // 无数据灰色
    chartLine: "#F48FB1",     // 折线图线条色
    chartFill: "rgba(248,187,208,0.2)", // 折线图填充色
  },

  // ========== GitHub 仓库信息 ==========
  // 用于创建/关闭故障 Issue（需在 Actions Secrets 中配置 GITHUB_TOKEN）
  github: {
    owner: "",   // 仓库所有者（留空则自动从 GITHUB_REPOSITORY 环境变量读取）
    repo: "",    // 仓库名称（留空则自动读取）
  },

  // ========== 探测设置 ==========
  timeout: 10000,              // 请求超时时间（毫秒）
  historyDays: 90,             // 历史数据保留天数
  sslWarningDays: 30,          // SSL 证书过期预警天数

  // ========== 站点分组配置 ==========
  // 每个分组包含名称、图标和站点列表
  groups: [
    {
      name: "Public",           // 分组名称
      icon: "public",           // Material Symbols 图标名称
      sites: [
        {
          name: "主站",                    // 站点显示名称
          url: "https://example.com",     // 探测地址
          method: "GET",                  // 请求方法（GET/HEAD）
          expectedStatus: 200,            // 期望状态码
          keyword: "",                    // 页面关键词（留空则不检测）
        },
        {
          name: "API 接口",
          url: "https://api.example.com/health",
          method: "GET",
          expectedStatus: 200,
          keyword: '"status":"ok"',
        },
        {
          name: "CDN 加速",
          url: "https://cdn.example.com",
          method: "HEAD",
          expectedStatus: 200,
          keyword: "",
        },
        {
          name: "博客",
          url: "https://blog.example.com",
          method: "GET",
          expectedStatus: 200,
          keyword: "blog",
        },
      ],
    },
    {
      name: "Internal",
      icon: "lan",
      sites: [
        {
          name: "数据库面板",
          url: "https://db.example.com/status",
          method: "GET",
          expectedStatus: 200,
          keyword: "healthy",
        },
        {
          name: "监控面板",
          url: "https://grafana.example.com/api/health",
          method: "GET",
          expectedStatus: 200,
          keyword: "ok",
        },
      ],
    },
  ],
};

// 兼容 Node.js（check.js）和浏览器（前端页面）两种环境
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
