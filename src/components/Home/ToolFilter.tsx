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
import {
  LayoutGrid,
  Bot,
  Wrench,
  PenLine,
  Palette,
  Search,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES, type ToolCategory } from "../../data/tools";

/**
 * 分类名 → 图标组件。
 *
 * 显式列举而不是 import * as Icons 再按名字取：后者会把整个 lucide
 * （上千个图标）打进产物，实测主 chunk 涨了好几 KB，而这里只需要 6 个。
 * 未命中的名字返回 null 而不是报错——宁可少一个图标，不要整页崩。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Bot,
  Wrench,
  PenLine,
  Palette,
  Search,
};

const resolveIcon = (name: string): LucideIcon | null => ICON_MAP[name] ?? null;

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
            {/*
              图标和文字用同样的高度对齐。原来直接渲染 emoji 字面，
              它的高度取决于系统 emoji 字体，和旁边文字不在一条基线上，
              整个 tab 看起来是歪的。
            */}
            {(() => {
              const Icon = resolveIcon(category.icon);
              return Icon ? (
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
              ) : null;
            })()}
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
