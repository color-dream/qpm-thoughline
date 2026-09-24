# 开发指南

## 环境

- Node.js 20+
- npm 10+（以 `package-lock.json` 为准）

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

不要把 `node_modules/`、`dist/`、`coverage/`、`.env` 或 `*.tsbuildinfo` 提交到仓库。

## 项目结构

```text
src/
  App.tsx                 应用壳与浏览器内捕获层
  features/canvas/        画布渲染与交互
  features/settings/      设置、导入导出入口
  shared/                 领域类型、存储、导出、布局和纯函数测试
  store/                  Zustand 图状态与操作
  styles/                 主题 token 和组件样式
docs/                     当前说明与历史设计材料
design/                   不参与构建的交互设计稿
```

当前 `GraphNode` 同时包含画布投影和念头内容，这是 Alpha 阶段的现状。后续拆分领域实体与视图投影时，必须保留 JSON 迁移兼容，参见 [架构说明](docs/architecture.md)。

## 代码约定

- 使用 TypeScript strict 模式，保持现有函数式/轻量风格。
- 领域规则优先放在 `src/shared/` 的纯函数中，避免在画布组件内复制规则。
- 持久化使用浏览器 localStorage，改动时同步维护 JSON 导入导出兼容。
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

## 数据变更

对 localStorage key 或备份 `format` 做修改时：

1. 先阅读 [数据格式与兼容策略](docs/data-format.md)。
2. 保留旧数据读取或提供明确迁移步骤。
3. 为旧格式和新格式各写一个测试夹具。
4. 更新 [迁移说明](docs/migration-from-qpm-box.md) 或 CHANGELOG。

## 运行设计稿

`design/画布交互稿.html` 是静态交互参考，不是生产入口。它不应引入新的运行时依赖。
