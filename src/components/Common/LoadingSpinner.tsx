/**
 * 可爱的跳动猫爪加载动画
 */
import { motion } from "framer-motion";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

const SCALE = { sm: 0.7, md: 1, lg: 1.3 } as const;

export const LoadingSpinner = ({ size = "md", text = "加载中..." }: LoadingSpinnerProps) => {
  const s = SCALE[size];
  const pawPositions = [
    { x: 0, y: 0, scale: 0.8 },
    { x: 20, y: -10, scale: 1 },
    { x: 0, y: -20, scale: 1.2 },
    { x: -20, y: -10, scale: 0.8 },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      {/* 猫爪印 */}
      <div className="relative w-20 h-20" style={{ transform: `scale(${s})` }}>
        {pawPositions.map((pos, index) => (
          <motion.div
            key={index}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
            }}
            animate={{
              y: [0, -8, 0],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: index * 0.1,
              ease: "easeInOut",
            }}
          >
            <span
              className="text-2xl block"
              style={{
                transform: `scale(${pos.scale})`,
              }}
            >
              🐾
            </span>
          </motion.div>
        ))}
      </div>
      <motion.p
        className="text-sm text-[var(--text-secondary)]"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {text}
      </motion.p>
    </div>
  );
};

/**
 * 骨架屏加载占位
 */
export const BlogCardSkeleton = () => {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start gap-4">
        {/* 头像占位 */}
        <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)]" />
        <div className="flex-1 space-y-3">
          {/* 标题占位 */}
          <div className="h-6 bg-[var(--bg-secondary)] rounded w-3/4" />
          {/* 描述占位 */}
          <div className="space-y-2">
            <div className="h-4 bg-[var(--bg-secondary)] rounded w-full" />
            <div className="h-4 bg-[var(--bg-secondary)] rounded w-2/3" />
          </div>
          {/* 标签占位 */}
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-[var(--bg-secondary)] rounded-full" />
            <div className="h-6 w-20 bg-[var(--bg-secondary)] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 工具卡片骨架屏
 */
export const ToolCardSkeleton = () => {
  return (
    <div className="card animate-pulse">
      <div className="space-y-4">
        {/* 图标和标题 */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[var(--bg-secondary)] rounded-xl" />
          <div className="h-5 bg-[var(--bg-secondary)] rounded w-24" />
        </div>
        {/* 描述 */}
        <div className="space-y-2">
          <div className="h-4 bg-[var(--bg-secondary)] rounded w-full" />
          <div className="h-4 bg-[var(--bg-secondary)] rounded w-3/4" />
        </div>
        {/* 标签 */}
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-[var(--bg-secondary)] rounded-full" />
          <div className="h-6 w-20 bg-[var(--bg-secondary)] rounded-full" />
        </div>
      </div>
    </div>
  );
};
