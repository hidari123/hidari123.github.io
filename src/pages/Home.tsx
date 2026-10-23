/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, Plus, ArrowRight, FileText, Github, Wrench, SearchX, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { ToolCard } from "../components/Home/ToolCard";
import { ToolFilter } from "../components/Home/ToolFilter";
import { SearchBar } from "../components/Home/SearchBar";
import { SubmitToolModal } from "../components/Home/SubmitToolModal";
import { ProgressiveGrid } from "../components/Common/ProgressiveGrid";
import { getAllTools, type ToolCategory } from "../data/tools";
import { getPostIndex, type PostIndex } from "../services/blogService";
import { PROFILE } from "../config/profile";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { Planet } from "react-kawaii";

/**
 * 打字机效果
 *
 * 注意：原来这个实现把 text 放在 useState 里、每次改一个字符就 setState，
 * 加上 `return` 分支里的嵌套 setTimeout，会有连续两次渲染。
 * 现在只存 wordIndex / isDeleting，显示文本用 useMemo 算，
 * 输入输出分离，也更符合 hooks 语义。
 */
const useTypewriter = (
  words: string[],
  typingSpeed = 90,
  deletingSpeed = 45,
  pauseTime = 1800,
) => {
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [length, setLength] = useState(0);

  const word = words[wordIndex % words.length] ?? "";

  useEffect(() => {
    // 完整打出来 → 停顿 → 开始删
    if (!isDeleting && length === word.length) {
      const t = setTimeout(() => setIsDeleting(true), pauseTime);
      return () => clearTimeout(t);
    }

    // 删空 → 换下一个词
    if (isDeleting && length === 0) {
      setIsDeleting(false);
      setWordIndex((i) => (i + 1) % words.length);
      return;
    }

    const t = setTimeout(
      () => setLength((n) => n + (isDeleting ? -1 : 1)),
      isDeleting ? deletingSpeed : typingSpeed,
    );
    return () => clearTimeout(t);
  }, [length, isDeleting, word, words.length, typingSpeed, deletingSpeed, pauseTime]);

  return useMemo(() => word.slice(0, length), [word, length]);
};

