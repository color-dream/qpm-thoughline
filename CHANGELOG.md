# Changelog

本文件记录公开项目版本的用户可见变化。早期内部演进记录保留在 [docs/04-变更记录.md](docs/04-变更记录.md)。

## [0.1.0] - 2026-09-22

### Added

- Web-first 本地优先的念头捕获与思维链画布。
- 任务、念头、AI 产出和未归类念头节点。
- 节点关系、进度标记、任务完成提醒和想法池。
- provider-neutral 的剪贴板 AI 文本出口。
- JSON 备份导入导出和单任务 Markdown 导出。
- 旧 `qpm-box` 浏览器存储键与备份格式的兼容读取。
- 开源项目文档、隐私说明、贡献指南、安全政策和 CI 基础配置。

### Known limitations

- Web 版本没有操作系统级全局快捷键和托盘。
- localStorage 容量和清理策略由浏览器决定。
- Tauri 桌面壳仍是可选实验路径，没有稳定跨平台发行包。
- 真实浏览器交互、Tauri 权限和 SQLite migration 的覆盖范围有限。

[0.1.0]: ./CHANGELOG.md#010---2026-09-22
