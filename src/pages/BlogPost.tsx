/*
 * @Author: hidari
 * @Date: 2026-05-13 15:35
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 13:43:17
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Calendar,
  Tag,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  User,
  List,
} from "lucide-react";
import { getPostBySlug, getAllPosts, type Post } from "@/services/blogService";
import { GiscusComments } from "@/components/Blog/GiscusComments";
import { AISummary } from "@/components/AI/AISummary";
import { useAIContext } from "@/context/AIContext";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

// 计算阅读时长
function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const text = content.replace(/[#*`\[\]()]/g, "");
  const words = text.split(/\s+/).filter((word) => word.length > 0).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

// 提取目录
interface TocItem {
  level: number;
  text: string;
  id: string;
}

function extractToc(content: string): TocItem[] {
  const toc: TocItem[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "-");
      toc.push({ level, text, id });
    }
  }

  return toc;
}

// 骨架屏
const PostSkeleton = () => (
  <div className="animate-pulse max-w-3xl mx-auto">
    <div className="h-8 bg-[var(--bg-secondary)] rounded w-1/2 mb-4"></div>
    <div className="flex items-center gap-4 mb-8">
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-24"></div>
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-24"></div>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-[var(--bg-secondary)] rounded"></div>
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-5/6"></div>
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-4/5"></div>
    </div>
  </div>
);

// 404 组件
const NotFound = () => {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-20"
    >
      <div className="text-6xl mb-4">🔍</div>
      <h2 className="text-2xl font-semibold mb-4">文章未找到</h2>
      <p className="text-[var(--text-secondary)] mb-8">抱歉，找不到您要访问的文章</p>
      <button onClick={() => navigate("/blog")} className="btn flex items-center gap-2 mx-auto">
        <ArrowLeft className="w-4 h-4" />
        返回博客列表
      </button>
    </motion.div>
  );
};

export const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const { setCurrentArticle } = useAIContext();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(true);

  useEffect(() => {
    const loadPost = async () => {
      if (!slug) return;

      setLoading(true);
      try {
        const [postData, allPostsData] = await Promise.all([getPostBySlug(slug), getAllPosts()]);

        setPost(postData);
        setAllPosts(allPostsData);

        if (postData) {
          setToc(extractToc(postData.content));
          // 设置当前文章到全局上下文
          setCurrentArticle(postData.content, postData.title);
        }
      } catch (error) {
        console.error("加载文章失败:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [slug]);

  // 获取上一篇和下一篇文章
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] py-12">
        <div className="container">
          <PostSkeleton />
        </div>
      </div>
    );
  }

  if (!post) {
    // 清除当前文章
    setCurrentArticle(null, null);
    return (
      <div className="min-h-[calc(100vh-8rem)] py-12">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <NotFound />
          </div>
        </div>
      </div>
    );
  }

  const readingTime = calculateReadingTime(post.content);

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12">
      <div className="container">
        {/* 返回按钮 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full mx-auto mb-8"
        >
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            返回博客列表
          </Link>
        </motion.div>

        <div className="relative">
          <div className="lg:flex lg:gap-12">
            {/* 文章内容 */}
            <motion.article
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="wfull mx-auto"
            >
              {/* 文章头部 */}
              <header className="mb-8">
                {/* 标题 */}
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight"
                >
                  {post.title}
                </motion.h1>

                {/* 元信息 */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)] pb-6 border-b border-[var(--border)]"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>我</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{post.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{readingTime} 分钟阅读</span>
                  </div>
                  {toc.length > 0 && (
                    <button
                      onClick={() => setShowToc(!showToc)}
                      className="flex items-center gap-2 ml-auto lg:hidden text-[var(--accent)] hover:text-[var(--accent)]/80"
                    >
                      <List className="w-4 h-4" />
                      <span>目录</span>
                    </button>
                  )}
                </motion.div>
              </header>

              {/* 移动端目录 */}
              {showToc && toc.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="lg:hidden mb-8 p-4 bg-[var(--bg-secondary)] rounded-xl"
                >
                  <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">目录</h3>
                  <nav className="space-y-1">
                    {toc.map((item, index) => (
                      <a
                        key={index}
                        href={`#${item.id}`}
                        className={`block text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors py-1 ${
                          item.level === 2 ? "" : item.level === 3 ? "ml-3" : "ml-6"
                        }`}
                      >
                        {item.text}
                      </a>
                    ))}
                  </nav>
                </motion.div>
              )}

              {/* 标签 */}
              {post.tags.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap gap-2 mb-8"
                >
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/blog?tag=${encodeURIComponent(tag)}`}
                      className="px-3 py-1.5 text-sm rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)] hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      {tag}
                    </Link>
                  ))}
                </motion.div>
              )}

              {/* AI 摘要 */}
              <AISummary content={post.content} onApiKeyRequired={() => {}} />

              {/* 文章内容 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="markdown-body"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      const codeString = String(children).replace(/\n$/, "");
                      const [copied, setCopied] = useState(false);

                      const handleCopy = useCallback(async () => {
                        try {
                          await navigator.clipboard.writeText(codeString);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch (err) {
                          console.error("复制失败:", err);
                        }
                      }, [codeString]);

                      // 如果是行内代码
                      if (!match) {
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }

                      // 代码块 - 使用 Prism 高亮
                      useEffect(() => {
                        if (match) {
                          const codeElement = document.querySelector(
                            `[data-language="${language}"]`,
                          );
                          if (codeElement) {
                            Prism.highlightElement(codeElement as Element);
                          }
                        }
                      }, [codeString, language]);

                      return (
                        <div className="code-block-wrapper">
                          {language && <span className="code-lang">{language}</span>}
                          <button onClick={handleCopy} className="copy-button" title="复制代码">
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <pre>
                            <code
                              data-language={language}
                              className={`language-${language}`}
                              {...props}
                            >
                              {children}
                            </code>
                          </pre>
                        </div>
                      );
                    },
                  }}
                >
                  {post.content}
                </ReactMarkdown>
              </motion.div>

              {/* 上一篇/下一篇导航 */}
              <div className="flex flex-col sm:flex-row justify-between gap-4 mt-12 pt-8 border-t border-[var(--border)]">
                {prevPost ? (
                  <Link
                    to={`/blog/${prevPost.slug}`}
                    className="flex-1 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/10 transition-all group"
                  >
                    <div className="text-xs text-[var(--text-secondary)] mb-1">上一篇</div>
                    <div className="flex items-center gap-2">
                      <ChevronLeft className="w-4 h-4 text-[var(--accent)] group-hover:-translate-x-1 transition-transform" />
                      <span className="line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                        {prevPost.title}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="flex-1"></div>
                )}

                {nextPost && (
                  <Link
                    to={`/blog/${nextPost.slug}`}
                    className="flex-1 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/10 transition-all group text-right"
                  >
                    <div className="text-xs text-[var(--text-secondary)] mb-1">下一篇</div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                        {nextPost.title}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[var(--accent)] group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                )}
              </div>
            </motion.article>

            {/* 桌面端侧边栏 - 目录 */}
            {toc.length > 0 && (
              <motion.aside
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="hidden lg:block w-64 flex-shrink-0"
              >
                <div className="sticky top-24">
                  <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                    <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)] flex items-center gap-2">
                      <List className="w-4 h-4 text-[var(--accent)]" />
                      目录
                    </h3>
                    <nav className="space-y-1">
                      {toc.map((item, index) => (
                        <a
                          key={index}
                          href={`#${item.id}`}
                          className={`block text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors py-1.5 border-l-2 border-transparent hover:border-[var(--accent)] ${
                            item.level === 2 ? "" : item.level === 3 ? "ml-3" : "ml-6"
                          }`}
                        >
                          {item.text}
                        </a>
                      ))}
                    </nav>
                  </div>
                </div>
              </motion.aside>
            )}
          </div>

          {/* 评论区 - Giscus */}
          {slug && <GiscusComments slug={slug} />}
        </div>
      </div>
    </div>
  );
};
