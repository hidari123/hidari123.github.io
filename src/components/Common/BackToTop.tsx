/**
 * 返回顶部按钮 - 小猫爪 🐾
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";

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
            {isHovered ? (
              <span className="text-2xl">🐾</span>
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
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollProgress = (scrollTop / docHeight) * 100;
      setProgress(scrollProgress);
    };

    window.addEventListener("scroll", updateProgress);
    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 z-[60] origin-left"
      style={{
        scaleX: progress / 100,
        background: "linear-gradient(90deg, #f9a8d4, #a78bfa, #818cf8)",
      }}
    />
  );
};
