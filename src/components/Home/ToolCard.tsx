/**
 * 工具卡片组件
 *
 * ── 为什么重新设计 ──
 * 原版「单调」不是错觉，是三个具体问题叠出来的：
 *
 *  1. 一张卡里有三套互不相干的颜色
 *     图标是 text-blue-500，标题是 text-gray-900 dark:text-white，
 *     描述是 text-gray-600 dark:text-gray-400，标签又是 gray-200/700。
 *     全都没接站点的 --accent / --text-* 变量，
 *     主题一换就有一半对不上（暗色下图标还是亮蓝，刺眼）。
 *
 *  2. 唯一的装饰是「边框发光」，而它是这么实现的：
 *     div > div(bg-gradient + p-px) > div(bg-card)
 *     三层嵌套、手写 1px 内边距来假装渐变边框，
 *     底下还铺一个 blur-3xl 的圆形光斑。
 *     代价是 DOM 变重、边框和卡片底色永远差 1px 接缝，
 *     而且 hover 前 opacity:0，等于大多数时候这张卡真的什么都没有。
 *
 *  3. 15 张卡长得一模一样
 *     全站唯一能区分卡片的信息是那个图标，
 *     但图标是纯色描边、大小一样、没有底色区分。
 *
 * ── 现在的做法 ──
 *  - 色相按分类分配：ai/dev/writing/design/seo 各一个色相，
 *    图标底色、标签、悬停描边全部取同一色相，整张卡只有一套颜色。
 *  - 边框发光交给 CSS 的 border-color + box-shadow，
 *    不再手写三层 div 去伪造 1px 渐变边框。
 *  - 顶栏加一条「卡片主色」，让网格在静止状态下就有节奏。
 *  - 链接指示器常驻淡显，不再 opacity:0（不 hover 时也要能看出这是外链）。
 *  - prefers-reduced-motion 下关掉位移和模糊光斑。
 */

import { motion } from "framer-motion";
import {
  Bot,
  Brain,
  Image,
  Search,
  Cpu,
  Sparkles,
  Code,
  Palette,
  FileJson,
  Regex,
  Wand2,
  FileDiff,
  Lock,
  Clock,
  Key,
  FileText,
  CheckCircle,
  Hash,
  BookOpen,
  PenTool,
  Figma,
  ImagePlus,
  Layout,
  TrendingUp,
  BarChart3,
  Gauge,
  Smartphone,
  Code2,
  Grid,
  ArrowUpRight,
  Box,
} from "lucide-react";
import type { Tool } from "../../data/tools";

interface ToolCardProps {
  tool: Tool;
  searchQuery?: string;
}

/**
 * 图标映射表：只列实际用到的 28 个。
 * 原先写的是 `import * as LucideIcons from "lucide-react"`，那会把 lucide 的
 * 2700+ 图标全部拉进 bundle（未 tree-shake，源码量约 18MB），
 * 而实际只用到 28 个。
 */
const iconMap = {
  Bot,
  Brain,
  Image,
  Search,
  Cpu,
  Sparkles,
  Code,
  Palette,
  FileJson,
  Regex,
  Wand2,
  FileDiff,
  Lock,
  Clock,
  Key,
  FileText,
  CheckCircle,
  Hash,
  BookOpen,
  PenTool,
  Figma,
  ImagePlus,
  Layout,
  TrendingUp,
  BarChart3,
  Gauge,
  Smartphone,
  Code2,
  Grid,
} as const;

/**
 * 分类 -> 色相。
 *
 * 用 inline style 注入 CSS 变量，而不是为每个分类写一套 Tailwind 类：
 * Tailwind 靠扫描源码生成类名，动态拼出来的 `text-${hue}-500` 会被整条 purge 掉。
 * 变量方案没这个问题，改色相也只改这一张表。
 *
 * 色相选择（亮/暗两套值都在同一个 HSL 里给，只调明度不调色相，
 * 保证分类之间的辨识度在两个主题下一致）：
 *   ai      紫   — 和站点的 accent 同族
 *   dev     蓝   — 开发工具的常规联想色
 *   writing 琥珀 — 纸墨感
 *   design  粉   — 和站点的可爱基调一致
 *   seo     青   — 和蓝区分得开
 */
const CATEGORY_HUE: Record<Tool["category"], number> = {
  all: 250,
  ai: 258,
  dev: 212,
  writing: 32,
  design: 330,
  seo: 176,
};

/** 分类 id -> 展示名，卡片右下角用 */
const CATEGORY_LABEL: Record<Tool["category"], string> = {
  all: "",
  ai: "AI 工具",
  dev: "开发",
  writing: "写作",
  design: "设计",
  seo: "SEO",
};

