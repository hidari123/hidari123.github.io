/**
 * 目录导航
 *
 * 两个职责：
 * 1. 点击跳转（平滑滚动 + 避开固定导航条 + 更新 hash）
 * 2. 阅读位置高亮（IntersectionObserver 标记当前章节）
 *
 * 为什么不用原生 `href="#id"`：
 *   - 页面有 64px 固定导航条，直接跳会把标题压在导航下面，看不出跳到哪了
 *   - 原生跳转不更新滚动进度条的观感，浏览器行为也不一致
 * 所以走 preventDefault + scrollIntoView，hash 仍然手动写回（保留可分享的链接）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { List } from "lucide-react";
import type { TocItem } from "../../utils/toc";

// 与 Layout 里 Navbar 的 h-16 对齐
const HEADER_OFFSET = 64;

interface TocProps {
  items: TocItem[];
  /** 移动端折叠式目录 */
  variant?: "sidebar" | "collapsible";
  onNavigate?: () => void;
}

export const Toc = ({ items, variant = "sidebar", onNavigate }: TocProps) => {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

  const scrollToId = useCallback(
    (id: string) => {
      const target = document.getElementById(id);
      if (!target) return;

      const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET - 16;
      window.scrollTo({ top, behavior: "smooth" });

      // 手动同步 hash：既让链接可分享，又不触发浏览器的原生跳转
      window.history.replaceState(null, "", `#${id}`);
      setActiveId(id);
      onNavigate?.();
    },
    [onNavigate],
  );

  // 阅读位置高亮：取当前视口顶部往上第一个完整露出的标题
  useEffect(() => {
    if (items.length === 0) return;

    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 选最后一个"已经越过顶部线"的标题
        const passed = entries
          .filter((e) => e.boundingClientRect.top <= HEADER_OFFSET + 24)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (passed.length > 0) {
          setActiveId(passed[passed.length - 1].target.id);
        } else if (window.scrollY < 100) {
          setActiveId(headings[0].id);
        }
      },
      { rootMargin: `-${HEADER_OFFSET}px 0px -70% 0px`, threshold: [0, 1] },
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const levelClass = (level: number) =>
    level === 1 ? "" : level === 2 ? "ml-3" : "ml-6";

  if (variant === "collapsible") {
    return (
      <nav ref={navRef} className="space-y-1" aria-label="文章目录">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToId(item.id)}
            className={`block w-full text-left text-sm py-1 transition-colors ${levelClass(item.level)} ${
              activeId === item.id
                ? "text-[var(--accent)] font-medium"
                : "text-[var(--text-secondary)] hover:text-[var(--accent)]"
            }`}
          >
            {item.text}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav ref={navRef} className="space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto" aria-label="文章目录">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToId(item.id)}
          className={`block w-full text-left text-sm py-1.5 border-l-2 pl-3 transition-colors ${
            levelClass(item.level)
          } ${
            activeId === item.id
              ? "text-[var(--accent)] border-[var(--accent)] font-medium"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40"
          }`}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
};

/** 桌面端侧边栏 */
export const TocSidebar = ({ items }: { items: TocItem[] }) => {
  if (items.length === 0) return null;

  return (
    <aside className="hidden lg:block w-64 flex-shrink-0" aria-label="目录侧边栏">
      <div className="sticky top-24">
        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)] flex items-center gap-2">
            <List className="w-4 h-4 text-[var(--accent)]" />
            目录
            <span className="ml-auto text-xs font-normal text-[var(--text-secondary)]">
              {items.length} 节
            </span>
          </h2>
          <Toc items={items} />
        </div>
      </div>
    </aside>
  );
};

/** 移动端折叠目录 */
export const TocCollapsible = ({ items }: { items: TocItem[] }) => {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="lg:hidden mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-3 bg-[var(--bg-secondary)] rounded-xl text-sm font-medium"
      >
        <List className="w-4 h-4 text-[var(--accent)]" />
        目录
        <span className="text-xs text-[var(--text-secondary)]">{items.length} 节</span>
        <span className="ml-auto text-[var(--text-secondary)]">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="mt-2 p-4 bg-[var(--bg-secondary)] rounded-xl">
          <Toc items={items} variant="collapsible" onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
};