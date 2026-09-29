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
  App.tsx                 工作区应用壳与浏览器内捕获层
  features/canvas/        画布渲染与交互
  features/settings/      设置、导入导出入口
  shared/                 领域类型、存储、导出、布局和纯函数测试
  store/                  Zustand 图状态与操作
  styles/                 主题 token 和工作区组件样式
src/landing.ts            公开首页样式入口
src/landing.css           公开首页视觉与响应式样式
workspace/index.html      GitHub Pages 工作区静态入口
public/                   robots、sitemap 和社交分享资源
docs/                     当前说明与历史设计材料
design/                   不参与构建的交互设计稿
```

当前持久化采用 canonical `ThoughtlineDocument`：领域实体与画布投影分离。`src/shared/graph.ts` 只提供 Canvas 使用的 view-model，不是磁盘格式。canonical 类型、严格校验和空文档构造在 `src/shared/document.ts`。

## 代码约定

- 使用 TypeScript strict 模式，保持现有函数式/轻量风格。
- 领域规则优先放在 `src/shared/` 的纯函数中，避免在画布组件内复制规则。
- 持久化通过 canonical document 一次性校验写入，JSON 导入使用完整 replace，不提供隐式 merge。
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

对 canonical 文档结构做修改时：

1. 先阅读 [Canonical Document v1](docs/data-format.md)。
2. 明确是否需要新的 schema 版本；当前版本不保留旧格式兼容层。
3. 更新 golden fixture 和严格校验测试。
4. 更新架构说明、README 和 CHANGELOG。

## 运行设计稿

`design/画布交互稿.html` 是静态交互参考，不是生产入口。它不应引入新的运行时依赖。
