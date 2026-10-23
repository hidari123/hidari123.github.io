/**
 * 骨架屏
 *
 * 参照 antd Skeleton 的做法。antd 的核心不是「灰色方块」，而是三条规则：
 *
 * 1. 形状必须和真实内容同构
 *    卡片骨架就是一张卡片（封面 + 标签 + 标题 + 摘要 + meta），
 *    文章骨架就是标题 + 段落。加载 100ms 和加载 3s 给人���感知完全一样，
 *    而后者会让人以为页面坏了。
 *
 * 2. 高光从左上扫到右下，用 background-position 移动，
 *    不是 opacity 呼吸。前者像「内容正在被读取」，
 *    后者像「有个灯在闪」。
 *
 * 3. 视觉上不出现任何文案。
 *    骨架屏不需要告诉用户「正在加载」—— 扫过的灰条本身就是信息。
 *    只在 sr-only 里给读屏器留一个 role="status"。
 *
 * 主题：全部走 CSS 变量，深色自动跟随，不写两套。
 */

import type { CSSProperties, ReactNode } from "react";

/**
 * 单个占位块。
 *
 * 用 `skeleton-block` 而不是自己写渐变，是因为高光层要盖满元素
 * 且不撑大布局（absolute），细节都收在这一个类里。
 */
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
    className={`skeleton-block ${rounded} ${className}`}
    style={style}
    aria-hidden="true"
  />
);

/**
 * 多行文本骨架。
 *
 * width 传百分比模拟真实段落的行长参差——全是 100% 的灰条看起来像加载失败，
 * 不像内容。最后一行明显短一点，这是「这是一段话」最强的视觉信号。
 */
export const SkeletonText = ({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) => {
  // 模拟真实段落：中间几行接近满，最后一行明显短
  const widths = ["96%", "92%", "98%", "89%", "94%", "64%"];

  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
};

/** 博客卡片骨架：和 BlogCard 的实际布局逐项对齐 */
export const SkeletonPostCard = () => (
  <div
    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
    aria-hidden="true"
  >
    <Skeleton className="h-44 w-full" rounded="rounded-none" />
    <div className="p-5 space-y-3.5">
      {/* 标签行 */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14" rounded="rounded-full" />
        <Skeleton className="h-5 w-16" rounded="rounded-full" />
      </div>
      {/* 标题两行 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[62%]" />
      </div>
      {/* 摘要三行 */}
      <SkeletonText lines={3} />
      {/* meta 行 */}
      <div className="flex items-center gap-4 pt-1.5 border-t border-[var(--border)]/60 mt-1">
        <Skeleton className="h-3 w-20" rounded="rounded-full" />
        <Skeleton className="h-3 w-14" rounded="rounded-full" />
        <Skeleton className="h-3 w-16" rounded="rounded-full" />
      </div>
    </div>
  </div>
);

/**
 * 工具卡片骨架（首页那批）。
 *
 * 和 PostCard 结构不同：方形图标 + 两行文字，没有封面。
 */
export const SkeletonToolCard = () => (
  <div
    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
    aria-hidden="true"
  >
    <div className="flex items-start gap-3.5">
      <Skeleton className="h-10 w-10 shrink-0" rounded="rounded-xl" />
      <div className="flex-1 space-y-2.5 pt-1">
        <Skeleton className="h-3.5 w-[55%]" />
        <Skeleton className="h-3 w-[88%]" />
      </div>
    </div>
    <div className="mt-4 flex items-center gap-2">
      <Skeleton className="h-5 w-16" rounded="rounded-full" />
      <Skeleton className="h-5 w-12" rounded="rounded-full" />
    </div>
  </div>
);

/** 文章详情骨架：和 BlogPost 的真实结构对齐（头图 + 标题 + 段落分块） */
export const SkeletonArticle = () => (
  <div className="max-w-3xl mx-auto px-4 py-10 space-y-7" aria-hidden="true">
    {/* 封面 */}
    <Skeleton className="w-full aspect-[21/9]" rounded="rounded-2xl" />

    {/* 标题 + 元信息 */}
    <div className="space-y-4">
      <Skeleton className="h-9 w-full" rounded="rounded-lg" />
      <Skeleton className="h-9 w-3/5" rounded="rounded-lg" />

      <div className="flex items-center gap-4 py-1">
        <Skeleton className="h-9 w-9" rounded="rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>

    {/* 正文：段落 + 代码块交替，模拟真实文章节奏 */}
    <div className="space-y-6 pt-2">
      <SkeletonText lines={5} />

      <Skeleton className="h-40 w-full" rounded="rounded-xl" />

      <SkeletonText lines={4} />

      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" rounded="rounded-full" />
        <Skeleton className="h-5 w-20" rounded="rounded-full" />
      </div>

      <SkeletonText lines={6} />
    </div>
  </div>
);

/** AI 页面骨架：左右交替的消息气泡 */
export const SkeletonChat = ({ messages = 4 }: { messages?: number }) => (
  <div className="space-y-6 p-6" aria-hidden="true">
    {Array.from({ length: messages }).map((_, i) => (
      <div
        key={i}
        className={`flex gap-3 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}
      >
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
 * 通用容器。
 *
 * 只负责把多个骨架包成一个整体，方便外层控制间距；
 * 高光动画挂在每个 .skeleton-block 自己身上，各块相位一致，
 * 不会出现参差的闪烁。
 */
export const SkeletonGroup = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => <div className={className}>{children}</div>;

/**
 * 读屏器专用：视觉上不渲染任何东西。
 *
 * 之前 BlogPost 里有一句可见的「页面加载中」，骨架屏出现时它就多余了
 * —— 用户看到的是扫光的灰条，再配一个「加载中」文字反而像报错。
 * 现在只留 role="status" 给屏幕阅读器播报。
 */
export const SkeletonStatus = ({ text = "正在加载" }: { text?: string }) => (
  <span className="sr-only" role="status" aria-live="polite">
    {text}
  </span>
);