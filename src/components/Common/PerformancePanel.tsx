/*
 * @Author: hidari
 * @Date: 2026-05-15 16:20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:31:15
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, X, RotateCcw, GripVertical } from "lucide-react";
import { usePerformance } from "@/hooks/usePerformance";
import { useAICallStats } from "@/hooks/useAICallStats";

// 性能指标项组件
interface MetricItemProps {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}

const MetricItem = memo<MetricItemProps>(({ icon, label, value, subValue, color = "#ff69b4" }) => (
  <div className="flex items-center justify-between py-2 border-b border-pink-200/30 last:border-b-0">
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <span className="text-xs text-pink-300/80 font-mono">{label}</span>
    </div>
    <div className="text-right">
      <span className="text-sm font-bold font-mono" style={{ color }}>
        {value}
      </span>
      {subValue && <span className="block text-[10px] text-pink-400/60 font-mono">{subValue}</span>}
    </div>
  </div>
));

MetricItem.displayName = "MetricItem";

// 拖拽小圆点组件
interface DraggableHandleProps {
  onClick: () => void;
  onDragEnd: (x: number, y: number) => void;
  initialX: number;
  initialY: number;
}

const DraggableHandle = memo<DraggableHandleProps>(({ onClick, onDragEnd, initialX, initialY }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  }>({
    startX: 0,
    startY: 0,
    startPosX: initialX,
    startPosY: initialY,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 如果点击的是展开按钮，不触发拖拽
      if ((e.target as HTMLElement).closest(".expand-button")) {
        return;
      }

      e.preventDefault();
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
      };
    },
    [position.x, position.y],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      const newX = Math.max(
        0,
        Math.min(window.innerWidth - 48, dragRef.current.startPosX + deltaX),
      );
      const newY = Math.max(
        0,
        Math.min(window.innerHeight - 48, dragRef.current.startPosY + deltaY),
      );

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd(position.x, position.y);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, position.x, position.y, onDragEnd]);

  return (
    <div
      className={`
          fixed z-[9999] cursor-grab select-none
          ${isDragging ? "cursor-grabbing" : ""}
        `}
      style={{
        right: position.x > 0 ? undefined : 20,
        bottom: 20,
        left: position.x > 0 ? position.x : undefined,
      }}
      onMouseDown={handleMouseDown}
    >
      <motion.button
        className="
            w-12 h-12 rounded-full
            bg-gradient-to-br from-pink-400 via-pink-500 to-rose-500
            shadow-[0_4px_20px_rgba(236,72,153,0.4)]
            flex items-center justify-center
            hover:shadow-[0_6px_25px_rgba(236,72,153,0.5)]
            active:scale-95
            transition-all duration-200
          "
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
      >
        <div className="expand-button">
          <Activity className="w-5 h-5 text-white" />
        </div>
      </motion.button>
    </div>
  );
});

DraggableHandle.displayName = "DraggableHandle";

// 主面板组件
interface PerformancePanelProps {
  updateInterval?: number;
}

export const PerformancePanel = memo<PerformancePanelProps>(({ updateInterval = 1000 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const { metrics, shouldShow, formatBytes, formatTime } = usePerformance(updateInterval);
  const { stats, resetStats } = useAICallStats();

  // 键盘快捷键：Ctrl+Shift+P 切换面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDragEnd = useCallback((x: number, y: number) => {
    setPosition({ x, y });
  }, []);

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // 如果不应该显示面板，则不渲染
  if (!shouldShow) {
    return null;
  }

  const panelPosition = {
    right: position.x > 0 ? undefined : 20,
    bottom: isOpen ? 100 : 20,
    left: position.x > 0 ? position.x : undefined,
  };

  return (
    <>
      {/* 可拖拽小圆点 */}
      <DraggableHandle
        onClick={togglePanel}
        onDragEnd={handleDragEnd}
        initialX={position.x}
        initialY={position.y}
      />

      {/* 展开面板 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 点击空白关闭的遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9997]"
              onClick={togglePanel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="fixed z-[9998]"
              style={panelPosition}
            >
              <div
                className="
                w-[280px] rounded-2xl overflow-hidden
                bg-gradient-to-br from-pink-50/95 via-rose-50/95 to-pink-100/95
                dark:from-pink-900/95 dark:via-rose-900/95 dark:to-pink-950/95
                backdrop-blur-xl
                shadow-[0_8px_32px_rgba(236,72,153,0.25)]
                border border-pink-300/50 dark:border-pink-700/50
              "
              >
                {/* 标题栏 */}
                <div
                  className="
                px-4 py-3 
                bg-gradient-to-r from-pink-400/90 to-rose-400/90
                dark:from-pink-600/90 dark:to-rose-600/90
                flex items-center justify-between
              "
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-white" />
                    <span className="text-sm font-bold text-white font-mono">性能监控</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={resetStats}
                      className="
                      p-1 rounded-md 
                      hover:bg-white/20 
                      active:scale-95
                      transition-all duration-150
                    "
                      title="重置统计"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-white/80 hover:text-white" />
                    </button>
                    <button
                      onClick={togglePanel}
                      className="
                      p-1 rounded-md 
                      hover:bg-white/20 
                      active:scale-95
                      transition-all duration-150
                    "
                      title="关闭"
                    >
                      <X className="w-3.5 h-3.5 text-white/80 hover:text-white" />
                    </button>
                  </div>
                </div>

                {/* 拖拽提示 */}
                <div className="px-4 py-1.5 bg-pink-100/50 dark:bg-pink-900/30 flex items-center gap-1.5">
                  <GripVertical className="w-3 h-3 text-pink-400" />
                  <span className="text-[10px] text-pink-400/70 font-mono">
                    拖拽顶部移动 · Ctrl+Shift+P 切换
                  </span>
                </div>

                {/* 指标列表 */}
                <div className="p-3 space-y-1">
                  <MetricItem
                    icon="⏱️"
                    label="页面加载时间"
                    value={formatTime(metrics.pageLoadTime)}
                    color="#ec4899"
                  />
                  <MetricItem
                    icon="💾"
                    label="内存使用"
                    value={formatBytes(metrics.memoryUsage)}
                    subValue={
                      metrics.memoryLimit > 0
                        ? `/ ${formatBytes(metrics.memoryLimit)}`
                        : "Chrome Only"
                    }
                    color="#f472b6"
                  />
                  <MetricItem
                    icon="🤖"
                    label="AI 调用次数"
                    value={stats.callCount.toString()}
                    subValue={`成功 ${stats.successCount} / 失败 ${stats.failureCount}`}
                    color="#fb7185"
                  />
                  <MetricItem
                    icon="⚡"
                    label="API 平均耗时"
                    value={formatTime(stats.averageDuration)}
                    color="#f43f5e"
                  />
                  <MetricItem
                    icon="🔄"
                    label="重绘次数"
                    value={metrics.repaintCount.toString()}
                    color="#e11d48"
                  />
                  <MetricItem
                    icon="🎯"
                    label="FPS"
                    value={metrics.fps.toString()}
                    subValue={metrics.fps >= 50 ? "流畅" : metrics.fps >= 30 ? "一般" : "卡顿"}
                    color={
                      metrics.fps >= 50 ? "#10b981" : metrics.fps >= 30 ? "#f59e0b" : "#ef4444"
                    }
                  />
                </div>

                {/* 底部装饰 */}
                <div className="h-1 bg-gradient-to-r from-pink-300 via-rose-300 to-pink-300" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

PerformancePanel.displayName = "PerformancePanel";

export default PerformancePanel;
