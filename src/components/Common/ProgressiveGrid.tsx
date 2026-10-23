/**
 * 渐进挂载网格
 *
 * 场景：工具箱有 38 张卡片，每张都带 framer-motion 的入场动画和
 * `transition: { delay: index * 0.05 }`——最后一张要等 1.9 秒才出现，
 * 而且首屏之外的全部一次性挂载，白白跑 38 份动画。
 *
 * 做法：只保证「视口内 + 一屏缓冲」的卡片是挂载的，滚动到附近时才挂载下一批。
 * 批次大小写死 12 而不是做成 prop：这个网格只有一处用得上，
 * 抽象出配置项反而增加维护成本。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

const BATCH = 12;
/** 多挂载一屏，滚动时不容易看到"空白 → 突然出现" */
const BUFFER_PX = 800;

interface ProgressiveGridProps {
  total: number;
  /** 变更时重置挂载计数（切分类、切搜索词会换掉整组卡片） */
  resetKey: string;
  renderItem: (index: number) => ReactNode;
  className?: string;
}

export const ProgressiveGrid = ({
  total,
  resetKey,
  renderItem,
  className,
}: ProgressiveGridProps) => {
  const [mounted, setMounted] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 列表换了（换分类 / 搜索），退回首批
  useEffect(() => {
    setMounted(BATCH);
  }, [resetKey]);

  useEffect(() => {
    if (mounted >= total) return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMounted((m) => Math.min(m + BATCH, total));
        }
      },
      { rootMargin: `${BUFFER_PX}px 0px` },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, total]);

  return (
    <>
      <div className={className}>
        {Array.from({ length: Math.min(mounted, total) }, (_, i) => renderItem(i))}
      </div>

      {/* 哨兵：留在最后一个挂载项之后，进入缓冲就挂下一批 */}
      {mounted < total && (
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      )}
    </>
  );
};