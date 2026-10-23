/*
 * @Author: hidari
 * @Date: 2026-05-13 14:58:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout/Layout";
import { Home } from "@/pages/Home";
import { LoadingSpinner } from "@/components/Common/LoadingSpinner";
import { AIProvider } from "@/context/AIContext";

/*
 * 首页静态引入，因为它是 LCP 目标——懒加载它反而会推迟首屏。
 * 其余全部按路由切分：
 *   - AIPage 拖进 react-markdown + AIChat + ONNX 相关的依赖链
 *   - BlogPost 拖进 prismjs 全家桶 + Giscus
 *   - Settings / AIHelp 是低频页面
 * 之前这些都堆在一个 803KB（gzip 232KB）的主 chunk 里。
 */
const BlogList = lazy(() => import("@/pages/BlogList").then((m) => ({ default: m.BlogList })));
const BlogPost = lazy(() => import("@/pages/BlogPost").then((m) => ({ default: m.BlogPost })));
const AIPage = lazy(() => import("@/pages/AIPage").then((m) => ({ default: m.AIPage })));
const AIHelp = lazy(() => import("@/pages/AIHelp").then((m) => ({ default: m.AIHelp })));
const SettingsPage = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const NotFound = lazy(() => import("@/pages/NotFound").then((m) => ({ default: m.NotFound })));

/**
 * 路由级兜底。
 * min-height 给足，避免切页时页面塌陷导致 ScrollProgress 归零再跳一次。
 */
const RouteFallback = () => (
  <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
    <LoadingSpinner size="lg" text="加载中..." />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AIProvider>
        <Layout>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/blog" element={<BlogList />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/ai-help" element={<AIHelp />} />
              <Route path="/ai" element={<AIPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Layout>
      </AIProvider>
    </BrowserRouter>
  );
}

export default App;