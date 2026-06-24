/**
 * ============================================
 *  监控探测脚本 — 由 GitHub Actions 定时调用
 *  功能：批量检测站点状态、响应时间、SSL 证书
 *        更新 status.json / history.json
 *        异常时自动创建 GitHub Issue，恢复时自动关闭
 * ============================================
 */

const fs = require("fs");
const path = require("path");
const tls = require("tls");
const https = require("https");
const http = require("http");

const config = require("./config");

// ── 文件路径 ──────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data");
const STATUS_FILE = path.join(DATA_DIR, "status.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

// ── 工具函数 ──────────────────────────────

function loadJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带时间戳的日志 */
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ── HTTP 探测（支持重定向跟随）─────────────

/**
 * 发起 HTTP/HTTPS 请求，支持手动重定向跟随（最多 3 次）
 */
function httpGet(urlStr, timeout, maxRedirects = 3) {
  return _httpRequest(urlStr, timeout, maxRedirects, 0);
}

function _httpRequest(urlStr, timeout, maxRedirects, redirectCount) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const start = Date.now();

    const req = lib.get(
      urlStr,
      {
        headers: {
          "User-Agent": "StatusMonitor/1.0",
          Accept: "text/html,application/json,*/*",
        },
        timeout,
        rejectUnauthorized: false,
      },
      (res) => {
        // 跟随重定向
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirectCount < maxRedirects
        ) {
          res.resume();
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith("/")) {
            redirectUrl = url.origin + redirectUrl;
          }
          return _httpRequest(redirectUrl, timeout, maxRedirects, redirectCount + 1).then(resolve);
        }

        let body = "";
        let bodySize = 0;
        res.on("data", (chunk) => {
          body += chunk;
          bodySize += chunk.length;
          // 限制读取大小，防止内存溢出
          if (bodySize > 1024 * 1024) {
            res.destroy();
          }
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            responseTime: Date.now() - start,
            body,
            bodySize,
            error: null,
            redirected: redirectCount > 0,
          });
        });
        res.on("error", (err) => {
          resolve({
            ok: false,
            status: res.statusCode || 0,
            responseTime: Date.now() - start,
            body: "",
            bodySize: 0,
            error: err.message,
            redirected: redirectCount > 0,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        status: 0,
        responseTime: Date.now() - start,
        body: "",
        bodySize: 0,
        error: "请求超时",
        redirected: false,
      });
    });

    req.on("error", (err) => {
      resolve({
        ok: false,
        status: 0,
        responseTime: Date.now() - start,
        body: "",
        bodySize: 0,
        error: err.message || "连接失败",
        redirected: false,
      });
    });
  });
}

// ── SSL 证书检测 ───────────────────────────

function checkSSL(hostname, port = 443, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(
        port,
        hostname,
        { servername: hostname, rejectUnauthorized: false },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            if (cert && cert.valid_to) {
              const expiry = new Date(cert.valid_to);
              const days = Math.floor(
                (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              socket.destroy();
              resolve(days);
            } else {
              socket.destroy();
              resolve(-1);
            }
          } catch {
            socket.destroy();
            resolve(-1);
          }
        }
      );

      socket.on("error", () => {
        socket.destroy();
        resolve(-1);
      });

      socket.setTimeout(timeout, () => {
        socket.destroy();
        resolve(-1);
      });
    } catch {
      resolve(-1);
    }
  });
}

// ── 带重试的站点检测 ──────────────────────

async function checkSite(site) {
  const retries = config.check.retries || 2;
  const retryDelay = config.check.retryDelay || 3000;
  const timeout = config.check.timeout || 15000;
  let lastResult = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      log(`    ↻ 重试 ${attempt}/${retries}...`);
      await sleep(retryDelay);
    }

    const result = await httpGet(site.url, timeout);

    if (!result.ok) {
      lastResult = {
        status: "down",
        responseTime: result.responseTime,
        message: result.error
          ? `连接错误: ${result.error}`
          : `HTTP ${result.status}`,
        sslDaysLeft: -1,
      };
      continue;
    }

    if (site.keyword && !result.body.includes(site.keyword)) {
      lastResult = {
        status: "down",
        responseTime: result.responseTime,
        message: `未找到关键词 "${site.keyword}"`,
        sslDaysLeft: -1,
      };
      continue;
    }

    let sslDaysLeft = -1;
    if (site.url.startsWith("https://")) {
      const hostname = new URL(site.url).hostname;
      sslDaysLeft = await checkSSL(hostname);
    }

    return {
      status: "up",
      responseTime: result.responseTime,
      message: "",
      sslDaysLeft,
    };
  }

  return lastResult;
}

