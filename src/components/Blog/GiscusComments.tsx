/*
 * @Author: hidari
 * @Date: 2026-05-14 09:24
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 09:24:53
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useEffect, useMemo, useState } from "react";
import Giscus from "@giscus/react";
import { getGiscusConfig, isGiscusConfigured } from "@/config/giscus";

interface GiscusCommentsProps {
  slug: string;
}

export const GiscusComments = ({ slug }: GiscusCommentsProps) => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // 配置来自 src/config/giscus.ts（进版本库）+ 可选的 VITE_GISCUS_* 环境变量覆盖。
  // 不再依赖 .env 里的四个值必须跟着构建走 —— 上一轮就是因为 .env 被 untrack，
  // CI 拿不到配置，线上评论直接消失。
  const config = useMemo(() => getGiscusConfig(), []);
  const configured = isGiscusConfigured(config);

  // 监听主题变化
  useEffect(() => {
    // 获取当前主题
    const getCurrentTheme = () => {
      const htmlTheme = document.documentElement.getAttribute("data-theme");
      return (htmlTheme === "dark" ? "dark" : "light") as "light" | "dark";
    };

    // 初始主题
    setTheme(getCurrentTheme());

    // 监听主题变化
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          setTheme(getCurrentTheme());
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  // 如果未配置，显示提示
  if (!configured) {
    return (
      <div className="mt-12 pt-8 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 mb-6">
          <svg
            className="w-5 h-5 text-[var(--accent)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h2 className="text-xl font-bold">评论</h2>
        </div>

        <div className="p-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] text-center">
          <div className="text-4xl mb-4">💬</div>
          <h3 className="text-lg font-medium mb-2">评论区未配置</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            要启用评论区，请配置 Giscus 环境变量
          </p>
          <div className="text-left bg-[var(--bg-secondary)] rounded-lg p-4 text-sm">
            <p className="text-[var(--text-secondary)] mb-2">在 src/config/giscus.ts 里填写：</p>
            <pre className="bg-[var(--bg-primary)] rounded p-2 overflow-x-auto">
              {`GISCUS_CONFIG = {
  repo: "用户名/仓库名",
  repoId: "你的仓库ID",
  category: "Announcements",
  categoryId: "你的分类ID",
}`}
            </pre>
            <p className="text-[var(--text-secondary)] mt-3">
              访问{" "}
              <a
                href="https://giscus.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                giscus.app
              </a>{" "}
              获取配置参数
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12 pt-8 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-6">
        <svg
          className="w-5 h-5 text-[var(--accent)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <h2 className="text-xl font-bold">评论</h2>
      </div>

      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
        <Giscus
          id={`comments-${slug}`}
          repo={config.repo as `${string}/${string}`}
          repoId={config.repoId}
          category={config.category}
          categoryId={config.categoryId}
          mapping="pathname"
          strict="0"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="bottom"
          theme={theme}
          lang="zh-CN"
          loading="lazy"
        />
      </div>
    </div>
  );
};
