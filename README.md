# Hitari's Blog

> 一个把「前端工程化」和「LLM 应用」放在一起的个人博客 —— React + TypeScript + Vite，浏览器内跑向量检索，部署在 GitHub Pages。

[![CI](https://github.com/hidari123/hidari123.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/hidari123/hidari123.github.io/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**在线地址**：https://hidari123.github.io

---

## 这个项目想解决什么

大多数「个人博客 + AI 助手」的实现是把后端接上一个 LLM API，前端只负责发请求。这个项目多做了一步：**把向量检索完全放在浏览器里**。

- 不需要服务器存 embedding，不需要向量数据库
- 用户点一次「索引博客」，模型在本地下载、本地推理、本地建库
- API Key 只存在浏览器的 localStorage 里，前端不代理任何请求
- 首屏不加载任何模型文件（27MB 的 ONNX wasm 是用户主动点才下载的）

代价是首次索引需要下载模型（约 22MB，int8 量化版），换来的是零服务端成本和零数据出境。

---

## 核心能力

| 能力 | 实现要点 |
| --- | --- |
| **多模型适配** | DeepSeek / OpenAI / SiliconFlow / 自定义，统一走 OpenAI 兼容协议；抽象成 `ProviderConfig` + `streamChat` |
| **流式输出** | SSE 增量解析，**按行缓冲**处理分片边界（见下方「踩过的坑」） |
| **随时中断** | `AbortController` + 主动检查 signal，保留已生成内容，标记 `finishReason: aborted` |
| **参数可调** | temperature / top_p / max_tokens，附每个参数的取舍说明 |
| **用量可见** | 解析响应里的 `usage`，实时显示输入/输出 token 占比与累计消耗 |
| **上下文裁剪** | 多轮对话按 token 预算从最老开始丢弃，system 消息永远保留 |
| **向量检索** | 浏览器内 ONNX Runtime + int8 量化 MiniLM，余弦相似度召回 |
| **提示词模板** | 6 个高频场景预设，选中即插入并自动调整温度 |
| **对话导出** | 一键导出为 Markdown |
| **代码生成封面** | slug 派生的 SVG 渐变封面，零网络请求、零体积、同 slug 永远同图 |

---

## 技术决策记录

这一节是面试时最可能被追问的部分，所以写清楚「为什么这么做」而不只是「用了什么」。

### 1. 首屏 chunk 从 803KB 降到 406KB

原始构建把所有页面打进一个主 chunk，任何访客都要下载用不到的 AI 和文章依赖。

**做法**：

- 路由级懒加载（`React.lazy` + `Suspense`），首页保持静态引入以优化 LCP
- `onnxruntime-web` 改成 `import type` + 运行时 `await import()`，彻底移出主 chunk
- `AIChat` 拆成「触发按钮」和「面板」两个文件，面板懒加载 —— 它静态引入了 `react-markdown`，连带整条 micromark/mdast 解析链（约 60KB）都被拖进首屏
- `manualChunks` 把 prismjs / giscus / onnxruntime 拆成独立块

**结果**：

| | 优化前 | 优化后 |
| --- | --- | --- |
| 主 chunk (raw) | 803 KB | 406 KB |
| 主 chunk (gzip) | 232 KB | 127 KB |
| onnxruntime | 在主 chunk 内 | 独立 403 KB，按需加载 |
| 27MB wasm | 首屏预加载 | 点「索引博客」才下载 |

分析脚本：`pnpm analyze:bundle`（基于 sourcemap 做依赖级字节归属）

### 2. 文章目录点击不跳转 —— 根因是 slug 算法不一致

侧边栏目录和正文标题的 `id` 必须完全一致，否则锚点跳转就是死的。

**做法**：TOC 提取和 `rehype-slug` 插件**共用同一个 `github-slugger` 实例逻辑**，每次调用新建实例（避免跨文章计数器漂移），保证两边算法严格一致。同时 TOC 提取时会先剥离围栏代码块 —— 否则代码块里的 `# 注释` 会被误判成标题。

配套：`scroll-margin-top: 5rem` 避免锚点跳转后标题被吸顶导航盖住。

### 3. SSE 分片会静默吞掉 token

网络分片和 SSE 事件边界不对齐是常态，一段 JSON 完全可能横跨两个 chunk。

原来的实现是 `chunk.split("\n")`，每段末尾那个不完整的行会被丢掉，`JSON.parse` 抛错后被 `catch` 吞掉 —— 表现为**回答里莫名其妙少几个字，且极难复现**。

**做法**：实现 `SSELineBuffer`，把不完整的行留在缓冲区，等下一个 chunk 补齐再处理。这个 bug 有对应的回归测试（`llmService.test.ts`）。

### 4. GitHub Pages 没有服务端重写

直接访问 `/blog/xxx` 会返回 404，不会转发给 `index.html`。

**做法**：生成一份零依赖的 `404.html`，把原始路径编码进 `?p=` 重定向到根目录的 `index.html`，再由 `main.tsx` 里的 `restoreSpaPath()` 还原地址栏交给 React Router。

> 这里踩过一个坑：第一版实现会**无限重定向**（`/blog` → `/404.html?blog` → `404.html?blog` → …），浏览器最终报 HTTP 431。原因是相对路径在深层 URL 下解析错误，且缺少幂等判断。现在有 `p=` 存在性检查兜底。

### 5. 封面图不用图片

**原来的实现**：35 篇文章共用同一张 Unsplash 外链图。既不美观，又是第三方热链 —— 演示现场网络一抖就变空白。

**现在的实现**：`slug → FNV-1a 哈希 → 色板 + 几何纹理`，用 CSS 渐变 + 内联 SVG 实时绘制。

- 零网络请求、零体积（对比 35 张图片的几十 MB）
- 同一篇文章永远得到同一张图（可复现）
- 12 个色板 × 6 种纹理 = 72 种组合，足够区分
- 文字层用 HTML 而不是 SVG `<text>` —— 卡片是 208px 高、详情页是 21:9，比例不同，用 SVG 画文字会被 `slice` 裁切

### 6. 安全：密钥不进仓库，也不进构建产物

- `.env` 只在本地，`.gitignore` 已覆盖
- 用 `git filter-repo` 清除了历史中的 `.env` 和模型文件（`.git` 从 595MB 降到 11MB）
- `scripts/audit-secrets.cjs` 扫描 `dist/`，发现密钥泄漏直接让 CI 失败
- 模型文件（27MB）不进仓库，用 `pnpm fetch:model` 按需下载

---

## 目录结构

```
src/
├── components/
│   ├── AI/           # AIChat(触发器) / AIChatPanel(懒加载) / ModelParams / UsageMeter / PromptTemplates
│   ├── Blog/         # PostCover / Toc / MarkdownCode / GiscusComments / AudioReader
│   ├── Common/       # LoadingSpinner / ProgressiveGrid / Toast / PerformancePanel
│   ├── Home/         # ToolCard / ToolFilter / SubmitToolModal
│   └── Layout/       # Layout / Navbar / Footer / CustomCursor
├── config/
│   ├── aiProviders.ts   # 多服务商定义
│   └── profile.ts       # 个人资料与精选文章
├── hooks/
├── pages/            # Home(静态) / BlogList / BlogPost / AIPage / AIHelp / Settings / NotFound
├── services/
│   ├── llmService.ts    # LLM 会话引擎：SSE / 中断 / usage / 上下文裁剪
│   ├── ragService.ts    # ONNX 推理 + 向量检索
│   ├── aiService.ts     # 旧接口（逐步迁移到 llmService）
│   └── blogService.ts
├── utils/
│   └── toc.ts        # 目录提取（与 rehype-slug 共用 slug 算法）
└── styles/

scripts/
├── audit-secrets.cjs  # 密钥泄漏扫描（CI 门禁）
├── spa-fallback.cjs   # 生成 404.html
├── fetch-model.cjs    # 按需下载 ONNX 模型
├── rebuild-index.cjs  # 生成文章索引
└── analyze-bundle.cjs # 依赖级体积分析
```

---

## 常用命令

```bash
pnpm dev              # 开发服务器
pnpm build            # 类型检查 + 构建
pnpm test             # 单元测试（36 个）
pnpm lint             # ESLint
pnpm audit:secrets    # 扫描构建产物里的密钥
pnpm analyze:bundle   # 依赖级体积分析
pnpm fetch:model      # 下载 ONNX 模型（首次运行 RAG 前需要）
```

---

## 技术栈

**前端**：React 18 · TypeScript 5.3 · Vite 5 · Tailwind CSS 3 · React Router 6 · framer-motion · lucide-react

**AI**：ONNX Runtime Web (int8 量化 MiniLM) · 自研 SSE 流式客户端 · OpenAI 兼容协议适配

**工程**：Vitest · ESLint · Prettier · GitHub Actions（自动部署到 gh-pages）

---

## 已知取舍

诚实地写下来，比藏起来更能体现工程判断力。

- **framer-motion 约占 116KB 未压缩**。动效遍布全站，替换成 CSS 动画收益有限、改造面很大，暂时保留。
- **lucide-react 引入 58 个图标约 40KB**。已经避开 `import *` 全量引入（那会拉进 2700+ 个图标），但要做到极致还得逐个换成深路径导入。
- **首次 RAG 索引需要下载 22MB 模型**。已用 int8 量化替代 fp32（86MB），但首次体验仍有等待。
- **向量检索是纯前端暴力计算**。35 篇文章规模够用，文章数量上一个量级后需要换成 WASM SIMD 或服务端索引。

---

## License

[MIT](./LICENSE)
