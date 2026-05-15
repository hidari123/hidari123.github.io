/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 15:32:54
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AIChat } from "@/components/AI/AIChat";
import { BackToTop, ScrollProgress } from "@/components/Common/BackToTop";
import { CustomCursor } from "@/components/Common/CustomCursor";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* 自定义光标 */}
      <CustomCursor />

      {/* 星星装饰层 */}
      <div className="cute-decoration" />

      {/* 亮色主题漂浮爱心层 */}
      <div className="floating-hearts" />

      {/* 暗色主题闪闪星光层 */}
      <div className="twinkle-stars" />

      {/* 三个漂浮毛绒球 */}
      <div className="fluffy-ball fluffy-ball-1" />
      <div className="fluffy-ball fluffy-ball-2" />
      <div className="fluffy-ball fluffy-ball-3" />

      {/* 页面滚动进度条 */}
      <ScrollProgress />

      <Navbar />

      <main className="flex-grow pt-16 relative z-10">{children}</main>

      <Footer />

      {/* 全局 AI 聊天组件 */}
      <AIChat />

      {/* 返回顶部按钮 */}
      <BackToTop />
    </div>
  );
};
