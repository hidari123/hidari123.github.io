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
import { List, ChevronRight, PanelRightClose } from "lucide-react";
import type { TocItem } from "../../utils/toc";

// 与 Layout 里 Navbar 的 h-16 对齐
const HEADER_OFFSET = 64;

interface TocProps {
  items: TocItem[];
  /** 移动端折叠式目录 */
  variant?: "sidebar" | "collapsible";
  onNavigate?: () => void;
  /** 当前章节变化时回调，供移动端折叠条显示「你在哪」 */
  onActiveChange?: (text: string) => void;
}

export const Toc = ({ items, variant = "sidebar", onNavigate, onActiveChange }: TocProps) => {
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

  // 把当前章节的文字抛给外层（移动端折叠条用它显示「你在哪」）
  useEffect(() => {
    const current = items.find((i) => i.id === activeId);
    if (current) onActiveChange?.(current.text);
  }, [activeId, items, onActiveChange]);

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

/**
 * 桌面端悬浮目录
 *
 * 之前这个组件是文章内容里的一坨（把 5913 字节的目录硬塞进正文流），
 * 三个问题：占正文宽度、滚动到下面就看不到了、收起就得跳回文章开头。
 *
 * 现在改成：
 * 1. fixed 悬浮在视口右侧，不占文档流
 * 2. 滚动到正文开始之前隐藏 —— 读者还在看封面和标题的时候，
 *    右侧飘一个目录框是纯噪音
 * 3. 可收起：收起后只剩一条 28px 宽的竖 tab，不占任何横向空间
 * 4. 状态记在 localStorage：跳到另一篇文章不该重新展开
 */
export const TocSidebar = ({ items }: { items: TocItem[] }) => {
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("toc_collapsed") === "1";
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 正文开始位置由一个 0 高度的哨兵标记。
  // 不用 scrollY 硬编码阈值 —— 文章长度不一样，同一个阈值在不同文章里
  // 触发时机完全不同。
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("toc_collapsed", next ? "1" : "0");
      } catch {
        // 隐私模式写不了，忽略 —— 折叠状态不值得报错
      }
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0 w-full" />

      {/* 收起态：一条细长的 tab */}
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          aria-label="展开目录"
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-2 w-7 py-4 rounded-l-xl bg-[var(--bg-card)] border border-r-0 border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all duration-300 ${
            visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full pointer-events-none"
          }`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
          <span
            className="text-xs tracking-widest"
            style={{ writingMode: "vertical-rl" }}
          >
            目录
          </span>
        </button>
      )}

      {/* 展开态：右侧悬浮面板 */}
      {!collapsed && (
        <aside
          aria-label="目录侧边栏"
          className={`fixed right-6 top-28 z-30 w-60 hidden lg:block transition-all duration-300 ${
            visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
          }`}
        >
          <div className="p-4 bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-xl border border-[var(--border)] shadow-lg max-h-[calc(100vh-9rem)] flex flex-col">
            <div className="flex items-center gap-2 mb-3 text-[var(--text-primary)]">
              <List className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">目录</h2>
              <span className="ml-auto text-xs font-normal text-[var(--text-secondary)]">
                {items.length} 节
              </span>
              <button
                onClick={toggleCollapsed}
                aria-label="收起目录"
                title="收起目录"
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0">
              <Toc items={items} />
            </div>
          </div>
        </aside>
      )}
    </>
  );
};

/**
 * 移动端目录
 *
 * 折叠成顶部一条横条，sticky 跟着视口 —— 之前是普通文档流元素，
 * 往下滑两屏就找不回来了。收起状态显示当前章节，读者知道自己在哪。
 *
 * 注意：即使折叠，内部那个跟踪当前章节的 Toc 也必须保持挂载。
 * 之前写成 `{open && <Toc .../>}`，一折叠 IntersectionObserver 就被卸载，
 * 章节高亮永久停在第一节 —— 展开时看到的永远是第一条。
 */
export const TocCollapsible = ({ items }: { items: TocItem[] }) => {
  const [open, setOpen] = useState(false);
  const [activeText, setActiveText] = useState<string>("");

  if (items.length === 0) return null;

  return (
    <div className="lg:hidden mb-6 sticky top-16 z-20">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-3 bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-xl border border-[var(--border)] text-sm font-medium shadow-sm"
      >
        <List className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <span className="truncate text-[var(--text-primary)]">
          {activeText || "目录"}
        </span>
        <span className="ml-auto shrink-0 text-xs text-[var(--text-secondary)]">
          {open ? "收起" : `${items.length} 节`}
        </span>
      </button>

      {/* 折叠时也需要它挂载：观察器是这个组件的职责，不能跟着 UI 一起卸载 */}
      <div
        className={`overflow-y-auto transition-all duration-300 ${
          open
            ? "mt-2 max-h-[60vh] opacity-100"
            : "max-h-0 opacity-0 overflow-hidden pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="p-4 bg-[var(--bg-card)]/98 backdrop-blur-sm rounded-xl border border-[var(--border)] shadow-lg">
          <Toc
            items={items}
            variant="collapsible"
            onNavigate={() => setOpen(false)}
            onActiveChange={setActiveText}
          />
        </div>
      </div>
    </div>
  );
};