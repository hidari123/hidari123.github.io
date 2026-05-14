/**
 * 工具卡片组件
 * 展示单个工具的信息
 */
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import type { Tool } from "../../data/tools";

interface ToolCardProps {
  tool: Tool;
  searchQuery?: string;
}

export const ToolCard = ({ tool, searchQuery = "" }: ToolCardProps) => {
  // 动态获取图标组件
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Bot: LucideIcons.Bot,
    Brain: LucideIcons.Brain,
    Image: LucideIcons.Image,
    Search: LucideIcons.Search,
    Cpu: LucideIcons.Cpu,
    Sparkles: LucideIcons.Sparkles,
    Code: LucideIcons.Code,
    Palette: LucideIcons.Palette,
    FileJson: LucideIcons.FileJson,
    Regex: LucideIcons.Regex,
    Wand2: LucideIcons.Wand2,
    FileDiff: LucideIcons.FileDiff,
    Lock: LucideIcons.Lock,
    Clock: LucideIcons.Clock,
    Key: LucideIcons.Key,
    FileText: LucideIcons.FileText,
    CheckCircle: LucideIcons.CheckCircle,
    Hash: LucideIcons.Hash,
    BookOpen: LucideIcons.BookOpen,
    PenTool: LucideIcons.PenTool,
    Figma: LucideIcons.Figma,
    ImagePlus: LucideIcons.ImagePlus,
    Layout: LucideIcons.Layout,
    TrendingUp: LucideIcons.TrendingUp,
    BarChart3: LucideIcons.BarChart3,
    Gauge: LucideIcons.Gauge,
    Smartphone: LucideIcons.Smartphone,
    Code2: LucideIcons.Code2,
    Grid: LucideIcons.Grid,
    ArrowRight: LucideIcons.ArrowRight,
  };

  const IconComponent = iconMap[tool.icon] || LucideIcons.Box;

  // 高亮搜索匹配文字
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-500/30 text-inherit rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  const handleClick = () => {
    window.open(tool.url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className="card card-hover cursor-pointer group relative overflow-hidden "
    >
      {/* 边框发光效果 - 使用 accent-glow */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-[0_0_20px_var(--accent-glow)]">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] p-px">
          <div className="w-full h-full rounded-lg bg-[var(--bg-card)]" />
        </div>
      </div>

      <div className="relative z-10 p-5">
        {/* 头部：图标 + AI 徽章 */}
        <div className="flex items-center justify-start mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 group-hover:from-blue-400/15 group-hover:to-purple-400/15 transition-all duration-300">
            <IconComponent className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform duration-300" />
          </div>

          {/* AI 徽章 */}
          {tool.isAI && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-500 border border-purple-500/30">
              <LucideIcons.Bot className="w-3 h-3" />
              AI
            </span>
          )}
        </div>

        {/* 名称 */}
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white group-hover:dark:text-blue-100 transition-colors duration-300">
          {highlightText(tool.name)}
        </h3>

        {/* 描述 */}
        <p className="text-sm text-gray-600 dark:text-gray-400 group-hover:dark:text-gray-100 mb-4 line-clamp-2 transition-colors duration-300">
          {highlightText(tool.description)}
        </p>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2">
          {tool.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-gray-200/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-blue-100/20 hover:text-blue-100 dark:hover:text-blue-400 transition-colors duration-200"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 底部链接指示 */}
        <div className="flex items-center justify-end mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            访问工具
            <LucideIcons.ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-x-1/2 -translate-y-1/2" />
    </motion.div>
  );
};
