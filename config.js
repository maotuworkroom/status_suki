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
  pageTitle: "Suki.ing Status",            // 页面标题（显示在顶部）
  pageSubtitle: "Suki.ing Service Monitor",  // 页面副标题
  copyright: "© Suki.ing",  // 底部版权文字

  // ========== 主题配色（对齐 Suki.ing 圣地巡礼站樱花粉风格） ==========
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
      name: "Public",
      icon: "public",
      sites: [
        {
          name: "Database",
          url: "https://sukicdn.suki.ing/pic/data/866/images/428735.jpg",
          method: "GET",
          expectedStatus: 200,
          keyword: "",
        },
        {
          name: "CommentSys",
          url: "https://giscus.app/zh-CN",
          method: "GET",
          expectedStatus: 200,
          keyword: "",
        },
      ],
    },
  ],
};

// 兼容 Node.js（check.js）和浏览器（前端页面）两种环境
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
