#!/usr/bin/env node
/**
 * ============================================
 * 站点检测脚本 - check.js
 * ============================================
 * 由 GitHub Actions 定时调用，执行以下任务：
 * 1. 批量检测所有配置站点的可用性
 * 2. 记录响应耗时、SSL 证书状态
 * 3. 更新 status.json 和 history.json
 * 4. Git 提交并推送数据
 * 5. 站点离线时创建 Issue，恢复时自动评论
 * ============================================
 */

const https = require("https");
const http = require("http");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { URL } = require("url");

// 加载配置
const config = require("../config.js");

// 文件路径
const DATA_DIR = path.join(__dirname, "..", "data");
const STATUS_FILE = path.join(DATA_DIR, "status.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const MANIFEST_FILE = path.join(DATA_DIR, "manifest.json");

// 文件大小阈值（90MB，GitHub 单文件上限 100MB）
const MAX_FILE_BYTES = 90 * 1024 * 1024;

// Git 配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO_OWNER =
  config.github.owner || (process.env.GITHUB_REPOSITORY || "").split("/")[0] || "";
const REPO_NAME =
  config.github.repo || (process.env.GITHUB_REPOSITORY || "").split("/")[1] || "";

/**
 * 发起 HTTP/HTTPS 请求，返回状态码、响应时间、响应体
 * @param {string} url - 请求地址
 * @param {string} method - 请求方法
 * @param {number} timeout - 超时时间(ms)
 * @returns {Promise<{status:number, responseTime:number, body:string, error:string}>}
 */
function httpGet(url, method = "GET", timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return resolve({
        status: 0,
        responseTime: 0,
        body: "",
        error: `无效的 URL: ${url}`,
      });
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      timeout: timeout,
      headers: {
        "User-Agent": "StatusMonitor/1.0",
        Accept: "text/html,application/json,*/*",
      },
      // 忽略自签名证书错误（仅用于检测）
      rejectUnauthorized: false,
    };

    const req = client.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
        // 限制读取大小，防止内存溢出
        if (body.length > 1024 * 1024) {
          body = body.substring(0, 1024 * 1024);
        }
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          responseTime: Date.now() - startTime,
          body: body,
          error: "",
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        status: 0,
        responseTime: Date.now() - startTime,
        body: "",
        error: `请求超时 (${timeout}ms)`,
      });
    });

    req.on("error", (err) => {
      resolve({
        status: 0,
        responseTime: Date.now() - startTime,
        body: "",
        error: `连接失败: ${err.message}`,
      });
    });

    req.end();
  });
}

/**
 * 检查 SSL 证书剩余天数
 * @param {string} hostname - 主机名
 * @param {number} timeout - 超时时间(ms)
 * @returns {Promise<number>} 剩余天数，-1 表示无 SSL 或检查失败
 */
function checkSSL(hostname, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            if (cert && cert.valid_to) {
              const expiryDate = new Date(cert.valid_to);
              const now = new Date();
              const daysLeft = Math.floor(
                (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );
              socket.destroy();
              resolve(daysLeft);
            } else {
              socket.destroy();
              resolve(-1);
            }
          } catch (e) {
            socket.destroy();
            resolve(-1);
          }
        }
      );

      socket.on("error", () => resolve(-1));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(-1);
      });
      socket.setTimeout(timeout);
    } catch (e) {
      resolve(-1);
    }
  });
}

/**
 * 检测单个站点状态
 * @param {Object} site - 站点配置
 * @returns {Promise<Object>} 检测结果
 */
async function checkSite(site) {
  const timeout = config.timeout || 10000;
  const result = await httpGet(site.url, site.method || "GET", timeout);

  // 判断状态码是否匹配
  const statusOk = site.expectedStatus
    ? result.status === site.expectedStatus
    : result.status >= 200 && result.status < 300;

  // 判断关键词是否存在于页面内容
  let keywordOk = true;
  if (site.keyword && result.body) {
    keywordOk = result.body.includes(site.keyword);
  }

  // 综合判断在线状态
  const isUp = statusOk && keywordOk && !result.error;

  // 构建错误信息
  let errorMsg = result.error || "";
  if (!statusOk && !result.error) {
    errorMsg = `HTTP ${result.status}（期望 ${site.expectedStatus || "2xx"}）`;
  }
  if (!keywordOk) {
    errorMsg += errorMsg ? "; " : "";
    errorMsg += `未找到关键词「${site.keyword}」`;
  }

  // 检查 SSL 证书
  let sslDaysLeft = -1;
  try {
    const parsedUrl = new URL(site.url);
    if (parsedUrl.protocol === "https:") {
      sslDaysLeft = await checkSSL(parsedUrl.hostname);
    }
  } catch (e) {
    // SSL 检查失败不影响主流程
  }

  return {
    name: site.name,
    url: site.url,
    status: isUp ? "up" : "down",
    responseTime: result.responseTime,
    sslDaysLeft: sslDaysLeft,
    lastCheck: new Date().toISOString(),
    error: errorMsg,
    httpStatus: result.status,
  };
}

