# 数据格式与兼容策略

## JSON 备份

当前导出格式：

```json
{
  "format": "qpm-thoughtline-graph",
  "version": 1,
  "exported_at": "2026-09-22T00:00:00.000Z",
  "tasks": [],
  "nodes": [],
  "edges": []
}
```

`tasks`、`nodes` 和 `edges` 是完整快照。导入时按 ID 合并：任务和节点使用 `updated_at` 判断较新值，边按 ID 去重。导入内容会经过快照结构清理，非法记录和悬空边不会进入运行时状态。

当前导入器也接受：

- 无 `format` 字段的早期快照
- `format: "qpm-box-graph"` 的旧备份
- `format: "qpm-thoughtline-graph"` 的当前备份

新导出只使用 `qpm-thoughtline-graph`，文件名为 `qpm-thoughtline-backup-<timestamp>.json`。

## 浏览器存储

当前 key：

- `qpm-thoughtline-graph-v1`：快照
- `qpm-thoughtline-last-export`：最近一次导出时间
- `qpm-thoughtline-theme-v1`：主题

首次读取时，如果新 key 不存在，应用会从旧 key 迁移：

- `qpm-box-graph-v1`
- `qpm-box-last-export`
- `qp-theme`

清空本地数据会同时删除新旧 key。迁移是复制到新 key，不会主动删除旧 key，以便旧版本仍能读取；用户确认新版本运行正常后可以手动清除旧站点数据。

## 旧桌面数据迁移

当前项目只支持浏览器 localStorage，不会读取 SQLite 或扫描桌面应用数据目录。仍使用旧桌面版的用户，请先在旧版本设置页导出完整 JSON 备份，再在 Web 版设置页导入；确认任务、节点、边和处理状态后保留备份。旧 SQLite 文件可作为迁移前的原始档案留存，但不能直接导入 Web 版。早期 SQLite v1 曾覆盖同一任务下的多条想法，旧版 v2 migration 只能尽力重建历史数据；已被覆盖的内容无法恢复。

## 版本策略

- 修改字段但仍能读取旧结构时，递增文档中的格式版本并保留读取兼容。
- 删除字段或改变语义时，先提供迁移函数和测试夹具。
- 不在没有备份/恢复说明的情况下更换 localStorage key。
- 导出格式是用户数据接口，不能因为内部 UI 重构而随意改名。
