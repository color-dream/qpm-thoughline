# 开发指南

## 环境

- Node.js 20+
- npm 10+（以 `package-lock.json` 为准）
- 可选桌面开发：Rust stable、Windows MSVC 构建工具和 Tauri 2 所需依赖

## 本地运行

```bash
npm ci
npm run dev
```

默认开发服务器是 <http://localhost:5173>。生产构建：

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

不要把 `node_modules/`、`dist/`、`coverage/`、`src-tauri/target/`、`.env` 或 `*.tsbuildinfo` 提交到仓库。

## 项目结构

```text
src/
  App.tsx                 应用壳、捕获层和路由视图
  features/canvas/        画布渲染与交互
  features/settings/      设置、导入导出入口
  shared/                 领域类型、存储、导出、布局和纯函数测试
  store/                  Zustand 图状态与操作
  styles/                 主题 token 和组件样式
src-tauri/
  src/                    Tauri 入口、托盘、快捷键和 SQLite migration
  capabilities/           Tauri 权限声明
  icons/                  应用图标
docs/                     当前说明与历史设计材料
design/                   不参与构建的交互设计稿
```

当前 `GraphNode` 同时包含画布投影和念头内容，这是 Alpha 阶段的现状。后续拆分领域实体与视图投影时，必须保留 JSON 迁移兼容，参见 [架构说明](docs/architecture.md)。

## 代码约定

- 使用 TypeScript strict 模式，保持现有函数式/轻量风格。
- 领域规则优先放在 `src/shared/` 的纯函数中，避免在画布组件内复制规则。
- 持久化变化必须同时考虑浏览器 localStorage 和 Tauri SQLite 两条路径。
- 修改导出结构时更新 `docs/data-format.md` 和对应测试。
- 面向用户的文本使用中文；新增可复用模板时不要把具体 AI 厂商写死。
- 不在日志、测试夹具或截图中加入真实用户念头、密钥、Cookie 或其他个人数据。

## 提交前门禁

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

如果改动涉及 Tauri：

```bash
npm run tauri:build
```

没有 Rust 工具链时，应在 PR 中明确说明未运行桌面检查，不要把 Web 检查结果当成桌面验证。

## 数据变更

对 localStorage key、备份 `format`、SQLite 文件名或 migration 做修改时：

1. 先阅读 [数据格式与兼容策略](docs/data-format.md)。
2. 保留旧数据读取或提供明确迁移步骤。
3. 为旧格式和新格式各写一个测试夹具。
4. 更新 [迁移说明](docs/migration-from-qpm-box.md) 或 CHANGELOG。

## 运行设计稿

`design/画布交互稿.html` 是静态交互参考，不是生产入口。它不应引入新的运行时依赖，也不应被 Docker 镜像当作应用入口。
