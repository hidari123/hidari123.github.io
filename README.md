# AI Blog

一个现代化的个人博客系统，支持暗色/亮色主题切换。

## 特性

- 🎨 暗色/亮色主题切换
- 📱 响应式设计，适配各种设备
- 📝 Markdown 文章支持
- 💬 Giscus 评论系统（基于 GitHub Discussions）
- 🔍 文章标签筛选
- 📖 阅读时长估算
- 📑 自动生成文章目录
- 🎯 代码高亮显示

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

### 构建生产版本

```bash
pnpm build
```

## 配置说明

### 环境变量配置

复制 `.env.example` 文件为 `.env` 并配置必要的环境变量：

```bash
cp .env.example .env
```

### Giscus 评论系统配置

Giscus 是一个基于 GitHub Discussions 的评论系统，用户可以使用 GitHub 账号登录评论，无需自己配置 API。

#### 配置步骤

1. **创建一个 GitHub 仓库**
   - 创建一个新的公开仓库用于存放评论
   - 例如：`blog-comments`

2. **开启 GitHub Discussions**
   - 进入仓库设置
   - 找到 "Features" 部分
   - 勾选 "Discussions"

3. **获取 Giscus 配置参数**
   - 访问 [https://giscus.app](https://giscus.app)
   - 按照提示填写：
     - 仓库 URL
     - 讨论分类（建议选择 "Announcements" 或新建一个 "Comments" 分类）
   - 页面会自动生成配置参数

4. **配置环境变量**
   - 复制 `.env.example` 为 `.env`
   - 填入以下配置：
     ```env
     VITE_GISCUS_REPO=用户名/仓库名
     VITE_GISCUS_REPO_ID=仓库ID
     VITE_GISCUS_CATEGORY=分类名称
     VITE_GISCUS_CATEGORY_ID=分类ID
     ```

5. **安装 Giscus GitHub App（可选但推荐）**
   - 访问 [Giscus App](https://github.com/apps/giscus)
   - 安装到你的评论仓库
   - 设置权限为 "Only select repositories" 并选择评论仓库

### 文章目录结构

```
public/blogs/
├── article-1.md
├── article-2.md
└── ...
```

### 文章格式

```markdown
---
title: "文章标题"
date: "2024-01-01"
tags: ["标签1", "标签2"]
cover: "" # 可选，封面图片 URL
description: "文章描述"
---

# 文章正文

这里是 Markdown 内容...
```

## 技术栈

- **框架**: React + TypeScript
- **构建工具**: Vite
- **路由**: React Router
- **样式**: Tailwind CSS
- **动画**: Framer Motion
- **Markdown**: react-markdown + remark-gfm
- **代码高亮**: PrismJS
- **图标**: Lucide React
- **评论**: Giscus

## 项目结构

```
src/
├── components/     # 组件
│   ├── Blog/      # 博客相关组件
│   └── Layout/    # 布局组件
├── pages/         # 页面组件
├── services/      # 服务层
├── styles/        # 样式文件
└── hooks/         # 自定义 Hooks
```

## License

MIT
