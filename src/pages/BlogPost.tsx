/*
 * @Author: hidari
 * @Date: 2026-05-13 15:35
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import {
  Calendar,
  Tag,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { getPostBySlug, getAllPosts, type Post } from "@/services/blogService";
import { GiscusComments } from "@/components/Blog/GiscusComments";
import { AISummary } from "@/components/AI/AISummary";
import { AudioReader } from "@/components/Blog/AudioReader";
import { ReadingCat } from "@/components/Blog/ReadingCat";
import { TocSidebar, TocCollapsible } from "@/components/Blog/Toc";
import { MarkdownCode } from "@/components/Blog/MarkdownCode";
import { PostCover } from "@/components/Blog/PostCover";
import { useAIContext } from "@/context/AIContext";
import { useSeo } from "@/hooks/useSeo";
import { showToast } from "@/components/Common/Toast";
import { extractToc, toPlainText } from "@/utils/toc";

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
  const navigate = useNavigate();
  const { setCurrentArticle } = useAIContext();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPosts, setAllPosts] = useState<Post[]>([]);

  // 加载文章
  useEffect(() => {
    let cancelled = false;

    const loadPost = async () => {
      if (!slug) return;

      setLoading(true);
      try {
        const [postData, allPostsData] = await Promise.all([getPostBySlug(slug), getAllPosts()]);
        if (cancelled) return;

        setPost(postData);
        setAllPosts(allPostsData);
        if (postData) {
          setCurrentArticle(postData.content, postData.title);
        }
      } catch (error) {
        console.error("加载文章失败:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPost();
    return () => {
      cancelled = true;
    };
  }, [slug, setCurrentArticle]);

  // 上一篇/下一篇：index 已按日期倒序，所以 index-1 更新
  const { prevPost, nextPost } = useMemo(() => {
    const idx = allPosts.findIndex((p) => p.slug === slug);
    if (idx < 0) return { prevPost: null, nextPost: null };
    return {
      prevPost: allPosts[idx + 1] ?? null,
      nextPost: allPosts[idx - 1] ?? null,
    };
  }, [allPosts, slug]);

  // 监听快捷键事件
  useEffect(() => {
    const handleNextPost = () => {
      if (nextPost) {
        navigate(`/blog/${nextPost.slug}`);
        showToast(`正在跳转到: ${nextPost.title}`, "info");
      } else {
        showToast("已经是最新的一篇了", "warning");
      }
    };

    const handlePrevPost = () => {
      if (prevPost) {
        navigate(`/blog/${prevPost.slug}`);
        showToast(`正在跳转到: ${prevPost.title}`, "info");
      } else {
        showToast("已经是最早的一篇了", "warning");
      }
    };

    window.addEventListener("shortcut-next-post", handleNextPost);
    window.addEventListener("shortcut-prev-post", handlePrevPost);

    return () => {
      window.removeEventListener("shortcut-next-post", handleNextPost);
      window.removeEventListener("shortcut-prev-post", handlePrevPost);
    };
  }, [nextPost, prevPost, navigate]);

  // 未找到时清掉全局上下文，避免 AI 助手拿着上一篇的正文回答
  useEffect(() => {
    if (!loading && !post) {
      setCurrentArticle(null, null);
    }
  }, [loading, post, setCurrentArticle]);

  // 页面级 SEO：标题、描述、分享卡片
  useSeo({
    title: post?.title,
    description: post?.description,
    path: post ? `/blog/${encodeURIComponent(post.slug)}` : undefined,
  });

  const toc = useMemo(() => (post ? extractToc(post.content) : []), [post]);
  const readingTime = useMemo(() => {
    if (!post) return 1;
    // 中文按 ~300 字/分钟，混排文本按 200 词/分钟折算，取两者较大值避免低估
    const text = toPlainText(post.content);
    const byChars = Math.ceil((text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0) / 300);
    const byWords = Math.ceil(text.split(/\s+/).filter(Boolean).length / 200);
    return Math.max(1, byChars, byWords);
  }, [post]);

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

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12">
      {/* 右上角给悬浮目录留出空档。xl:max-w-6xl 到 lg 断点之间宽度不够，
          目录会直接压在正文上；lg:pr-72 把那块空间让出来。 */}
      <div className="container lg:pr-72">
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

        <div>
          {/* 文章内容。桌面端右侧目录已改为 fixed 悬浮（TocSidebar），
              不再需要 lg:flex 的两列布局，正文可以占满宽度。 */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full min-w-0"
          >
            {/* 文章头部 */}
            <header className="mb-8">
              {/* 封面 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl overflow-hidden border border-[var(--border)] mb-8 aspect-[16/9] sm:aspect-[21/9]"
              >
                {post.cover ? (
                  <img
                    src={post.cover}
                    alt={post.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div className={post.cover ? "hidden" : "h-full"}>
                  <PostCover
                    slug={post.slug}
                    title={post.title}
                    category={post.tags[0]}
                    variant="art"
                    className="w-full h-full"
                  />
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight"
              >
                {post.title}
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)] pb-6 border-b border-[var(--border)]"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>hitari</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={post.date}>{post.date}</time>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{readingTime} 分钟阅读</span>
                </div>
              </motion.div>
            </header>

            {/* 移动端目录 */}
            <TocCollapsible items={toc} />

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

            {/* AI 摘要：需要用户自己提供 key，不会在构建期注入任何凭据 */}
            <AISummary content={post.content} onApiKeyRequired={() => {}} />

            {/* 语音朗读 */}
            <div className="flex items-center gap-3 mb-8">
              <AudioReader content={post.content} />
            </div>

            {/* 文章正文
                rehype-slug 给每个标题注入 id，与 utils/toc.ts 里 github-slugger
                生成的 slug 出自同一套规则，目录锚点因此才能对上。 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="markdown-body"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]}
                components={{ code: MarkdownCode }}
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
                <div className="flex-1 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] opacity-50">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">上一篇</div>
                  <div className="text-sm text-[var(--text-secondary)]">已经是最早的一篇了</div>
                </div>
              )}

              {nextPost ? (
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
              ) : (
                <div className="flex-1 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] opacity-50 text-right">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">下一篇</div>
                  <div className="text-sm text-[var(--text-secondary)]">已经是最新的一篇了</div>
                </div>
              )}
            </div>
          </motion.article>

          {/* 桌面端悬浮目录：fixed 到视口右侧，不占文档流 */}
          <TocSidebar items={toc} />
        </div>

        {/* 评论区 - Giscus */}
        <GiscusComments slug={slug ?? ""} />

        {/* 阅读进度猫 */}
        <ReadingCat />
      </div>
    </div>
  );
};