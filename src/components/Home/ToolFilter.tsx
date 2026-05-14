/*
 * @Author: hidari
 * @Date: 2026-05-14 14:00:41
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 14:01:17
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
/**
 * 工具分类筛选组件
 */
import { motion } from "framer-motion";
import { CATEGORIES, type ToolCategory } from "../../data/tools";

interface ToolFilterProps {
  activeCategory: ToolCategory;
  onCategoryChange: (category: ToolCategory) => void;
  toolCounts: Record<ToolCategory, number>;
}

export const ToolFilter = ({ activeCategory, onCategoryChange, toolCounts }: ToolFilterProps) => {
  return (
    <div className="flex flex-wrap gap-2 mb-8">
      {CATEGORIES.map((category) => {
        const isActive = activeCategory === category.id;
        const count = toolCounts[category.id] || 0;

        return (
          <motion.button
            key={category.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onCategoryChange(category.id)}
            className={`
              relative px-4 py-2 rounded-lg font-medium text-sm
              transition-all duration-300 flex items-center gap-2
              ${
                isActive
                  ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/25"
                  : "bg-[var(--card-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            `}
          >
            <span>{category.icon}</span>
            <span>{category.name}</span>
            <span
              className={`
              px-1.5 py-0.5 rounded text-xs
              ${isActive ? "bg-white/20" : "bg-[var(--bg-secondary)]"}
            `}
            >
              {count}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
