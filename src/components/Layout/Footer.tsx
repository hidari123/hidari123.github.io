/*
 * @Author: hidari
 * @Date: 2026-05-13 14:55:01
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 16:54:14
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
/**
 * 页脚组件 - 可爱风格
 */
import { Github, Twitter, Mail, Rss } from "lucide-react";
import { motion } from "framer-motion";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: Github, href: "https://github.com/hidari123", label: "GitHub" },
    { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
    { icon: Mail, href: "mailto:hello@example.com", label: "邮箱" },
    { icon: Rss, href: "/rss.xml", label: "RSS" },
  ];

  return (
    <footer className="mt-20 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50">
      <div className="container py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* 左侧：版权信息 */}
          <div className="text-center md:text-left">
            <p className="text-sm text-[var(--text-secondary)]">
              © {currentYear} All rights reserved.
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Made with ❤️ and 🤖</p>
          </div>

          {/* 中间：社交链接 */}
          <div className="flex items-center gap-4">
            {socialLinks.map((link) => (
              <motion.a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
                           hover:border-[var(--accent)] hover:text-[var(--accent)]
                           transition-all duration-300"
                whileHover={{ scale: 1.1, y: -2 }}
                whileTap={{ scale: 0.95 }}
                aria-label={link.label}
              >
                <link.icon className="w-5 h-5" />
              </motion.a>
            ))}
          </div>

          {/* 右侧：备案信息 */}
          <div className="text-center md:text-right">
            <p className="text-xs text-[var(--text-muted)]">
              Powered by Vite + React + TailwindCSS
            </p>
          </div>
        </div>

        {/* 底部装饰 */}
        <div className="mt-8 flex justify-center gap-2">
          {[...Array(5)].map((_, i) => (
            <motion.span
              key={i}
              className="text-lg"
              animate={{
                y: [0, -5, 0],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            >
              ✨
            </motion.span>
          ))}
        </div>
      </div>
    </footer>
  );
};
