/**
 * 返回顶部按钮 - 小猫爪
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, PawPrint } from "lucide-react";

export const BackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // 监听滚动
  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3 }}
          onClick={scrollToTop}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="fixed bottom-24 right-6 z-50 w-14 h-14 rounded-full
                     bg-gradient-to-br from-pink-400 to-purple-500
                     shadow-lg shadow-pink-500/25
                     flex items-center justify-center
                     hover:shadow-xl hover:shadow-pink-500/30
                     active:scale-95
                     transition-all duration-300
                     group"
          aria-label="返回顶部"
        >
          <motion.div
            animate={{
              y: isHovered ? [0, -4, 0] : 0,
            }}
            transition={{
              duration: 0.6,
              repeat: isHovered ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            {/* 悬停时换成猫爪图标（lucide 版本，不受系统 emoji 字体影响） */}
            {isHovered ? (
              <PawPrint className="w-6 h-6 text-white" />
            ) : (
              <ChevronUp className="w-6 h-6 text-white" />
            )}
          </motion.div>

          {/* 悬停提示 */}
          <span
            className={`absolute -top-10 px-3 py-1 text-xs font-medium text-white 
                       bg-gray-900/90 rounded-lg whitespace-nowrap
                       transition-opacity duration-200 pointer-events-none
                       ${isHovered ? "opacity-100" : "opacity-0"}`}
          >
            回到顶部
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

/**
 * 页面滚动进度条
 */
export const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);

  /*
    原来这里是 framer-motion + 每像素 setState：
      window.addEventListener("scroll", updateProgress);  // 无节流
      setProgress(scrollTop / docHeight * 100);          // 浮点，每像素都变
      <motion.div style={{ scaleX: progress / 100 }} /> // 逐帧补间

    三个问题叠在一起，就是「页面一直纵向抖」：
      1. scroll 事件不节流，一帧可能触发几十次
      2. setState 触发 React 重渲，ReadingCat 等兄弟组件跟着一起渲
      3. framer-motion 拿到每帧变化的浮点会持续补间，动画循环
         反复打断合成器

    现在：完全不走 React。rAF 节流 + 直接写 DOM 的 transform。
    浏览器把它当成纯合成层动画，不触发任何重渲，不读布局。
    顺带去掉 motion 依赖。
  */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let frame = 0;

    const update = () => {
      frame = 0;

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      // 内容比视口还短时 docHeight <= 0，要先挡掉，否则得到 -Infinity
      const ratio = docHeight > 0 ? window.scrollY / docHeight : 0;
      const clamped = Math.max(0, Math.min(1, ratio));

      bar.style.transform = `scaleX(${clamped})`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-label="阅读进度"
      className="fixed top-0 left-0 right-0 h-1 z-[60] origin-left will-change-transform"
      style={{
        transform: "scaleX(0)",
        background: "linear-gradient(90deg, #f9a8d4, #a78bfa, #818cf8)",
      }}
    />
  );
};