/**
 * 从 history.json 计算站点近期可用率
 * @param {Object} history - 历史数据
 * @param {string} siteName - 站点名称
 * @returns {number} 可用率百分比
 */
function calculateUptime(history, siteName) {
  if (!history.daily) return 100;

  const today = new Date();
  let totalChecks = 0;
  let upChecks = 0;

  // 遍历最近 30 天的数据
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split("T")[0];
    const dayData = history.daily[dateKey];

    if (dayData && dayData.sites && dayData.sites[siteName]) {
      const siteData = dayData.sites[siteName];
      totalChecks += siteData.checks || 0;
      upChecks += siteData.upChecks || 0;
    }
  }

  if (totalChecks === 0) return 100;
  return Math.round((upChecks / totalChecks) * 10000) / 100;
}

/**
 * 保存 JSON 数据到文件
 * @param {string} filePath - 文件路径
 * @param {Object} data - 数据对象
 */
function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @returns {Object} 解析后的对象
 */
function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (e) {
    console.error(`读取 ${filePath} 失败:`, e.message);
  }
  return {};
}

/**
 * Git 提交并推送数据
 */
function gitCommit() {
  try {
    execSync('git config user.name "Status Monitor Bot"', { cwd: path.join(__dirname, "..") });
    execSync('git config user.email "bot@status-monitor.local"', {
      cwd: path.join(__dirname, ".."),
    });
    execSync("git add data/status.json data/history.json data/manifest.json data/history-*.json", {
      cwd: path.join(__dirname, ".."),
    });

    // 检查是否有变更
    const status = execSync("git status --porcelain", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    });

    if (status.trim()) {
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      execSync(`git commit -m "📊 状态更新 ${now}"`, {
        cwd: path.join(__dirname, ".."),
      });
      execSync("git push", { cwd: path.join(__dirname, "..") });
      console.log("✅ 数据已提交并推送");
    } else {
      console.log("ℹ️ 无数据变更，跳过提交");
    }
  } catch (e) {
    console.error("Git 操作失败:", e.message);
  }
}

/**
 * 通过 GitHub API 创建 Issue（站点离线告警）
 * @param {string} siteName - 站点名称
 * @param {string} errorMsg - 错误信息
 * @param {string} groupName - 所属分组
 */
async function createIssue(siteName, errorMsg, groupName) {
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    console.log("⚠️ 未配置 GITHUB_TOKEN 或仓库信息，跳过 Issue 创建");
    return;
  }

  const title = `[故障告警] ${siteName} 站点离线`;
  const body = [
    `## 🚨 站点离线告警`,
    ``,
    `| 项目 | 详情 |`,
    `|------|------|`,
    `| **站点名称** | ${siteName} |`,
    `| **所属分组** | ${groupName} |`,
    `| **故障时间** | ${new Date().toISOString()} |`,
    `| **错误信息** | ${errorMsg} |`,
    ``,
    `站点已自动标记为离线状态，恢复正常后将自动评论通知。`,
    ``,
    `> 此 Issue 由 Status Monitor Bot 自动创建`,
  ].join("\n");

  try {
    const result = await githubAPI("POST", `/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      title,
      body,
      labels: ["故障告警", "status-monitor"],
    });
    console.log(`📝 已创建 Issue #${result.number}: ${title}`);
  } catch (e) {
    console.error("创建 Issue 失败:", e.message);
  }
}

/**
 * 通过 GitHub API 在已有 Issue 上添加恢复评论
 * @param {string} siteName - 站点名称
 * @param {string} issueTitle - 原 Issue 标题（用于搜索匹配）
 */
