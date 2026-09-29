# 架构说明

## 产品边界

念头的核心闭环是“捕获、关联、续接”。Web 应用保证本地记录和画布组织；AI 能力通过复制/粘贴与用户选择的服务配合，不成为领域模型的硬依赖。

## Canonical 数据模型

当前持久化对象是版本化的 `ThoughtlineDocument`，定义在 `src/shared/document.ts`。文档固定包含：

- `tasks`：任务领域实体
- `thoughts`：想法领域实体
- `outputs`：AI 产出领域实体
- `canvas_nodes`：领域实体的画布投影和几何状态
- `edges`：画布投影之间的关系

`canvas_nodes` 不保存正文。画布运行时通过 `src/shared/graph.ts` 将 canonical document 投影为 Canvas 使用的 view-model；该 view-model 不直接序列化。

## 代码边界

### `src/shared`

放置不依赖 React 的类型、校验、布局、导出和持久化适配：

- `document.ts`：canonical v1 类型、枚举、UUID/时间工具、严格校验和空文档构造
- `graph.ts`：画布 view-model 与 canonical 实体投影转换、几何和进度辅助
- `layout.ts`：捕获落点、空位查找和放射布局
- `feed.ts`：AI 文本、时间线摘要和剪贴板桥
- `export.ts`：canonical JSON 导出、严格解析和完整 replace 恢复
- `store.ts`：`qpm-thoughtline-document` localStorage 文档读改写

### `src/store`

Zustand store 负责把用户操作映射到 canonical 文档写入，并在内存中维护 Canvas view-model。每次成功的文档变更都会递增 `revision`、刷新文档 `updated_at`，校验通过后一次性写入。

### `src/features/canvas`

画布只负责视图、手势、选区和上下文菜单。它消费 view-model，不直接写 localStorage，也不解释 canonical JSON。

## 持久化边界

当前唯一数据 key 是 `qpm-thoughtline-document`，内容就是 `qpm-thoughtline-document` schema v1。首次读取不存在时创建空文档。旧 `qpm-box`、旧 `qpm-thoughtline-graph-v1` 和旧裸快照不会读取、迁移或删除；这是有意的破坏性数据断点。

JSON 导出文件正文与 canonical document 完全相同，可直接用于本地恢复或未来云端全量备份。导入为 replace 语义，必须先完整校验，失败不得改变现有文档。

## 云端备份边界

第一阶段云端只保存完整 canonical document。服务端可以为备份增加外部元数据，但不修改文档正文。多端实时同步需要独立的 ChangeSet/sync 协议，不把设备、操作日志、tombstone 或冲突状态塞进备份格式。

## 重要限制

- Web 页面没有操作系统级全局快捷键和托盘；页面聚焦时的快捷键由浏览器处理。
- localStorage 容量和清理策略由浏览器决定。
- 真实浏览器手势不由当前 Vitest 单测完全覆盖。
- Markdown 是不可逆的阅读/AI 摘要，不用于恢复或云备份。
