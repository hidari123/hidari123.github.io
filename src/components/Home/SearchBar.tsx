/*
 * @Author: hidari
 * @Date: 2026-05-14 14:01:25
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 14:01:39
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
/**
 * 工具搜索组件
 */
import { Search, X } from "lucide-react";
import { motion } from "framer-motion";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = ({ value, onChange, placeholder = "搜索工具..." }: SearchBarProps) => {
  const handleClear = () => {
    onChange("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8"
    >
      {/* 搜索图标 */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Search className="w-5 h-5 text-[var(--text-secondary)]" />
      </div>

      {/* 输入框 */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-12 py-3 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] 
                   text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50
                   focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                   transition-all duration-300"
      />

      {/* 清除按钮 */}
      {value && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          onClick={handleClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full
                     hover:bg-[var(--bg-secondary)] transition-colors duration-200"
        >
          <X className="w-4 h-4 text-[var(--text-secondary)]" />
        </motion.button>
      )}

      {/* 搜索指示 */}
      {value && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <kbd className="hidden sm:inline-flex px-2 py-1 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded border border-[var(--border-color)]">
            ESC
          </kbd>
        </div>
      )}
    </motion.div>
  );
};
