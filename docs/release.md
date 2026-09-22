# 发布说明

## 版本策略

- Web 应用和数据格式使用语义化版本。
- 任何会影响 JSON、localStorage 或 SQLite 的变化都必须在 CHANGELOG 和数据格式文档中说明。
- Alpha 阶段允许破坏性 UI 调整，但不应静默丢弃用户数据。

## Web 发布

```bash
npm ci
npm test
npm run typecheck
npm run build
```

将 `dist/` 部署到静态站点即可。生产部署需要配置 SPA fallback 到 `index.html`，并对带 hash 的 `/assets/` 文件启用长期缓存。仓库提供的 Dockerfile 使用 Node 20 构建、Nginx 提供静态文件。

发布前应验证：

- 直接刷新深层 URL 能回退到 `index.html`；
- 浏览器导出和导入 JSON 正常；
- 部署域名变化时，迁移说明仍然可执行；
- 不把 `dist/` 或用户数据提交回源码仓库。

## Tauri 发布

Tauri 是可选实验路径。发布桌面包前需要在目标平台安装 Rust、系统编译工具和 WebView 依赖，并运行：

```bash
npm run tauri:build
```

桌面发布者必须额外检查：

- Tauri permissions 与 `src-tauri/capabilities/default.json` 一致；
- SQLite migration 在干净数据库和升级数据库上都能运行；
- 应用 identifier `app.qpm.thoughtline`、数据目录、安装包升级策略和旧 `qpm-box` 迁移说明一致；
- Windows 安装包签名、checksum 和更新渠道在发布页明确记录；
- 依赖许可证和 NOTICE 随发行物提供。

本仓库当前没有承诺自动更新、跨平台安装包或签名证书。没有完成上述检查时，不应把构建目录称为正式稳定发行版。
