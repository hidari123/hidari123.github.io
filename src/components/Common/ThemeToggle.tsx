/*
 * @Author: hidari
 * @Date: 2026-05-13 14:54:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 14:54:39
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors duration-300"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label="切换主题"
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === "dark" ? 180 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {theme === "dark" ? (
          <Moon className="w-5 h-5 text-[var(--text-primary)]" />
        ) : (
          <Sun className="w-5 h-5 text-[var(--accent)]" />
        )}
      </motion.div>
    </motion.button>
  );
};
