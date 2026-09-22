# 从 qpm-box 迁移

`qpm-thoughtline` 是从早期 `qpm-box`/“青萍助手·念头”实现整理出的独立项目目录。迁移分为代码目录迁移和用户数据迁移两部分。

## 代码目录

当前工作区中的项目目录已经从 `qpm-box/` 移到 `qpm-thoughtline/`。公开仓库不包含 `node_modules`、`dist`、Tauri `target`、工具状态或增量构建文件；使用 `npm ci` 即可重新安装依赖。

## 浏览器数据

如果新版本运行在与旧版本相同的浏览器 origin 下，它会在首次读取时寻找旧 key：

- `qpm-box-graph-v1`
- `qpm-box-last-export`
- `qp-theme`

数据会复制到 `qpm-thoughtline-*` 命名空间。首次启动后请打开设置页确认任务和念头仍在，并立即导出一份新 JSON 备份。

如果部署域名或端口改变，浏览器 origin 也会改变，自动迁移无法跨 origin 工作。此时请在旧版本设置页导出 JSON，再在新版本选择“导入备份”。

## JSON 备份

旧 `qpm-box-graph` 备份仍可导入。导入时会按 ID 合并，较新的任务/节点覆盖本地数据，边按 ID 去重。新版本导出的格式已经改为 `qpm-thoughtline-graph`。

## Tauri 桌面数据

新桌面标识为 `app.qpm.thoughtline`，数据库文件为 `qpm-thoughtline.db`。这代表一个新的应用身份；本次迁移不声称可以直接升级旧 Windows 安装或自动发现旧 `app.qpm.box` 数据目录。

推荐流程：

1. 用旧桌面版本打开应用。
2. 在设置页导出完整 JSON 备份。
3. 安装或启动新版本。
4. 在设置页导入 JSON。
5. 检查任务、节点、边和处理状态。

旧 SQLite 文件请保留到确认迁移完成为止，不要覆盖新数据库。

## 不兼容的内容

- 不支持直接复制旧数据库文件到新应用目录。
- 不保证旧版本缓存的构建产物可直接复用。
- 早期 SQLite v1 曾覆盖同一任务下的多条想法；其 v2 migration 只能对历史数据做尽力重建，已经被覆盖的内容无法恢复。
