# 🟢 Status Page — 免费静态网站监控系统

基于 GitHub Actions + GitHub Pages 的全静态网站监控系统，零服务器、零费用、零额度限制。

## ✨ 功能特性

- **定时探测**：GitHub Actions 定时轮询，最小 5 分钟间隔，自定义 Cron 周期
- **数据持久化**：所有监控指标以 JSON 文件存储在仓库，每次检测自动提交
- **前端托管**：纯静态 HTML/CSS/JS 页面，部署 GitHub Pages，零后端
- **告警通知**：站点离线自动创建 GitHub Issue，恢复后自动关闭
- **响应时间图表**：Canvas 绘制的实时响应时间折线图
- **30 天可用性**：色块条形图直观展示历史可用率
- **SSL 证书监控**：自动检测证书过期天数并预警
- **多语言支持**：自动检测浏览器语言（中文 / English / 日本語）
- **深色模式**：一键切换浅色/深色主题
- **MDUI 组件**：基于 Material Design 风格的 UI 组件库

## 📁 项目结构

```
status/
├── .github/
│   └── workflows/
│       └── monitor.yml          # GitHub Actions 定时探测工作流
├── scripts/
│   ├── check.js                 # 监控探测脚本（Node.js）
│   └── config.js                # ★ 站点配置文件（修改这里增删网址）
├── data/
│   ├── status.json              # 实时状态数据（自动生成）
│   └── history.json             # 历史记录数据（自动生成）
├── index.html                   # 前端主页面
├── style.css                    # 自定义样式
├── render.js                    # 前端渲染逻辑
├── i18n.js                      # 多语言模块
└── README.md                    # 本文件
```

## 🚀 快速部署（5 分钟）

### 第一步：创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)，点击右上角 **+** → **New repository**
2. 仓库名填写 `status`（或任意名称）
3. 设置为 **Public**（GitHub Pages 免费版需要 Public 仓库）
4. 点击 **Create repository**

### 第二步：上传文件

将本项目所有文件上传到仓库根目录，保持目录结构不变。

```bash
# 克隆你的仓库
git clone https://github.com/你的用户名/status.git
cd status

# 复制所有文件到仓库目录
# （如果你是从其他位置下载的本项目）

# 提交并推送
git add .
git commit -m "init: status page"
git push origin main
```

### 第三步：开启 GitHub Pages

1. 进入仓库 → **Settings** → **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，目录选择 `/ (root)`
4. 点击 **Save**
5. 等待 1-2 分钟，访问 `https://你的用户名.github.io/status/`

### 第四步：确认 Actions 权限

1. 进入仓库 → **Settings** → **Actions** → **General**
2. **Workflow permissions** 选择 **Read and write permissions**
3. 勾选 **Allow GitHub Actions to create and approve pull requests**
4. 点击 **Save**

### 第五步：等待首次检测

Actions 会自动运行（每 5 分钟一次），首次运行后页面即可显示数据。

你也可以手动触发：**Actions** → **Site Monitor** → **Run workflow** → **Run workflow**

## 📝 如何增删监控站点

**只需编辑一个文件：`scripts/config.js`**

### 添加新站点

在对应分组的 `sites` 数组中添加新条目：

```javascript
{
  name: "新站点名称",        // 显示在页面上的名称
  url: "https://new-site.com", // 要监控的 URL
  keyword: "欢迎",           // 可选：页面必须包含的关键词
}
```

### 添加新分组

```javascript
{
  name: "新分组",           // 分组名称
  icon: "cloud",            // Material Icons 图标名
  sites: [
    { name: "站点A", url: "https://a.com", keyword: "" },
    { name: "站点B", url: "https://b.com", keyword: "ok" },
  ],
}
```

### 删除站点

直接删除对应的 `{ name, url, keyword }` 对象即可。

### 常用 Material Icons 图标名

| 图标名 | 含义 |
|--------|------|
| `public` | 地球/公共 |
| `dns` | 服务器 |
| `cloud` | 云 |
| `lock` | 锁/内部 |
| `storage` | 数据库 |
| `language` | 网站 |
| `api` | API |
| `shopping_cart` | 电商 |

修改后提交推送到仓库，下次 Actions 运行时自动生效。

## ⚙️ 自定义配置

### 修改检测频率

编辑 `.github/workflows/monitor.yml` 中的 cron 表达式：

```yaml
schedule:
  - cron: '*/5 * * * *'   # 每 5 分钟（默认）
  # - cron: '*/10 * * * *'  # 每 10 分钟
  # - cron: '*/15 * * * *'  # 每 15 分钟
  # - cron: '0 * * * *'     # 每小时
```

### 修改页面标题

编辑 `scripts/config.js` 中的 `page.title`：

```javascript
page: {
  title: "我的监控页面",
}
```

### 修改主题配色

编辑 `style.css` 顶部的 CSS 变量：

```css
:root {
  --green: #22c55e;    /* 正常状态颜色 */
  --yellow: #fbbf24;   /* 警告状态颜色 */
  --red: #ef4444;      /* 故障状态颜色 */
  --orange: #f97316;   /* 可用率数字颜色 */
  --blue: #3b82f6;     /* 主题蓝色 */
}
```

### 修改超时和重试

编辑 `scripts/config.js`：

```javascript
check: {
  timeout: 15000,      // 请求超时（毫秒）
  retries: 2,          // 失败重试次数
  retryDelay: 3000,    // 重试间隔（毫秒）
}
```

### 关闭 Issue 告警

```javascript
alert: {
  enabled: false,      // 改为 false 关闭告警
}
```

## 🔧 故障排查

### 页面显示「暂无数据」

- 等待 Actions 首次运行完成（约 1-2 分钟）
- 检查 **Actions** 标签页是否有失败的工作流
- 确认 Pages 设置中 Branch 选择了 `main`

### Actions 运行失败

- 检查 **Settings** → **Actions** → **General** → Workflow permissions 是否为 Read/Write
- 查看 Actions 日志中的错误信息

### Issue 告警不工作

- 确认 `config.js` 中 `alert.enabled` 为 `true`
- 确认 Actions 的 permissions 包含 `issues: write`

## 📄 License

MIT License - 自由使用和修改。
