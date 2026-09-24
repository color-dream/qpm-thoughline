# Contributing to qpm-thoughtline

感谢参与念头。项目目前处于 Web-first Alpha，优先接受能改善“捕获、关联、续接”闭环的改动。

## 开始之前

1. 阅读 [README](README.md)、[开发指南](DEVELOPMENT.md) 和 [数据格式](docs/data-format.md)。
2. 创建分支，保持一个变更主题一个 PR。
3. 不要把真实念头、任务、剪贴板内容、Cookie、密钥或个人数据提交到 issue、测试夹具或截图。

## 本地验证

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

涉及持久化或导入导出时，运行本地验证并检查旧数据兼容性。

## 提交代码

- 保持现有 TypeScript strict 配置和轻量组件风格。
- 领域规则放在 `src/shared`，不要在多个 UI 组件中复制。
- 持久化使用浏览器 localStorage，并维护 JSON 导入导出兼容。
- 修改数据结构、导出格式或存储 key 时，必须更新文档、迁移说明和测试。
- 不提交构建产物、依赖目录、工具状态或编辑器配置。
- 新增外部代码、图标、字体或视觉资产时，先确认许可证并更新 [NOTICE](NOTICE)。

## Pull Request

PR 应说明：

- 用户行为或 API 有什么变化；
- 运行了哪些测试；
- 是否影响导入导出、存储、隐私或权限；
- 是否需要迁移或 CHANGELOG 条目；
- 是否包含生成文件，以及为什么必须包含。

维护者可能要求把功能拆成更小的 PR，以便审查数据兼容和隐私影响。

## 行为准则

参与项目即同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。安全漏洞请遵循 [SECURITY.md](SECURITY.md)，不要先发公开 issue。