// ── GitHub Issue 告警 ─────────────────────

async function createGitHubIssue(title, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    log("[告警] 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY，跳过 Issue 创建");
    return null;
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title,
        body,
        labels: ["monitoring", "alert"],
      }),
    });

    if (!resp.ok) {
      log(`[告警] Issue 创建失败: ${resp.status} ${await resp.text()}`);
      return null;
    }

    const data = await resp.json();
    log(`[告警] Issue 已创建: #${data.number} ${title}`);
    return data.number;
  } catch (err) {
    log(`[告警] Issue 创建异常: ${err.message}`);
    return null;
  }
}

async function findOpenIssue(siteName) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;

  try {
    const label = "monitoring,alert";
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=${label}&state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!resp.ok) return null;
    const issues = await resp.json();
    return issues.find((i) => i.title.includes(siteName)) || null;
  } catch {
    return null;
  }
}

async function closeGitHubIssue(issueNumber, comment) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;

  try {
    await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ body: comment }),
      }
    );

    await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ state: "closed" }),
      }
    );

    log(`[告警] Issue #${issueNumber} 已关闭`);
  } catch (err) {
    log(`[告警] Issue 关闭异常: ${err.message}`);
  }
}

// ── 历史数据管理 ──────────────────────────

function ensureHistoryKey(history, groupName, siteName) {
  const key = `${groupName}|${siteName}`;
  if (!history.sites) history.sites = {};
  if (!history.sites[key]) {
    history.sites[key] = {
      daily: [],
      responseTime: [],
      incidents: [],
      currentDown: null,
    };
  }
  return key;
}

function updateDailyUptime(siteData, isUp, responseTime) {
  const today = todayStr();
  let day = siteData.daily.find((d) => d.date === today);

  if (!day) {
    day = { date: today, checks: 0, passes: 0, totalResponse: 0, uptime: 100, avgResponseTime: 0 };
    siteData.daily.push(day);
  }

  day.checks += 1;
  if (isUp) day.passes += 1;
  day.totalResponse = (day.totalResponse || 0) + responseTime;
  day.uptime = parseFloat(((day.passes / day.checks) * 100).toFixed(2));
  day.avgResponseTime = Math.round(day.totalResponse / day.checks);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (config.history.daysKeep || 90));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  siteData.daily = siteData.daily.filter((d) => d.date >= cutoffStr);
}

function appendResponseTime(siteData, responseTime) {
  siteData.responseTime.push({
    time: nowISO(),
    value: responseTime,
  });

  const max = config.history.maxResponsePoints || 288;
  if (siteData.responseTime.length > max) {
    siteData.responseTime = siteData.responseTime.slice(-max);
  }
}

function recordIncident(siteData, isDown, reason) {
  if (isDown) {
    if (!siteData.currentDown) {
      siteData.currentDown = nowISO();
      siteData.incidents.push({
        start: siteData.currentDown,
        end: null,
        reason: reason,
        duration: 0,
      });
    }
  } else {
    if (siteData.currentDown) {
      const now = nowISO();
      const lastIncident = siteData.incidents[siteData.incidents.length - 1];
      if (lastIncident && !lastIncident.end) {
        lastIncident.end = now;
        lastIncident.duration =
          new Date(now).getTime() - new Date(lastIncident.start).getTime();
      }
      siteData.currentDown = null;
    }
  }
}

// ── 主流程 ────────────────────────────────

