# 发布说明

## 版本策略

- Web 应用和数据格式使用语义化版本。
- 任何会影响 JSON 或 localStorage 的变化都必须在 CHANGELOG 和数据格式文档中说明。
- Alpha 阶段允许破坏性 UI 调整，但不应静默丢弃用户数据。

## Web 发布

```bash
npm ci
npm test
npm run typecheck
npm run build
```

将 `dist/` 发布到 GitHub Pages。构建产物包含公开首页 `dist/index.html` 和工作区入口 `dist/workspace/index.html`；GitHub Pages workflow 会负责安装依赖、运行测试和类型检查、构建并上传 Pages artifact。部署产物包含 `.nojekyll`，应用数据仍保存在访问者浏览器的 localStorage 中。

发布前应验证：

- 公开首页可直接读取产品定位、隐私边界和工作区入口；
- 新用户首次进入工作区应看到空任务列表和空画布，不应出现示例数据；已有 localStorage 快照仍应读取。
- 直接访问和刷新 `/workspace/` 能加载工作区入口；
- 工作区页面包含 `noindex, nofollow`，不进入公开 sitemap；
- GitHub Pages workflow 能完成测试、类型检查、构建和 artifact 上传；
- 浏览器导出和导入 JSON 正常；
- 部署域名变化时，迁移说明仍然可执行；
- 不把 `dist/` 或用户数据提交回源码仓库。

## GitHub Pages 发布

推送到 `master` 或 `main`，或手动触发，会运行 [deploy-pages.yml](../.github/workflows/deploy-pages.yml)：构建通过测试与类型检查后，把 `dist/` 发布到 GitHub Pages。

- 项目页地址为 `https://<owner>.github.io/<repo>/`；根路径是公开首页，工作区入口为 `/<repo>/workspace/`。
- 构建时通过环境变量 `BASE_PATH=/<repo>/` 注入 Vite base；`vite.config.ts` 会校验其格式。
- 若部署到用户/组织主页仓库（`<owner>.github.io`）或自定义域名，请删除该 workflow 中的 `BASE_PATH` 行，让 base 保持默认 `/`。
- 首次启用需要在仓库 Settings → Pages 把 Source 设为 **GitHub Actions**；若 CI 中的自动启用因权限失败，请手动设置后重跑。
- 本地模拟子路径构建（Git Bash 需禁用路径转换）：`MSYS_NO_PATHCONV=1 BASE_PATH=/<repo>/ npm run build`。
- Pages 只是静态托管，没有后端；数据仍保存在访问者浏览器的 localStorage，不同域名/Pages origin 之间不共享。