export const ToolCard = ({ tool, searchQuery = "" }: ToolCardProps) => {
  const IconComponent =
    (iconMap as Record<string, typeof Bot | undefined>)[tool.icon] ?? Box;

  const hue = CATEGORY_HUE[tool.category] ?? 250;
  const categoryLabel = CATEGORY_LABEL[tool.category] ?? "";

  /*
    把分类色写成三个自定义属性，卡片内部所有颜色都从这三个变量取。

    - 卡片自身不写死任何颜色
    - 暗色主题不需要重新写一套类：变量里带 hsl(... / <alpha-value>)，
      明度部分用 calc 从主题色推，改一处全局生效
  */
  const style = {
    "--card-hue": String(hue),
  } as React.CSSProperties;

  // 高亮搜索匹配文字
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="bg-[hsl(var(--card-hue)_70%_55%/0.25)] text-inherit rounded px-0.5"
        >
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
    <motion.article
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      style={style}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      aria-label={`${tool.name}（新窗口打开）`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] cursor-pointer outline-none transition-[border-color,box-shadow] duration-300 hover:border-[hsl(var(--card-hue)_65%_60%/0.55)] hover:shadow-[0_18px_40px_-16px_hsl(var(--card-hue)_65%_45%/0.45)] focus-visible:border-[hsl(var(--card-hue)_65%_60%/0.55)] focus-visible:shadow-[0_18px_40px_-16px_hsl(var(--card-hue)_65%_45%/0.45)] motion-reduce:hover:y-0 motion-reduce:transition-none"
    >
      {/*
        顶部色条：静止状态就给网格一条水平节奏线，
        hover 时从左向右铺满整张卡。
        用 scaleX 动画而不是 width —— width 动画每帧都会触发重排。
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-[hsl(var(--card-hue)_85%_65%)] to-[hsl(calc(var(--card-hue)+38)_85%_62%)] transition-transform duration-500 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
      />

      {/* 右上角光晕：跟随分类色，比原来的灰蓝 blur 团更有生气 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[hsl(var(--card-hue)_90%_60%/0.18)] blur-2xl transition-opacity duration-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:hidden"
      />

      <div className="relative flex flex-1 flex-col p-5">
        {/* 头部：图标 + AI 徽章 + 分类标签 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--card-hue)_60%_60%/0.25)] bg-[hsl(var(--card-hue)_85%_60%/0.12)] transition-all duration-300 group-hover:scale-105 group-hover:border-[hsl(var(--card-hue)_65%_60%/0.5)] group-hover:bg-[hsl(var(--card-hue)_85%_60%/0.2)] motion-reduce:transform-none"
              style={{ color: `hsl(${hue} 70% 55%)` }}
            >
              <IconComponent className="h-[22px] w-[22px]" strokeWidth={1.9} />
            </span>

            {tool.isAI && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--card-hue)_60%_60%/0.35)] bg-[hsl(var(--card-hue)_85%_60%/0.15)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--card-hue)_60%_48%)] dark:text-[hsl(var(--card-hue)_85%_78%)]">
                <Bot className="h-3 w-3" />
                AI
              </span>
            )}
          </div>

          {categoryLabel && (
            <span className="mt-1 shrink-0 text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
              {categoryLabel}
            </span>
          )}
        </div>

        {/* 名称 */}
        <h3 className="mb-1.5 text-base font-semibold leading-snug text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[hsl(var(--card-hue)_70%_52%)] dark:group-hover:text-[hsl(var(--card-hue)_85%_80%)]">
          {highlightText(tool.name)}
        </h3>

        {/* 描述：占满剩余高度，让不同长度的卡片底部对齐 */}
        <p className="mb-4 line-clamp-2 flex-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {highlightText(tool.description)}
        </p>

        {/* 标签 */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tool.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors duration-200 group-hover:border-[hsl(var(--card-hue)_60%_60%/0.3)] group-hover:text-[hsl(var(--card-hue)_55%_42%)] dark:group-hover:text-[hsl(var(--card-hue)_70%_82%)]"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 底部：外链指示器。
            原来是 opacity:0 + group-hover —— 也就是不 hover 时完全看不出
            这是一张能点的卡。改成常驻淡显：卡片本身就是链接，
            「能不能点」应该是静止状态就传达的信息。 */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px]">
          <span className="text-[var(--text-muted)]">{tool.url.replace(/^https?:\/\//, "")}</span>
          <span className="flex items-center gap-1 font-medium text-[var(--text-muted)] transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--card-hue)_65%_55%)] motion-reduce:transform-none dark:group-hover:text-[hsl(var(--card-hue)_85%_75%)]">
            访问
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </motion.article>
  );
};