async function main() {
  log("=".repeat(50));
  log(`开始检测 — ${nowISO()}`);
  log(`分组数: ${config.groups.length}，总站点: ${config.groups.reduce((s, g) => s + g.sites.length, 0)}`);
  log("=".repeat(50));

  const status = loadJSON(STATUS_FILE, { lastUpdate: "", groups: [] });
  const history = loadJSON(HISTORY_FILE, { sites: {} });

  const now = nowISO();
  let totalSites = 0;
  let upSites = 0;

  for (const group of config.groups) {
    log(`\n[分组] ${group.name} (${group.sites.length} 个站点)`);

    let statusGroup = status.groups.find((g) => g.name === group.name);
    if (!statusGroup) {
      statusGroup = { name: group.name, icon: group.icon, sites: [] };
      status.groups.push(statusGroup);
    }

    // 清理 config 中已删除的站点
    const configSiteNames = new Set(group.sites.map((s) => s.name));
    statusGroup.sites = statusGroup.sites.filter((s) => configSiteNames.has(s.name));

    for (const site of group.sites) {
      totalSites++;
      process.stdout.write(`  检测 ${site.name} ... `);

      const result = await checkSite(site);
      const isUp = result.status === "up";

      if (isUp) upSites++;

      console.log(
        isUp
          ? `✓ ${result.responseTime}ms${result.sslDaysLeft >= 0 ? " | SSL:" + result.sslDaysLeft + "d" : ""}`
          : `✗ ${result.message}`
      );

      // 更新 status.json
      let statusSite = statusGroup.sites.find((s) => s.name === site.name);
      if (!statusSite) {
        statusSite = { name: site.name, url: site.url };
        statusGroup.sites.push(statusSite);
      }
      statusSite.status = result.status;
      statusSite.responseTime = result.responseTime;
      statusSite.sslDaysLeft = result.sslDaysLeft;
      statusSite.message = result.message;
      statusSite.lastCheck = now;

      // 更新 history.json
      const histKey = ensureHistoryKey(history, group.name, site.name);
      const siteHist = history.sites[histKey];

      updateDailyUptime(siteHist, isUp, result.responseTime);
      appendResponseTime(siteHist, result.responseTime);

      const wasDown = !!siteHist.currentDown;
      recordIncident(siteHist, !isUp, result.message);

      // 告警逻辑
      if (config.alert.enabled) {
        if (!isUp && !wasDown) {
          const issueTitle = `[DOWN] ${site.name} 离线`;
          const issueBody = [
            `## 站点离线告警`,
            ``,
            `- **站点名称**: ${site.name}`,
            `- **URL**: ${site.url}`,
            `- **分组**: ${group.name}`,
            `- **故障原因**: ${result.message}`,
            `- **检测时间**: ${now}`,
            ``,
            `系统将在站点恢复正常后自动关闭此 Issue。`,
          ].join("\n");
          await createGitHubIssue(issueTitle, issueBody);
        } else if (isUp && wasDown) {
          const issue = await findOpenIssue(site.name);
          if (issue) {
            const comment = [
              `## 站点已恢复`,
              ``,
              `- **站点名称**: ${site.name}`,
              `- **恢复时间**: ${now}`,
              `- **当前响应**: ${result.responseTime}ms`,
              ``,
              `故障已自动恢复，此 Issue 关闭。`,
            ].join("\n");
            await closeGitHubIssue(issue.number, comment);
          }
          siteHist.currentDown = null;
        }

        if (
          result.sslDaysLeft >= 0 &&
          result.sslDaysLeft <= (config.alert.sslWarnDays || 30)
        ) {
          const issue = await findOpenIssue(`[SSL] ${site.name}`);
          if (!issue) {
            const issueTitle = `[SSL] ${site.name} 证书即将过期`;
            const issueBody = [
              `## SSL 证书预警`,
              ``,
              `- **站点**: ${site.name}`,
              `- **URL**: ${site.url}`,
              `- **剩余天数**: ${result.sslDaysLeft} 天`,
              `- **检测时间**: ${now}`,
              ``,
              `请及时续期 SSL 证书。`,
            ].join("\n");
            await createGitHubIssue(issueTitle, issueBody);
          }
        }
      }
    }

    statusGroup.onlineCount = statusGroup.sites.filter(
      (s) => s.status === "up"
    ).length;
    statusGroup.totalCount = statusGroup.sites.length;
  }

  status.lastUpdate = now;
  status.overallStatus =
    upSites === totalSites
      ? "operational"
      : upSites === 0
      ? "major"
      : "partial";
  status.totalSites = totalSites;
  status.upSites = upSites;

  saveJSON(STATUS_FILE, status);
  saveJSON(HISTORY_FILE, history);

  log(`\n${"=".repeat(50)}`);
  log(`完成 — ${upSites}/${totalSites} 在线 (${status.overallStatus})`);
  log("=".repeat(50));
}

main().catch((err) => {
  console.error("[致命错误]", err);
  process.exit(1);
});
