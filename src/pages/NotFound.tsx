/*
 * @Author: hidari
 * @Date: 2026-05-13 15:55
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 15:56:47
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft } from "lucide-react";

export const NotFound = () => {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="mb-8"
        >
          <div className="text-[12rem] font-bold gradient-text leading-none">404</div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-semibold mb-4"
        >
          页面未找到
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto"
        >
          抱歉，您访问的页面不存在。可能是链接错误或页面已被删除。
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link to="/" className="btn flex items-center gap-2 px-8 py-3">
            <Home className="w-5 h-5" />
            返回首页
          </Link>

          <button
            onClick={() => window.history.back()}
            className="px-8 py-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            返回上一页
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};
