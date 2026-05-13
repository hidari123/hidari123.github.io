#!/usr/bin/env node

/*
 * @Author: hidari
 * @Date: 2026-05-13 15:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:00:28
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 *
 * Usage: npm run new-post "我的新文章"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取命令行参数（跳过 node 和脚本本身）
const args = process.argv.slice(2);
const title = args.join(" ");

// 验证标题
if (!title) {
  console.error("❌ 请提供文章标题");
  console.error('用法: npm run new-post "我的新文章"');
  process.exit(1);
}

// 生成 slug（空格转横线，移除非字母数字字符）
function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // 空格转横线
    .replace(/[^\w\-\u4e00-\u9fa5]/g, "") // 移除非字母数字和中文字符
    .replace(/--+/g, "-") // 多个横线转为一个
    .replace(/^-+|-+$/g, ""); // 移除首尾横线
}

// 获取当前日期
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 生成文件名
const slug = generateSlug(title);
const filename = `${slug}.md`;
const blogsDir = path.join(__dirname, "..", "public", "blogs");
const filepath = path.join(blogsDir, filename);

// 确保目录存在
if (!fs.existsSync(blogsDir)) {
  fs.mkdirSync(blogsDir, { recursive: true });
  console.log("📁 已创建目录: public/blogs/");
}

// 检查文件是否已存在
if (fs.existsSync(filepath)) {
  console.error(`❌ 文件已存在: public/blogs/${filename}`);
  process.exit(1);
}

// 生成 frontmatter 内容
const date = getCurrentDate();
const content = `---
title: "${title}"
date: "${date}"
tags: []
cover: ""
description: ""
---

请在这里开始写作...
`;

// 写入文件
fs.writeFileSync(filepath, content, "utf8");
console.log(`✨ 文章已创建：public/blogs/${filename}`);

// 更新索引文件
const indexPath = path.join(__dirname, "..", "public", "posts", "index.json");
let indexData = [];

if (fs.existsSync(indexPath)) {
  try {
    const existingContent = fs.readFileSync(indexPath, "utf8");
    indexData = JSON.parse(existingContent);
  } catch (error) {
    console.warn("⚠️  无法读取现有索引文件，将创建新文件");
  }
}

// 添加新文章到索引
const newPostIndex = {
  slug,
  title,
  date,
  tags: [],
  cover: "",
  description: "",
};

// 添加到数组开头
indexData.unshift(newPostIndex);

// 写入索引文件
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), "utf8");
console.log(`📋 已更新索引：public/posts/index.json`);

console.log(`📝 标题: ${title}`);
console.log(`📅 日期: ${date}`);
console.log(`🔗 Slug: ${slug}`);
