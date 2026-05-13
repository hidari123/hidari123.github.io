/*
 * @Author: hidari
 * @Date: 2026-05-13 14:55:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 14:55:04
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { Heart } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="text-[var(--text-secondary)] text-sm">
            © 2026 AI Blog. All rights reserved.
          </div>

          <div className="flex items-center space-x-2 text-[var(--text-secondary)] text-sm">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-red-500 fill-current" />
            <span>using React + TypeScript + Vite</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
