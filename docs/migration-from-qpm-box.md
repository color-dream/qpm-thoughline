# 旧迁移说明（历史材料）

当前版本从全新的 canonical document v1 开始，不兼容旧 `qpm-box`、旧 `qpm-thoughtline-graph-v1`、旧裸快照或旧字段别名。

旧数据不会被新版本读取、迁移或删除。需要保留旧数据时，应在旧版本中单独导出并保留原始文件；当前版本的导入器只接受 `qpm-thoughtline-document` 且 `schema_version: 1` 的完整文档。

当前恢复流程是完整 replace：先严格校验，确认后整体替换本地文档；不提供旧格式转换或按 ID merge。未来若需要迁移旧数据，应在独立工具中生成 canonical v1 文件，而不是把兼容逻辑加入运行时。