async function commentResolved(siteName) {
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) return;

  try {
    // 搜索未关闭的故障 Issue
    const issues = await githubAPI(
      "GET",
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=status-monitor&state=open&per_page=50`
    );

    const matchIssue = issues.find(
      (issue) => issue.title.includes(siteName) && issue.title.includes("离线")
    );

    if (matchIssue) {
      const body = [
        `## ✅ 站点已恢复正常`,
        ``,
        `| 项目 | 详情 |`,
        `|------|------|`,
        `| **站点名称** | ${siteName} |`,
        `| **恢复时间** | ${new Date().toISOString()} |`,
        ``,
        `站点已重新上线，此 Issue 将自动关闭。`,
        ``,
        `> 此评论由 Status Monitor Bot 自动添加`,
      ].join("\n");

      // 添加评论
      await githubAPI(
        "POST",
        `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${matchIssue.number}/comments`,
        { body }
      );

      // 关闭 Issue
      await githubAPI(
        "PATCH",
        `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${matchIssue.number}`,
        { state: "closed" }
      );

      console.log(`✅ 已关闭 Issue #${matchIssue.number}: ${siteName} 恢复正常`);
    }
  } catch (e) {
    console.error("处理恢复评论失败:", e.message);
  }
}

/**
 * 调用 GitHub REST API
 * @param {string} method - HTTP 方法
 * @param {string} apiPath - API 路径
 * @param {Object} body - 请求体（可选）
 * @returns {Promise<Object>} 响应数据
 */
