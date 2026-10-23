/*
 * @Author: hidari
 * @Date: 2026-05-13 15:35
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:00:41
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "lucide-react";
import { getAllPosts, type Post } from "@/services/blogService";
import { PostCover } from "@/components/Blog/PostCover";
import { TagFilter } from "@/components/Blog/TagFilter";
import { CATEGORY_TAGS, type CategoryTag } from "@/data/tags";
import { useSeo } from "@/hooks/useSeo";
import {
  SkeletonPostCard as SkeletonCard,
  SkeletonStatus,
} from "@/components/Common/Skeleton";
import { Ghost } from "react-kawaii";

/*
 * 骨架屏
 *
 * 原来用的是 animate-pulse（整块一起明暗暗），两个问题：
 *  - 卡片之间的动画不同步，一排六张卡闪烁参差，像坏掉了
 *  - reduced-motion 下 pulse 会被压成 0.01ms，变成一块死灰，看不出在加载
 *
 * 改成全局统一的 shimmer 扫描，并和 Skeleton.tsx 里的骨架对齐真实卡片布局
 * （封面高从 h-52 改成 h-40，和 PostCard 里的封面比例一致，
 * 否则内容加载完的瞬间卡片会跳一下）。
 */
const PostCardSkeleton = () => <SkeletonCard />;

// 空状态组件 - 使用 react-kawaii Ghost
const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-center py-20"
  >
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className="mb-6"
    >
      <Ghost mood="sad" size={120} color="#a78bfa" />
    </motion.div>
    <h2 className="text-2xl font-semibold mb-4">这里空空如也</h2>
    <p className="text-[var(--text-secondary)]">还没有发布任何文章，敬请期待...</p>
  </motion.div>
);

// 文章卡片组件
const PostCard = ({ post }: { post: Post }) => {
  // frontmatter 里指定了 cover 就用作者给的图，否则用代码生成的封面
  const hasCustomCover = Boolean(post.cover);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={`/blog/${post.slug}`}>
        <div className="group bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--accent)]/10">
          {/* 封面 */}
          <div className="relative h-52 overflow-hidden">
            {hasCustomCover ? (
              <img
                src={post.cover}
                alt={post.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  // 图挂了也不能留空洞：退回到生成封面
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <div className={hasCustomCover ? "hidden" : "h-full"}>
              <PostCover
                slug={post.slug}
                title={post.title}
                category={post.tags[0]}
                variant="art"
                className="w-full h-full transform group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>

          {/* 内容 */}
          <div className="p-6">
            {/* 标签 */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 标题 */}
            <h3 className="text-lg font-bold mb-2 line-clamp-2 group-hover:text-[var(--accent)] transition-colors duration-300">
              {post.title}
            </h3>

            {/* 日期 */}
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-3">
              <Calendar className="w-4 h-4" />
              <span>{post.date}</span>
            </div>

            {/* 描述 */}
            <p className="text-[var(--text-secondary)] text-sm line-clamp-2">
              {post.description || post.excerpt}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

const POSTS_PER_PAGE = 6;

export const BlogList = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  // 文章页的标签会链到 /blog?tag=xxx，不接住的话点标签等于白点。
  // tag 可能是主分类也可能是技术标签：分类归分类，技术标签归技术标签。
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParam = searchParams.get("tag");

  useEffect(() => {
    if (!tagParam) return;
    if (CATEGORY_TAGS.includes(tagParam as CategoryTag)) {
      setSelectedCategory(tagParam);
      setSelectedTech([]);
    } else {
      setSelectedCategory(null);
      setSelectedTech([tagParam]);
    }
    setCurrentPage(1);
  }, [tagParam]);

  useSeo({
    title: "博客",
    description: `${"技术文章"}：涵盖 React、TypeScript、LLM、Agent 架构与前端工程实践。`,
    path: "/blog",
  });

  // 加载文章
  useEffect(() => {
    const loadPosts = async () => {
      try {
        const allPosts = await getAllPosts();
        setPosts(allPosts);
      } catch (error) {
        console.error("加载文章失败:", error);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);

  // 筛选：主分类是单选（横向导航），技术标签是多选（AND：必须命中全部选中项）。
  // 用 AND 而不是 OR，是因为选 React + 性能优化的人想要的是交集；
  // OR 会把两倍的文章全塞进来，等于没筛。
  // 分页跟着筛选条件走：改条件就回到第一页，否则可能停在空白页上。
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (selectedCategory && !post.tags.includes(selectedCategory)) {
        return false;
      }
      return selectedTech.every((tag) => post.tags.includes(tag));
    });
  }, [posts, selectedCategory, selectedTech]);

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE,
  );

  const handleCategoryChange = (category: string | null) => {
    setSelectedCategory(category);
    setCurrentPage(1);
    // 同步 URL：筛选状态可以直接分享 / 刷新不丢。
    // 技术标签也要保留，否则换一个分类会把已选的技术标签从地址栏里抹掉。
    const next = new URLSearchParams(searchParams);
    if (category) next.set("tag", category);
    else next.delete("tag");
    setSearchParams(next, { replace: true });
  };

  const handleTechChange = (tags: string[]) => {
    setSelectedTech(tags);
    setCurrentPage(1);
    const next = new URLSearchParams(searchParams);
    // URL 里只保留一个 tag；选了多个技术标签时以第一个为准
    if (tags.length > 0) next.set("tag", tags[0]);
    else next.delete("tag");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* 标题 */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-[var(--accent)] via-purple-500 to-pink-500 bg-clip-text text-transparent">
                碎碎念
              </span>
            </h1>
            <p className="text-[var(--text-secondary)] text-lg flex items-center justify-center gap-1.5">技术甜度：<span className="text-amber-400 tracking-wider" aria-hidden>★★★★★</span></p>
          </div>

          {/* 标签筛选：主分类 tab + 技术标签多选 */}
          {!loading && (
            <TagFilter
              posts={posts}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
              selectedTech={selectedTech}
              onTechChange={handleTechChange}
            />
          )}

          {/* 文章列表 */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton-shimmer">
                  <PostCardSkeleton />
                </div>
              ))}
              <SkeletonStatus text="正在加载文章列表" />
            </div>
          ) : paginatedPosts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {paginatedPosts.map((post) => (
                    <PostCard key={post.slug} post={post} />
                  ))}
                </AnimatePresence>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-12">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    上一页
                  </button>

                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-10 h-10 rounded-lg transition-colors ${
                          currentPage === i + 1
                            ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
                            : "bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    下一页
                  </button>
                </div>
              )}

              {/* 文章统计 */}
              <p className="text-center text-sm text-[var(--text-secondary)] mt-8">
                共 {filteredPosts.length} 篇文章
                {filteredPosts.length !== posts.length && `（全部 ${posts.length} 篇）`}
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};
