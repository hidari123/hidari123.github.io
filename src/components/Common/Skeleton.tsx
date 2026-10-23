/**
 * 骨架屏
 *
 * 「动态」在这里指的不是循环动画，而是**形状和真实布局一致**：
 * 列表页出卡片骨架，详情页出标题+正文骨架，AI 页出消息流。
 * 统一用一个转圈加载器的问题是：加载 100ms 和加载 3s 给人的感知完全一样，
 * 而后者会让人以为页面坏了。
 *
 * 两个实现选择：
 *
 * 1. 用固定的 shimmer 而不是 stagger 逐个点亮。stagger 好看，但要求每张卡片
 *    延后自己的动画时间，虚拟滚动一滚动就乱。整体 shimmer 更稳。
 * 2. 骨架用 CSS 变量取色，深色模式自动跟随，不写两套。
 */

import type { CSSProperties, ReactNode } from "react";

/** 单个占位块。variant 决定尺寸和形状 */
export const Skeleton = ({
  className = "",
  rounded = "rounded-md",
  style,
}: {
  className?: string;
  rounded?: string;
  style?: CSSProperties;
}) => (
  <div
    className={`relative overflow-hidden ${rounded} ${className}`}
    style={style}
    aria-hidden="true"
  />
);

/**
 * 带 shimmer 效果的一行文本。
 *
 * width 传百分比模拟真实的文字参差——全是 100% 的灰条看起来像加载失败，
 * 不像内容。
 */
export const SkeletonText = ({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) => {
  // 模拟真实段落的行长分布：中间几行满，最后一行短
  const widths = ["92%", "98%", "85%", "96%", "70%"];

  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
};

/** 博客卡片骨架：和 BlogCard 的实际布局对齐 */
export const SkeletonPostCard = () => (
  <div
    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
    aria-hidden="true"
  >
    <Skeleton className="h-40 w-full" rounded="rounded-none" />
    <div className="p-5 space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14" rounded="rounded-full" />
        <Skeleton className="h-5 w-16" rounded="rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <SkeletonText lines={3} />
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  </div>
);

/** 文章详情骨架：标题 + 元信息 + 正文 */
export const SkeletonArticle = () => (
  <div className="max-w-3xl mx-auto px-4 py-10 space-y-6" aria-hidden="true">
    <Skeleton className="h-4 w-28" rounded="rounded-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-2/3" />

    <div className="flex items-center gap-4 py-2">
      <Skeleton className="h-9 w-9" rounded="rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>

    <Skeleton className="h-64 w-full" rounded="rounded-2xl" />

    <SkeletonText lines={6} className="pt-2" />
    <Skeleton className="h-8 w-full" />
    <SkeletonText lines={5} />
  </div>
);

/** AI 页面骨架：侧栏 + 消息流 */
export const SkeletonChat = ({ messages = 4 }: { messages?: number }) => (
  <div className="space-y-6 p-6" aria-hidden="true">
    {Array.from({ length: messages }).map((_, i) => (
      <div key={i} className={`flex gap-3 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
        <Skeleton className="h-8 w-8 shrink-0" rounded="rounded-full" />
        <div className="space-y-2 max-w-[70%]">
          <Skeleton className="h-4 w-full" rounded="rounded-2xl" />
          <Skeleton className="h-4 w-4/5" rounded="rounded-2xl" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * 通用容器：负责整体居中和 shimmer。
 *
 * 所有骨架都塞在这层里，保证 shimmer 的时序一致——
 * 多个独立容器各自跑动画会看到参差的闪烁。
 */
export const SkeletonBlock = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={`skeleton-shimmer ${className}`}>{children}</div>
);

/** 对加载状态的无障碍说明，屏幕阅读器能读到 */
export const SkeletonStatus = ({ text = "加载中" }: { text?: string }) => (
  <span className="sr-only" role="status" aria-live="polite">
    {text}
  </span>
);