function githubAPI(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: apiPath,
      method: method,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "StatusMonitor/1.0",
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${data}`));
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 检查 history.json 是否接近大小上限，若超限则归档
 * 策略：将当前 history.json 重命名为 history-{timestamp}.json，
 *       新建空的 history.json 继续写入，
 *       manifest.json 记录所有归档文件列表供前端读取。
 * @returns {Object} 当前可用的 history 数据（归档后为空壳，未归档则原样返回）
 */
function archiveIfNeeded() {
  const manifest = loadJSON(MANIFEST_FILE);
  if (!manifest.files) manifest.files = [];

  let fileSize = 0;
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fileSize = fs.statSync(HISTORY_FILE).size;
    }
  } catch (_) {}

  if (fileSize < MAX_FILE_BYTES) {
    return null; // 未触发归档
  }

  // 生成归档文件名：history-20240625T120000Z.json
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const archiveName = `history-${ts}.json`;
  const archivePath = path.join(DATA_DIR, archiveName);

  // 重命名当前 history.json → 归档文件
  fs.renameSync(HISTORY_FILE, archivePath);
  console.log(`📦 history.json 已达 ${(fileSize / 1024 / 1024).toFixed(1)}MB，归档为 ${archiveName}`);

  // 更新 manifest
  manifest.files.push(archiveName);
  saveJSON(MANIFEST_FILE, manifest);

  return true; // 触发了归档
}

/**
 * 清理过期历史数据
 * @param {Object} history - 历史数据对象
 * @returns {Object} 清理后的数据
 */
function cleanOldData(history) {
  const maxDays = config.historyDays || 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  // 清理过期的每日数据
  if (history.daily) {
    for (const dateKey of Object.keys(history.daily)) {
      if (dateKey < cutoffStr) {
        delete history.daily[dateKey];
      }
    }
  }

  // 清理过期的响应时间历史（保留最近 24 小时）
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (history.responseTimeHistory) {
    for (const siteName of Object.keys(history.responseTimeHistory)) {
      history.responseTimeHistory[siteName] = (
        history.responseTimeHistory[siteName] || []
      ).filter((entry) => entry.time >= oneDayAgo);
    }
  }

  // 清理过期的故障记录
  if (history.incidents) {
    history.incidents = history.incidents.filter(
      (inc) => !inc.resolvedAt || inc.resolvedAt >= cutoffStr
    );
  }

  return history;
}

/**
 * 主函数：执行完整的检测流程
 */
async function main() {
  console.log("🚀 开始站点检测...");
  console.log(`📅 时间: ${new Date().toISOString()}`);
  console.log(`📋 分组数: ${config.groups.length}`);

  // 加载现有数据
  const oldStatus = loadJSON(STATUS_FILE);
  let history = loadJSON(HISTORY_FILE);

  // 初始化历史数据结构
  if (!history.daily) history.daily = {};
  if (!history.incidents) history.incidents = [];
  if (!history.responseTimeHistory) history.responseTimeHistory = {};

  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // 构建旧状态索引（用于检测状态变化）
  const oldSiteMap = {};
  if (oldStatus.groups) {
    for (const group of oldStatus.groups) {
      for (const site of group.sites || []) {
        oldSiteMap[site.name] = site;
      }
    }
  }

  // 逐组检测
  const newStatus = {
    lastUpdate: now,
    globalStatus: "operational",
    groups: [],
  };

  let totalSites = 0;
  let totalOnline = 0;
  let hasPartialDown = false;

  for (const group of config.groups) {
    console.log(`\n📁 检测分组: ${group.name}`);
    const groupResult = {
      name: group.name,
      online: 0,
      total: group.sites.length,
      sites: [],
    };

    for (const site of group.sites) {
      totalSites++;
      const result = await checkSite(site);
      groupResult.sites.push(result);

      // 计算可用率（结合历史数据）
      const uptime = calculateUptime(history, site.name);
      result.uptime = uptime;

      if (result.status === "up") {
        groupResult.online++;
        totalOnline++;
        console.log(`  ✅ ${site.name}: ${result.responseTime}ms | SSL: ${result.sslDaysLeft}天`);

        // 检查是否从故障中恢复
        if (oldSiteMap[site.name] && oldSiteMap[site.name].status === "down") {
          await commentResolved(site.name);
          // 记录恢复事件
          history.incidents.push({
            site: site.name,
            group: group.name,
            type: "resolved",
            time: now,
            resolvedAt: now,
          });
        }
      } else {
        hasPartialDown = true;
        console.log(`  ❌ ${site.name}: ${result.error}`);

        // 检查是否是新的故障
        if (!oldSiteMap[site.name] || oldSiteMap[site.name].status === "up") {
          await createIssue(site.name, result.error, group.name);
          // 记录故障事件
          history.incidents.push({
            site: site.name,
            group: group.name,
            type: "down",
            time: now,
            error: result.error,
            resolvedAt: null,
          });
        }
      }

      // 更新今日历史数据
      if (!history.daily[today]) {
        history.daily[today] = { sites: {} };
      }
      if (!history.daily[today].sites[site.name]) {
        history.daily[today].sites[site.name] = {
          checks: 0,
          upChecks: 0,
          totalResponseTime: 0,
          downChecks: 0,
        };
      }
      const dayStats = history.daily[today].sites[site.name];
      dayStats.checks++;
      if (result.status === "up") {
        dayStats.upChecks++;
        dayStats.totalResponseTime += result.responseTime;
      } else {
        dayStats.downChecks++;
      }
      dayStats.avgResponseTime =
        dayStats.upChecks > 0
          ? Math.round(dayStats.totalResponseTime / dayStats.upChecks)
          : 0;

      // 更新响应时间历史
      if (result.status === "up") {
        if (!history.responseTimeHistory[site.name]) {
          history.responseTimeHistory[site.name] = [];
        }
        history.responseTimeHistory[site.name].push({
          time: now,
          value: result.responseTime,
        });
      }
    }

    newStatus.groups.push(groupResult);
    console.log(
      `  📊 ${group.name}: ${groupResult.online}/${groupResult.total} 在线`
    );
  }

  // 计算全局状态
  if (totalOnline === 0 && totalSites > 0) {
    newStatus.globalStatus = "down";
  } else if (hasPartialDown || totalOnline < totalSites) {
    newStatus.globalStatus = "degraded";
  } else {
    newStatus.globalStatus = "operational";
  }

  console.log(`\n📊 全局状态: ${newStatus.globalStatus} (${totalOnline}/${totalSites} 在线)`);

  // 清理过期历史数据
  history = cleanOldData(history);
  history.lastUpdate = now;

  // 检查是否需要归档（history.json 接近 90MB 时拆分）
  const didArchive = archiveIfNeeded();
  if (didArchive) {
    console.log("📦 已触发归档，本次写入新的 history.json");
  }

  // 保存数据
  saveJSON(STATUS_FILE, newStatus);
  saveJSON(HISTORY_FILE, history);

  // 初始化 / 更新 manifest
  const manifest = loadJSON(MANIFEST_FILE);
  if (!manifest.files) manifest.files = [];
  manifest.lastUpdate = now;
  manifest.currentFile = "history.json";
  saveJSON(MANIFEST_FILE, manifest);

  console.log("💾 数据已保存");

  // Git 提交
  gitCommit();

  console.log("\n✅ 检测完成！");
}

// 执行主函数
main().catch((err) => {
  console.error("❌ 检测脚本异常:", err);
  process.exit(1);
});
