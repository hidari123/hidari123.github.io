/*
 * @Author: hidari
 * @Date: 2026-05-13 14:58:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout/Layout";
import { Home } from "@/pages/Home";
import { Skeleton, SkeletonStatus } from "@/components/Common/Skeleton";
import { ErrorBoundary } from "@/components/Common/ErrorBoundary";
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
 * 路由级骨架。
 *
 * 原来是一个居中的转圈。转圈的问题不是难看，而是它不表达「正在加载什么」——
 * 切到文章页时用户不知道自己在等列表还是正文。
 * 现在按目标路由给对应的骨架形状：列表页出卡片阵列，详情页出文章骨架，
 * AI 页出面板轮廓。点击瞬间形状就对上了，感知等待时间明显变短。
 *
 * min-height 给足，避免切页时页面塌陷导致 ScrollProgress 归零再跳一次。
 */
const RouteFallback = () => {
  const { pathname } = useLocation();
  const isPost = pathname.startsWith("/blog/") && pathname !== "/blog";
  const isAI = pathname.startsWith("/ai");

  return (
    <div className="min-h-[calc(100vh-8rem)] skeleton-shimmer">
      {isPost ? (
        <div className="container">
          <Skeleton className="h-10 w-3/4 max-w-3xl mx-auto" />
          <Skeleton className="h-4 w-40 max-w-3xl mx-auto mt-4" />
          <Skeleton className="h-56 w-full max-w-3xl mx-auto mt-8" rounded="rounded-2xl" />
        </div>
      ) : isAI ? (
        <div className="container max-w-4xl">
          <Skeleton className="h-14 w-full" rounded="rounded-2xl" />
        </div>
      ) : (
        <div className="container">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      )}
      <SkeletonStatus text="页面加载中" />
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AIProvider>
        <Layout>
          {/*
            整站包一层 ErrorBoundary。
            没有它，任何一个路由（或它的懒加载 chunk）抛错都会让 React
            卸载整棵树，页面直接白屏。有边界至少还能看到原因并重试。
          */}
          <ErrorBoundary title="页面没能加载出来">
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
          </ErrorBoundary>
        </Layout>
      </AIProvider>
    </BrowserRouter>
  );
}

export default App;