/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 16:24:44
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, Sparkles, Plus, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { ToolCard } from "../components/Home/ToolCard";
import { ToolFilter } from "../components/Home/ToolFilter";
import { SearchBar } from "../components/Home/SearchBar";
import { SubmitToolModal } from "../components/Home/SubmitToolModal";
import { getAllTools, type ToolCategory } from "../data/tools";
import { Mug, Cat, Ghost, Planet } from "react-kawaii";

// 打字机效果 hook
const useTypewriter = (
  words: string[],
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseTime = 2000,
) => {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          setText(currentWord.substring(0, text.length + 1));
          if (text.length === currentWord.length) {
            setTimeout(() => setIsDeleting(true), pauseTime);
            return;
          }
        } else {
          setText(currentWord.substring(0, text.length - 1));
          if (text.length === 0) {
            setIsDeleting(false);
            setWordIndex((prev) => (prev + 1) % words.length);
          }
        }
      },
      isDeleting ? deletingSpeed : typingSpeed,
    );

    return () => clearTimeout(timeout);
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseTime]);

  return text;
};

export const Home = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 打字机效果
  const typewriterWords = ["你好呀 ✨", "欢迎来看我 ✨", "喜欢您来 ✨"];
  const typewriterText = useTypewriter(typewriterWords);

  // 刷新工具列表
  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // 获取所有工具
  const allTools = useMemo(() => getAllTools(), [refreshKey]);

  // 筛选工具
  const filteredTools = useMemo(() => {
    return allTools.filter((tool) => {
      // 分类筛选
      if (activeCategory !== "all" && tool.category !== activeCategory) {
        return false;
      }
      // 搜索筛选
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

  // 计算每个分类的工具数量
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
      if (tool.category in counts) {
        counts[tool.category]++;
      }
    });

    return counts;
  }, [allTools]);

  // 键盘快捷键：ESC 清除搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchQuery) {
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="container py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          {/* react-kawaii 可爱星球 */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-8 flex justify-center"
          >
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Planet mood="blissful" color="#a78bfa" size={120} />
            </motion.div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-6xl font-bold mb-6 gradient-text"
          >
            Hitari's Blog
          </motion.h1>

          {/* 打字机效果 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="h-10 mb-6"
          >
            <span className="text-2xl md:text-3xl text-[var(--text-primary)] font-medium">
              {typewriterText}
            </span>
            <span className="inline-block w-0.5 h-8 bg-[var(--accent)] ml-1 animate-pulse" />
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/blog"
              className="btn flex items-center space-x-2 px-8 py-3 text-lg shadow-lg shadow-blue-500/25"
            >
              <Sparkles className="w-5 h-5" />
              <span>浏览文章</span>
            </Link>
            <Link
              to="/ai"
              className="px-8 py-3 text-lg font-medium rounded-lg border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all duration-300 flex items-center space-x-2"
            >
              <Zap className="w-5 h-5" />
              <span>体验 AI</span>
            </Link>
          </motion.div>

          {/* 装饰性可爱角色云 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 flex justify-center gap-6 items-center"
          >
            {[
              { Component: Cat, color: "#FFB6C1" },
              { Component: Mug, color: "#87CEEB" },
              { Component: Ghost, color: "#DDA0DD" },
              { Component: Cat, color: "#FFA07A" },
              { Component: Ghost, color: "#98FB98" },
              { Component: Mug, color: "#FF69B4" },
            ].map(({ Component, color }, i) => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -12, 0],
                  rotate: [0, 8, -8, 0],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              >
                <Component size={70} mood="happy" color={color} />
              </motion.div>
            ))}
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          >
            <div className="card card-hover">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold mb-2">AI 技术</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                深入了解大语言模型、机器学习算法和最新AI技术趋势
              </p>
            </div>

            <div className="card card-hover">
              <div className="text-4xl mb-4">💡</div>
              <h3 className="text-lg font-semibold mb-2">实践案例</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                从实际项目出发，学习如何在真实场景中应用AI技术
              </p>
            </div>

            <div className="card card-hover">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold mb-2">前沿资讯</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                追踪行业动态，掌握最新的AI研究成果和应用突破
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* 工具箱区域 */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-20"
        >
          {/* 标题 */}
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 flex items-center justify-center gap-3">
              🛠️ 实用工具箱
            </h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
              收录各类实用工具和 AI 助手，涵盖开发、写作、设计、SEO 等多个领域，助力提升工作效率
            </p>
          </div>

          {/* 搜索框 */}
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索工具名称、描述或标签..."
          />

          {/* 分类筛选 */}
          <ToolFilter
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            toolCounts={toolCounts}
          />

          {/* 工具网格 */}
          {filteredTools.length > 0 ? (
            <motion.div
              key={`${activeCategory}-${searchQuery}-${refreshKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {filteredTools.map((tool, index) => (
                <motion.div
                  key={tool.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ToolCard tool={tool} searchQuery={searchQuery} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold mb-2">没有找到匹配的工具</h3>
              <p className="text-[var(--text-secondary)]">尝试更换关键词或切换分类</p>
            </motion.div>
          )}

          {/* 底部操作 */}
          <div className="mt-12 text-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl 
                         bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium
                         hover:opacity-90 transition-opacity shadow-lg shadow-blue-500/25"
            >
              <Plus className="w-5 h-5" />
              推荐工具
            </button>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              发现了好用的工具？分享给大家吧！
            </p>
          </div>
        </motion.div>
      </div>

      {/* 提交工具弹窗 */}
      <SubmitToolModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleRefresh}
      />
    </div>
  );
};
