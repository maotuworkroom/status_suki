# 📊 Status Page - 站点监控系统

基于 GitHub Actions + GitHub Pages 的纯静态站点监控系统，完全免费，无需服务器。

## ✨ 功能特性

- 🔄 GitHub Actions 定时探测（最小5分钟间隔）
- 📊 实时状态、响应时间折线图、30天可用性色块
- 🌐 多语言自动切换（中/英/日/韩）
- 🌙 深色模式自动跟随系统
- 🚨 站点离线自动创建 Issue，恢复自动关闭
- 📱 移动端完美自适应
- 🎨 MDUI Material Design 风格

## 📁 文件结构

```
status/
├── .github/workflows/monitor.yml   # GitHub Actions 工作流
├── scripts/check.js                 # 检测脚本
├── config.js                        # ⭐ 站点配置（修改这个文件！）
├── data/
│   ├── status.json                  # 实时状态数据（自动生成）
│   └── history.json                 # 历史记录数据（自动生成）
├── index.html                       # 前端页面
├── style.css                        # 页面样式
├── render.js                        # 前端渲染逻辑
└── README.md                        # 本文档
```

## 🚀 部署步骤

### 第一步：创建 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（例如 `status-page`）
2. 将本项目所有文件推送到仓库：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/status-page.git
git push -u origin main
```

### 第二步：开启 GitHub Pages

1. 进入仓库 → **Settings** → **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，目录选 `/ (root)`
4. 点击 **Save**
5. 等待几分钟后访问 `https://你的用户名.github.io/status-page/`

### 第三步：配置 Actions 权限

1. 进入仓库 → **Settings** → **Actions** → **General**
2. 找到 **Workflow permissions**
3. 选择 **Read and write permissions**
4. 勾选 **Allow GitHub Actions to create and approve pull requests**
5. 点击 **Save**

### 第四步：修改站点配置

编辑 `config.js` 文件，修改你要监控的站点：

```js
groups: [
  {
    name: "Public",        // 分组名称
    icon: "public",        // Material Symbols 图标名
    sites: [
      {
        name: "我的网站",           // 显示名称
        url: "https://my-site.com", // 探测地址
        method: "GET",              // 请求方法
        expectedStatus: 200,        // 期望状态码
        keyword: "",                // 页面关键词（可选）
      },
      // ... 添加更多站点
    ],
  },
],
```

同时修改 `github` 配置（用于 Issue 告警）：

```js
github: {
  owner: "你的GitHub用户名",
  repo: "你的仓库名",
},
```

### 第五步：验证运行

1. 进入仓库 → **Actions** 页面
2. 点击左侧 **Status Monitor** 工作流
3. 点击 **Run workflow** 手动触发一次
4. 等待运行完成后刷新 Pages 页面查看结果

## ⚙️ 自定义配置

### 修改检测频率

编辑 `.github/workflows/monitor.yml` 中的 cron 表达式：

```yaml
schedule:
  - cron: '*/5 * * * *'   # 每5分钟（最小间隔）
  - cron: '*/10 * * * *'  # 每10分钟
  - cron: '*/30 * * * *'  # 每30分钟
  - cron: '0 * * * *'     # 每小时
```

### 新增监控站点

在 `config.js` 的 `groups` 数组中添加新的站点对象：

```js
{
  name: "新站点",
  url: "https://new-site.com",
  method: "GET",
  expectedStatus: 200,
  keyword: "Welcome",  // 检测页面是否包含此关键词
}
```

### 删除监控站点

直接从 `config.js` 的 `sites` 数组中删除对应对象即可。

### 新增分组

在 `config.js` 的 `groups` 数组中添加新的分组：

```js
{
  name: "分组名称",
  icon: "cloud",  // Material Symbols 图标名
  sites: [ ... ],
}
```

可用图标名参考：https://fonts.google.com/icons

### 修改页面标题

编辑 `config.js` 中的 `pageTitle`：

```js
pageTitle: "我的状态页",
```

### 修改主题配色

编辑 `config.js` 中的 `theme` 对象：

```js
theme: {
  primary: "#6366f1",    // 主色调
  success: "#22c55e",    // 正常绿色
  warning: "#f59e0b",    // 警告黄色
  danger: "#ef4444",     // 故障红色
},
```

### 修改版权信息

编辑 `config.js` 中的 `copyright`：

```js
copyright: "© 2024 Your Name",
```

## 📖 工作原理

```
GitHub Actions (定时触发)
    ↓
check.js (Node.js 探测脚本)
    ↓
检测每个站点的 HTTP 状态、响应时间、SSL 证书
    ↓
更新 data/status.json 和 data/history.json
    ↓
Git commit + push 到仓库
    ↓
GitHub Pages 自动部署
    ↓
用户访问页面 → fetch JSON → 渲染 UI
```

## 🔧 故障排除

### Actions 没有运行

- 检查仓库 **Settings** → **Actions** → **General** 是否启用了 Actions
- 确认 Workflow permissions 已设置为 **Read and write permissions**

### Pages 页面显示空白

- 确认 GitHub Pages 已开启
- 检查浏览器控制台是否有 CORS 错误（GitHub Pages 不应有此问题）
- 确认 `data/status.json` 文件存在且格式正确

### 站点检测全部失败

- 检查目标站点是否可从公网访问
- 确认 `config.js` 中的 URL 格式正确
- 查看 Actions 运行日志排查具体错误

### Issue 告警未创建

- 确认 `config.js` 中 `github.owner` 和 `github.repo` 已正确填写
- 检查 Actions 的 `GITHUB_TOKEN` 权限（需要 `issues: write`）

## 📄 许可证

MIT License - 自由使用和修改
