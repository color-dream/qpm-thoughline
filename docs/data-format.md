# Canonical Document v1

`qpm-thoughtline` 只读写一种数据文档：`qpm-thoughtline-document`，`schema_version` 固定为 `1`。当前版本不兼容旧的 `qpm-box`、`qpm-thoughtline-graph-v1`、裸 `GraphSnapshot` 或旧字段别名；旧 localStorage key 不读取、不迁移、不删除。

## 文档结构

```json
{
  "format": "qpm-thoughtline-document",
  "schema_version": 1,
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "revision": 0,
  "created_at": "2026-09-24T09:00:00.000Z",
  "updated_at": "2026-09-24T09:00:00.000Z",
  "tasks": [],
  "thoughts": [],
  "outputs": [],
  "canvas_nodes": [],
  "edges": []
}
```

`format`、`schema_version`、`document_id`、`revision`、文档时间和五个集合都是必填字段。所有时间必须为带毫秒、以 `Z` 结尾的 UTC RFC3339 字符串。所有 ID 都是 UUID v4。业务空值统一为 `null`。

`revision` 在每次本地成功写入时递增。`document_id` 在文档创建后保持不变。导出时间、应用版本、云端 `backup_id` 等传输元数据不进入 canonical 文档正文。

## 实体

### `tasks`

```json
{
  "id": "uuid",
  "title": "任务名称",
  "goal": "目标、约束和验收标准",
  "status": "running",
  "archived_at": null,
  "created_at": "RFC3339 UTC",
  "updated_at": "RFC3339 UTC"
}
```

`status` 只能是 `draft`、`running`、`waiting_review`、`done`、`cancelled`。归档使用正式字段 `archived_at`，未归档为 `null`。

### `thoughts`

```json
{
  "id": "uuid",
  "task_id": null,
  "content": "想法正文",
  "progress": "todo",
  "handled_at": null,
  "created_at": "RFC3339 UTC",
  "updated_at": "RFC3339 UTC"
}
```

`task_id` 为空表示想法池内容。`progress` 始终存在，取 `todo`、`doing`、`done`。`handled_at` 未处理时为 `null`。

### `outputs`

```json
{
  "id": "uuid",
  "task_id": null,
  "content": "AI 产出正文",
  "created_at": "RFC3339 UTC",
  "updated_at": "RFC3339 UTC"
}
```

AI 产出是独立领域实体，不携带想法的进度或处理字段。

### `canvas_nodes`

```json
{
  "id": "uuid",
  "entity_type": "task",
  "entity_id": "uuid",
  "position": { "x": 120, "y": 240 },
  "size": { "width": 240, "height": 100 },
  "collapsed": false,
  "created_at": "RFC3339 UTC",
  "updated_at": "RFC3339 UTC"
}
```

`entity_type` 取 `task`、`thought`、`output`。画布节点只保存实体投影和几何，不保存正文。每个实体最多一个画布投影；非任务投影的 `collapsed` 必须为 `false`。

### `edges`

```json
{
  "id": "uuid",
  "source_node_id": "uuid",
  "target_node_id": "uuid",
  "kind": "child",
  "created_at": "RFC3339 UTC",
  "updated_at": "RFC3339 UTC"
}
```

`kind` 取 `child`、`related`、`sequence`。所有端点必须引用存在的 `canvas_nodes`，禁止自环和重复端点关系。`child` 的源必须是任务投影，目标必须是想法或产出投影。

## 校验和写入

所有入口都经过同一流程：

```text
JSON parse -> format/version -> 字段 -> ID -> 引用 -> 关系 -> 一次性写入
```

未知字段、缺失字段、非法类型、重复 ID、悬空引用、非法枚举、非法时间、非法边方向都会拒绝。校验失败不会写入部分数据，也不会静默清空当前文档。

## 本地存储

当前唯一 key：

```text
qpm-thoughtline-document
```

localStorage 保存完整 canonical document。首次读取不存在时创建空文档。损坏文档会抛出校验错误，用户需要显式清空后重新开始；程序不会读取任何旧 key。

## 导入和导出

JSON 文件正文就是 canonical document，不额外包旧的 `version` 或 `exported_at` envelope。

导出文件可直接作为云端备份正文。导入是 `replace` 语义：先完整校验，成功后整体替换本地文档；失败时本地数据不变。当前不提供按 ID 的隐式 merge。未来多端合并应使用独立的 ChangeSet/sync 协议。

Markdown 是不可逆的阅读、复盘和 AI 协作摘要，不用于恢复、迁移或云端备份。

## 云端备份边界

第一阶段云端只保存 canonical document 的完整版本。服务端可以额外保存 `backup_id`、上传时间、hash、大小和存储位置，但这些字段不写回用户文档。实时多端同步的设备、操作日志、tombstone 和服务端 revision 不属于本备份格式。
