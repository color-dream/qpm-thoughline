# 架构说明

## 产品边界

念头的核心闭环是“捕获、关联、续接”。Web 应用保证本地记录和画布组织；AI 能力通过复制/粘贴与用户选择的服务配合，不成为领域模型的硬依赖。

## 当前模型

当前快照由三类集合组成：

- `Task`：一个工作上下文，包含标题、目标、状态、来源和时间戳。
- `GraphNode`：画布节点，`kind` 为 `task`、`thought`、`ai` 或 `free`，包含位置、尺寸、折叠状态和内容投影。
- `Edge`：节点关系，类型为 `child`、`related` 或 `sequence`。

`GraphSnapshot` 是 `{ tasks, nodes, edges }`。浏览器路径把完整快照序列化到 localStorage。

长期目标是将领域事实拆成 `Thought`、`Task` 和独立的画布 `Node` 投影，但 Alpha 版本必须先保持当前快照兼容。

## 代码边界

### `src/shared`

放置不依赖 React 的类型、校验、布局、导出和文本模板：

- `graph.ts`：类型、进度语义和快照清理
- `layout.ts`：捕获落点、空位查找和放射布局
- `feed.ts`：provider-neutral 的 AI 文本和剪贴板桥
- `export.ts`：Markdown/JSON 导出与导入合并
- `store.ts`：localStorage 快照持久化适配

### `src/store`

Zustand store 负责把用户操作映射到共享规则和持久化操作。组件不应自行写 localStorage。

### `src/features/canvas`

画布只负责视图、手势、选区和上下文菜单。边类型和节点合法性由 store/shared 层决定。

## 持久化边界

应用使用 `qpm-thoughtline-*` localStorage key；首次读取时兼容旧 `qpm-box-*` 键。浏览器容量和清理策略由当前 origin 的存储实现决定。具体快照格式和迁移规则见 [data-format.md](data-format.md)。

## 重要限制

- Web 页面没有操作系统级全局快捷键和托盘；页面聚焦时的快捷键由浏览器处理。
- localStorage 容量和清理策略由浏览器决定。
- 真实浏览器手势不由当前 Vitest 单测完全覆盖。
- AI 集成目前是复制文本/粘贴结果，不监听第三方 AI，也不默认发送网络请求。