export const Home = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [featured, setFeatured] = useState<PostIndex[]>([]);

  const reducedMotion = usePrefersReducedMotion();
  const typewriterText = useTypewriter(
    ["你好呀", "欢迎来到我的小花园"],
    90,
    45,
    1800,
  );

  const handleRefresh = useCallback(() => setRefreshKey((p) => p + 1), []);

  // 精选文章：优先取配置里指定的，没配就取最新 3 篇
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const index = await getPostIndex();
      if (cancelled) return;

      const byDate = [...index].sort((a, b) => b.date.localeCompare(a.date));

      if (PROFILE.featuredSlugs.length === 0) {
        setFeatured(byDate.slice(0, 3));
        return;
      }

      const picked = PROFILE.featuredSlugs.map(
        (slug) => index.find((p) => p.slug === slug) ?? null,
      ).filter((p): p is PostIndex => p !== null);

      // 配置里的 slug 如果过期了会被过滤掉，用最新文章补齐
      const missing = PROFILE.featuredSlugs.length - picked.length;
      setFeatured(missing > 0 ? [...picked, ...byDate.filter((p) => !picked.includes(p))].slice(0, PROFILE.featuredSlugs.length) : picked);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const allTools = useMemo(() => getAllTools(), [refreshKey]);

  const filteredTools = useMemo(() => {
    return allTools.filter((tool) => {
      if (activeCategory !== "all" && tool.category !== activeCategory) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query) ||
          tool.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [allTools, activeCategory, searchQuery]);

  const toolCounts = useMemo(() => {
    const counts: Record<ToolCategory, number> = {
      all: allTools.length,
      ai: 0,
      dev: 0,
      writing: 0,
      design: 0,
      seo: 0,
    };
    allTools.forEach((tool) => {
      if (tool.category in counts) counts[tool.category]++;
    });
    return counts;
  }, [allTools]);

  // ESC 清除搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchQuery) setSearchQuery("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  // 入场动画的过渡参数：开了「减少动态效果」就直出，不做位移和延迟
  const enter = (delay = 0) =>
    reducedMotion
      ? { initial: false as const, animate: {} }
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5 },
        };

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="container py-12">
        {/* ---------- Hero ---------- */}
        <motion.section {...enter()} className="text-center max-w-3xl mx-auto mb-16">
          {!reducedMotion && (
            <div className="mb-8 flex justify-center">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                <motion.div
                  animate={{ y: [0, -15, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Planet mood="blissful" color="#a78bfa" size={110} />
                </motion.div>
              </motion.div>
            </div>
          )}

          <h1 className="text-4xl md:text-5xl font-bold mb-5 gradient-text">{PROFILE.headline}</h1>

          <div className="h-9 mb-5 flex items-center justify-center">
            <span className="text-lg md:text-xl text-[var(--text-primary)] font-medium text-center">
              {typewriterText}
            </span>
            <span
              className="inline-block w-0.5 h-6 bg-[var(--accent)] ml-1 animate-pulse motion-safe:animate-caret-wiggle"
              aria-hidden="true"
            />
          </div>

          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto mb-8 leading-relaxed">
            {PROFILE.subheadline}
          </p>

          {/* 两个 CTA 统一规格：
              之前只有「看文章」带图标，GitHub 那个是纯文字，
              看上去一个满一个空、重心也对不齐。
              现在两个都是 20px 图标 + 同样 padding + 同样圆角/字重。 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/blog"
              className="btn flex items-center justify-center gap-2 h-12 px-7 text-base shadow-lg shadow-blue-500/25"
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>看文章</span>
            </Link>
            <a
              href={PROFILE.links[0]?.href ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center gap-2 h-12 px-7 text-base font-medium rounded-lg border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all duration-300"
            >
              <Github className="w-5 h-5 shrink-0" />
              <span>GitHub</span>
            </a>
          </div>

          {/* 技能标签：比三张泛泛的 feature 卡更实在 */}
          <div className="mt-12 space-y-4 text-left max-w-2xl mx-auto">
            {PROFILE.skills.map((group) => (
              <div key={group.label} className="flex flex-wrap items-baseline gap-3">
                <span className="text-sm text-[var(--text-secondary)] w-24 shrink-0">
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 text-xs rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ---------- 精选文章 ---------- */}
        {featured.length > 0 && (
          <motion.section {...enter(0.1)} className="mb-24">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[var(--accent)]" />
                  精选文章
                </h2>
                <p className="text-[var(--text-secondary)] text-sm">
                  从工程实践里沉淀下来的思考
                </p>
              </div>
              <Link
                to="/blog"
                className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1 shrink-0"
              >
                全部 {featured.length > 0 ? "" : ""}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {featured.map((post, i) => (
                <motion.div
                  key={post.slug}
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reducedMotion ? 0 : i * 0.08, duration: 0.4 }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="card card-hover h-full flex flex-col p-5 group"
                  >
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-3">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      <time>{post.date}</time>
                    </div>
                    <h3 className="font-semibold mb-2 leading-snug group-hover:text-[var(--accent)] transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-3 flex-1 mb-4">
                      {post.description}
                    </p>
                    {post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-[var(--border)]/60">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ---------- 工具箱 ---------- */}
        <motion.section {...enter(0.15)}>
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2.5">
            <Wrench className="w-7 h-7 text-[var(--accent)]" />
            <span>工具箱</span>
          </h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-sm">
              我自己在用的工具，顺手分享。觉得有用就推荐给我
            </p>
          </div>

          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索工具名称、描述或标签..."
          />

          <ToolFilter
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            toolCounts={toolCounts}
          />

          {filteredTools.length > 0 ? (
            <ProgressiveGrid
              total={filteredTools.length}
              resetKey={`${activeCategory}-${searchQuery}-${refreshKey}`}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              renderItem={(index) => (
                <motion.div
                  key={filteredTools[index].id}
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reducedMotion ? 0 : Math.min(index, 11) * 0.04,
                  }}
                >
                  <ToolCard tool={filteredTools[index]} searchQuery={searchQuery} />
                </motion.div>
              )}
            />
          ) : (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="text-6xl mb-4 flex justify-center">
            <SearchX className="w-14 h-14 text-[var(--text-muted)] opacity-50" />
          </div>
              <h3 className="text-xl font-semibold mb-2">没有找到匹配的工具</h3>
              <p className="text-[var(--text-secondary)]">尝试更换关键词或切换分类</p>
            </motion.div>
          )}

          <div className="mt-12 text-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-blue-500/25"
            >
              <Plus className="w-5 h-5" />
              推荐工具
            </button>
          </div>
        </motion.section>
      </div>

      <SubmitToolModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleRefresh}
      />
    </div>
  );
};