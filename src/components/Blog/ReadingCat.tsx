/*
 * @Author: hidari
 * @Date: 2026-05-15 15:50:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:00:26
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** 根据阅读进度获取表情 */
const getCatMood = (progress: number): { emoji: string; message: string } => {
  if (progress === 0) {
    return { emoji: "😪", message: "准备开始阅读啦~" };
  } else if (progress <= 30) {
    return { emoji: "😺", message: "好奇地探索中..." };
  } else if (progress <= 70) {
    return { emoji: "😸", message: "越读越兴奋呢！" };
  } else if (progress < 100) {
    return { emoji: "😿", message: "快看完了，再坚持一下~" };
  } else {
    return { emoji: "🎉", message: "太棒了！全部读完啦！" };
  }
};

/** 鼓励话语 */
const encouragements = [
  "加油！你做得很好！",
  "继续努力，马上就到啦！",
  "阅读让你更强大！",
  "知识的海洋在等你~",
  "读完了给自己一个大大的赞！",
];

export const ReadingCat = () => {
  const [progress, setProgress] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasShownConfetti, setHasShownConfetti] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  // 计算滚动进度
  const calculateProgress = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 0;
    return Math.min(100, Math.round((scrollTop / docHeight) * 100));
  }, []);

  // 滚动事件处理（带防抖）
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const newProgress = calculateProgress();
          setProgress(newProgress);

          // 100% 时显示烟花
          if (newProgress === 100 && !hasShownConfetti) {
            setShowConfetti(true);
            setHasShownConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // 初始化进度
    setProgress(calculateProgress());

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [calculateProgress, hasShownConfetti]);

  // 点击空白处关闭对话框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTooltip]);

  const mood = getCatMood(progress);
  const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];

  // 拖拽结束时的处理
  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number } }) => {
    // 如果拖拽到左边（超过屏幕一半），收起猫猫
    const screenWidth = window.innerWidth;
    const currentX = info.offset.x;

    if (currentX < -screenWidth / 3) {
      setIsCollapsed(true);
      setShowTooltip(false);
    }
  };

  // 展开猫猫
  const expandCat = () => {
    setIsCollapsed(false);
  };

  return (
    <>
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          33% { transform: translateY(-10px) rotate(5deg); }
          66% { transform: translateY(-5px) rotate(-5deg); }
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(-100%) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        .cat-wiggle:hover {
          animation: wiggle 0.3s ease-in-out infinite;
        }

        .cat-bounce {
          animation: bounce 2s ease-in-out infinite;
        }

        .cat-complete {
          animation: float 1.5s ease-in-out infinite;
        }

        .confetti-piece {
          animation: confetti-fall 3s ease-out forwards;
        }
      `}</style>

      {/* 烟花效果 */}
      <AnimatePresence>
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-[9998] overflow-hidden">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="confetti-piece absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              >
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: ["#f472b6", "#fbbf24", "#a78bfa", "#34d399", "#f87171"][
                      Math.floor(Math.random() * 5)
                    ],
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* 收起状态时的展开按钮 */}
      <AnimatePresence>
        {isCollapsed && (
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            onClick={expandCat}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="fixed left-0 bottom-24 z-[9999] w-12 h-12 rounded-r-full bg-gradient-to-r from-pink-200 to-rose-200 dark:from-pink-800/50 dark:to-rose-800/50 shadow-lg shadow-pink-500/20 flex items-center justify-center text-2xl"
            style={{ clipPath: "inset(0 50% 0 0)" }}
          >
            😺
          </motion.button>
        )}
      </AnimatePresence>

      {/* 小猫组件 */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            ref={catRef}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            drag="x"
            dragElastic={0.1}
            dragConstraints={{ left: -window.innerWidth, right: 0, top: 0, bottom: 0 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-24 left-6 z-[9999]"
          >
            {/* 进度气泡 */}
            <AnimatePresence>
              {showTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-full left-0 mb-3 px-3 py-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-xl shadow-xl border border-pink-100 dark:border-pink-900/30 min-w-[160px] text-center"
                >
                  <div className="text-xl mb-0.5">{mood.emoji}</div>
                  <div className="text-base font-bold text-pink-500 mb-0.5">{progress}%</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {progress === 100 ? mood.message : randomEncouragement}
                  </div>
                  {/* 进度条 */}
                  <div className="mt-1.5 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-pink-400 to-rose-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  {/* 小三角 */}
                  <div className="absolute bottom-0 left-5 transform translate-y-1/2 rotate-45 w-2 h-2 bg-white/95 dark:bg-gray-800/95 border-r border-b border-pink-100 dark:border-pink-900/30" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 小猫按钮 */}
            <motion.button
              onClick={() => setShowTooltip(!showTooltip)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`
                relative w-14 h-14 rounded-full
                bg-gradient-to-br from-pink-100 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30
                shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40
                flex items-center justify-center text-3xl
                transition-shadow duration-300
                cat-wiggle
                cursor-grab active:cursor-grabbing
                ${progress === 100 ? "cat-complete" : ""}
              `}
            >
              {/* 背景光晕 */}
              <div
                className="absolute inset-0 rounded-full opacity-50"
                style={{
                  background: `radial-gradient(circle, rgba(244, 114, 182, ${0.2 + progress / 500}) 0%, transparent 70%)`,
                }}
              />

              {/* 进度环 */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                <circle
                  cx="28"
                  cy="28"
                  r="26"
                  fill="none"
                  stroke="rgba(244, 114, 182, 0.2)"
                  strokeWidth="3"
                />
                <motion.circle
                  cx="28"
                  cy="28"
                  r="26"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(progress / 100) * 163.36} 163.36`}
                  initial={{ strokeDasharray: "0 163.36" }}
                  animate={{ strokeDasharray: `${(progress / 100) * 163.36} 163.36` }}
                  transition={{ duration: 0.3 }}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f472b6" />
                    <stop offset="100%" stopColor="#f43f5e" />
                  </linearGradient>
                </defs>
              </svg>

              {/* 猫咪表情 */}
              <span className="relative z-10">{mood.emoji}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 移动端适配 */}
      <style>{`
        @media (max-width: 640px) {
          .fixed.bottom-24.left-6.z-\\[9999\\] {
            bottom: 6rem !important;
            left: 1rem !important;
          }
          .fixed.bottom-24.left-6.z-\\[9999\\] button {
            width: 2.5rem !important;
            height: 2.5rem !important;
            font-size: 1.5rem !important;
          }
        }
      `}</style>
    </>
  );
};

export default ReadingCat;
