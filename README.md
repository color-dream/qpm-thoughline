# 念头 · qpm-thoughtline

念头（`qpm-thoughtline`）是一个本地优先、开源的工作上下文续接工具。

它解决的是一个很小但反复发生的问题：工作中突然冒出一个想法，先用很低的成本接住；之后把它放回任务和上下文中；再次回来时，能继续行动，而不是重新回忆自己当时为什么这样想。

核心闭环是：

```text
捕获 -> 关联 -> 续接
```

画布是组织和导航方式，不是复杂白板目标。AI 是一个可选出口，不是产品必须连接的服务。

> 英文品牌仍是工作名，尚未完成商标、域名、包管理器和平台名称清查。中文产品名“念头”已作为当前界面和数据模型名称使用。

## 当前状态

当前发布形态是 **Web-first Alpha**：

- React 18 + TypeScript + Vite + Zustand
- 浏览器 `localStorage` 本地持久化
- 自研 DOM 节点与 SVG 连线画布
- Tauri 2 桌面壳代码保留为可选路径，尚未作为稳定发行版承诺
- 默认无账号、无遥测、无远程 AI 请求

当前已经支持：

- 双击画布或应用内捕获入口快速记录念头
- 任务、念头、AI 产出和未归类念头
- `child`、`related`、`sequence` 三种关系
- 平移、缩放、拖动、框选、折叠、定位和放射布局
- 未处理状态、进度标记、任务完成提醒
- 将整理后的文本复制到剪贴板，再手动交给任意 AI
- 单任务 Markdown 导出
- JSON 备份导入导出，按 ID 合并、较新数据覆盖
- 从旧 `qpm-box` 浏览器快照和备份格式迁移

它目前不是：

- 通用笔记或知识库
- 项目管理和团队协作系统
- 自动执行任务的 AI Agent
- 默认带云同步的 SaaS
- 追求功能数量的思维导图编辑器

## 快速开始

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run dev
```

浏览器打开 <http://localhost:5173>。常用检查命令：

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

构建结果在 `dist/`，可以由任意静态站点托管。推送到 `main` 会自动部署到 GitHub Pages（配置见 [docs/release.md](docs/release.md)），也可以使用 Docker：

```bash
docker build -t qpm-thoughtline:local .
docker run --rm -p 10109:80 qpm-thoughtline:local
```

Tauri 命令仍保留，但桌面壳属于实验性路径，需要 Rust stable、Windows MSVC 构建工具和 Tauri 所需系统依赖：

```bash
npm run tauri:dev
npm run tauri:build
```

## 数据与隐私

Web 版本默认把数据保存在当前浏览器 origin 的 `localStorage` 中。浏览器通常限制在约 5 MB，清理站点数据也可能删除内容。设置页提供完整 JSON 导出，请在跨设备、清理浏览器或升级前先备份。

Tauri 路径使用应用数据目录中的 SQLite 文件，并额外使用系统剪贴板和通知权限。应用不会默认上传念头、任务或剪贴板内容，也没有内置遥测。把内容复制到第三方 AI 服务时，数据处理由该服务的隐私政策决定。

本地存储不是加密保险箱。不要把密钥、密码或其他不应出现在普通用户目录中的秘密写入念头。

详细说明见 [PRIVACY.md](PRIVACY.md) 和 [docs/data-format.md](docs/data-format.md)。

## 文档

- [文档索引](docs/README.md)
- [架构说明](docs/architecture.md)
- [数据格式与兼容策略](docs/data-format.md)
- [从 qpm-box 迁移](docs/migration-from-qpm-box.md)
- [开发指南](DEVELOPMENT.md)
- [贡献指南](CONTRIBUTING.md)
- [安全政策](SECURITY.md)
- [变更记录](CHANGELOG.md)
- [设计交互稿](design/画布交互稿.html)

`docs/01-核心需求.md`、`docs/02-交互与技术方案.md` 和 `docs/03-开发迭代计划.md` 是原项目的历史设计材料；它们不替代当前代码和本 README。`docs/04-变更记录.md` 保存 Web-first 决策和早期实现记录。

## 路线图

### Alpha 收尾

- 捕获层支持默认 Inbox 和快速选择当前任务
- 补齐“回来后继续”的时间线视图
- 完成真实浏览器黄金路径和静态部署验证
- 增加搜索、筛选和更完整的导入恢复测试

### 后续方向

- 可选 Tauri 全局快捷键、托盘和 SQLite 桌面版
- 浏览器扩展、本地 API 或 MCP 适配器
- 语音输入和本地处理
- 可自托管的同步层

同步、账号、团队协作和自动监听第三方 AI 都不会成为核心 Web 版本的前置条件。

## 许可证与项目名称

代码以 Apache License 2.0 发布，详见 [LICENSE](LICENSE)。依赖和外部参考说明见 [NOTICE](NOTICE)。

`qpm-thoughtline` 是当前技术项目目录和工作仓库名；英文产品名尚未完成正式名称清查。名称可用性不应从本仓库的暂定命名推断。
