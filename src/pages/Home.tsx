/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 14:55:40
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { motion } from "framer-motion";
import { Bot, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export const Home = () => {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto"
        >
          {/* Hero Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-8"
          >
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full gradient-bg">
              <Bot className="w-12 h-12 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-6xl font-bold mb-6 gradient-text"
          >
            AI Blog
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl md:text-2xl text-[var(--text-secondary)] mb-8"
          >
            探索人工智能的无限可能，分享机器学习与深度学习的最新见解
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/blog" className="btn flex items-center space-x-2 px-8 py-3 text-lg">
              <Sparkles className="w-5 h-5" />
              <span>开始阅读</span>
            </Link>
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
      </div>
    </div>
  );
};
