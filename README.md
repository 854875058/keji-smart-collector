# Keji Smart Collector

`Keji Smart Collector` 是一个 Chrome Manifest V3 扩展，面向 AI 对话与网页内容的收藏、整理与二次编辑。

当前目录看起来是一个可直接加载的打包产物，而不是完整的前端源码工程。主要能力包括：

- 在 ChatGPT、Claude、Gemini、Grok 页面识别回答内容并保存
- 支持网页划词保存、整页内容保存、多段内容收集
- 本地笔记管理：搜索、收藏、置顶、归档到笔记本
- `web.html` 提供更完整的笔记浏览与编辑界面
- 通过 Supabase 提供账号登录与云端同步能力

## 目录说明

- `manifest.json`：扩展清单
- `sidepanel.html`：侧边栏入口
- `web.html`：独立网页端笔记中心
- `assets/background.js`：后台 service worker
- `assets/content.js`：内容脚本，负责页面注入与抓取
- `assets/sidepanel.js`：侧边栏主界面逻辑
- `assets/web.js`：网页端笔记中心逻辑
- `assets/globals.js`：共享运行时代码与组件打包产物

## 当前状态

- 这是一个浏览器扩展发布目录，缺少常见的 `src/`、`package.json`、构建脚本等开发文件
- 项目已接入 Supabase，并包含本地存储与云同步逻辑
- 后续修改建议优先补充版本管理、梳理可维护的源码结构，再逐步做功能调整

## 本地加载

1. 打开 Chrome 扩展管理页
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 指向当前目录

## 版本管理说明

本仓库用于记录当前目录下扩展产物与后续改动历史。Git 代理建议仅在当前仓库范围内配置，不写入全局环境。
