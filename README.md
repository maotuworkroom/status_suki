# Sukiing 服务状态

Sukiing圣地巡礼站的实时服务状态监控页面，基于 GitHub Actions + GitHub Pages，零服务器、零费用。

**在线地址**：https://maotuworkroom.github.io/status_suki/

## 功能

- 每 5 分钟自动检测所有站点（HTTP/HTTPS/关键词/SSL 证书）
- 响应时间折线图 + 30 天可用性色块
- 站点离线自动创建 Issue，恢复自动关闭
- 多语言（中/英/日）+ 深色模式
- 数据超 90MB 自动按月归档
- 纯静态前端，MDUI 组件

## 快速部署

### 1. 创建仓库

GitHub 新建仓库 `status_suki`（Public），不要初始化 README。

### 2. 上传文件

```bash
git clone https://github.com/你的用户名/status_suki.git
cd status_suki
# 将本项目所有文件复制进来
git add .
git commit -m "init"
git push origin main
```

### 3. 开启 GitHub Pages

Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)` → Save

### 4. 开启 Actions 写权限

Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save

### 5. 手动触发首次检测

Actions → Site Monitor → Run workflow → Run workflow

等待 1 分钟后访问 `https://你的用户名.github.io/status_suki/`

## 增删监控站点

编辑 `scripts/config.js`，修改 `groups` 数组：

```javascript
groups: [
  {
    name: "我的服务",      // 分组名
    icon: "cloud",         // Material Icons 图标名
    sites: [
      { name: "首页", url: "https://example.com", keyword: "" },
      { name: "API",  url: "https://api.example.com/health", keyword: "ok" },
    ],
  },
],
```

- `keyword`：留空只检查 HTTP 状态码，填写则检查页面是否包含该关键词
- 提交推送后，下次 Actions 运行自动生效

## 自定义

| 项目 | 文件 | 说明 |
|------|------|------|
| 检测频率 | `.github/workflows/monitor.yml` | 修改 cron 表达式，如 `*/10 * * * *`（每 10 分钟） |
| 超时/重试 | `scripts/config.js` | `check.timeout`、`check.retries`、`check.retryDelay` |
| SSL 预警天数 | `scripts/config.js` | `alert.sslWarnDays`，默认 30 天 |
| 告警开关 | `scripts/config.js` | `alert.enabled: false` 关闭 Issue 告警 |
| 数据保留 | `scripts/config.js` | `history.daysKeep`，默认 90 天 |

## 文件结构

```
├── .github/workflows/monitor.yml   # Actions 工作流
├── scripts/
│   ├── config.js                   # 站点配置（改这里）
│   └── check.js                    # 探测脚本
├── data/
│   ├── status.json                 # 实时状态（自动生成）
│   ├── history.json                # 历史数据（自动生成）
│   └── archive/                    # 自动归档目录
├── index.html                      # 前端页面（MDUI）
├── style.css                       # 自定义样式
├── render.js                       # 渲染引擎
├── i18n.js                         # 多语言
├── icon.png                        # 图标
├── manifest.json                   # PWA
└── 404.html                        # 自定义 404
```
