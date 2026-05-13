/*
 * @Author: hidari
 * @Date: 2026-05-13 15:35
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:25:54
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Tag, Clock } from "lucide-react";
import { getAllPosts, type Post } from "@/services/blogService";
import { ImageOff } from "lucide-react";

// 默认封面图片
const DEFAULT_COVER = "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80";

// 骨架屏组件
const PostCardSkeleton = () => (
  <div className="bg-[var(--bg-card)] rounded-2xl overflow-hidden animate-pulse">
    <div className="h-52 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--border)]"></div>
    <div className="p-6">
      <div className="h-6 bg-[var(--bg-secondary)] rounded w-3/4 mb-3"></div>
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-1/2 mb-4"></div>
      <div className="space-y-2">
        <div className="h-3 bg-[var(--bg-secondary)] rounded"></div>
        <div className="h-3 bg-[var(--bg-secondary)] rounded w-5/6"></div>
      </div>
    </div>
  </div>
);

// 空状态组件
const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-center py-20"
  >
    <div className="text-6xl mb-4">📝</div>
    <h2 className="text-2xl font-semibold mb-4">暂无文章</h2>
    <p className="text-[var(--text-secondary)]">还没有发布任何文章，敬请期待...</p>
  </motion.div>
);

// 文章卡片组件
const PostCard = ({ post }: { post: Post }) => {
  const coverImage = post.cover || DEFAULT_COVER;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={`/blog/${post.slug}`}>
        <div className="group bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--accent)]/10">
          {/* 封面图 */}
          <div className="relative h-52 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-purple-500/20 group-hover:from-[var(--accent)]/30 group-hover:to-purple-500/30 transition-all duration-300"></div>
            <img
              src={coverImage}
              alt={post.title}
              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="hidden absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
              <ImageOff className="w-12 h-12 text-[var(--text-secondary)]" />
            </div>
            {/* 渐变遮罩 */}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent"></div>
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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  // 获取所有标签
  const allTags = Array.from(new Set(posts.flatMap((post) => post.tags))).sort();

  // 筛选和分页
  const filteredPosts = selectedTag
    ? posts.filter((post) => post.tags.includes(selectedTag))
    : posts;

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE,
  );

  // 处理标签点击
  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
    setCurrentPage(1);
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
                博客文章
              </span>
            </h1>
            <p className="text-[var(--text-secondary)] text-lg">分享技术见解，记录成长历程</p>
          </div>

          {/* 标签筛选 */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-12">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  selectedTag === null
                    ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                    selectedTag === tag
                      ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
                      : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* 文章列表 */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
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
                {selectedTag && `，其中标签 "${selectedTag}" 下有 ${filteredPosts.length} 篇`}
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};
