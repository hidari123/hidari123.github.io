/**
 * 标签筛选器
 *
 * 两层结构，对应两种阅读意图：
 * - 主分类走横向 tab（带计数）：「我要看前端」这种粗粒度导航，选一个就一个
 * - 技术标签走可展开的多选面板 + 输入框：细粒度、可多选、能自己加
 *
 * 关于自定义标签：写在 localStorage，只对这台设备生效。这是有意的 ——
 * 把读者输入提交到仓库需要一整套鉴权和审核流程，而收益远小于代价。
 * 自动分类会有归错的时候，给人一个本地出口就够了。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Tag, Plus, X, Check, ChevronDown } from "lucide-react";
import {
  CATEGORY_TAGS,
  countByCategory,
  countByTechTag,
  loadCustomTags,
  saveCustomTags,
  addCustomTag,
  removeCustomTag,
} from "@/data/tags";
import type { Post } from "@/services/blogService";

interface TagFilterProps {
  posts: Post[];
  /** 当前选中的主分类，null = 全部 */
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  /** 当前选中的技术标签集合 */
  selectedTech: string[];
  onTechChange: (tags: string[]) => void;
}

export const TagFilter = ({
  posts,
  selectedCategory,
  onCategoryChange,
  selectedTech,
  onTechChange,
}: TagFilterProps) => {
  const [techOpen, setTechOpen] = useState(false);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [draftTag, setDraftTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // localStorage 只在客户端有；SSR/首帧读取要留空，避免 hydration 不一致
  useEffect(() => {
    setCustomTags(loadCustomTags());
  }, []);

  const categoryCounts = useMemo(() => countByCategory(posts), [posts]);

  // 只显示出现 >= 2 次的技术标签，并按次数降序。
  // 一次性的标签塞进筛选器只会制造「点了只剩一篇」的挫败感。
  const techOptions = useMemo(() => countByTechTag(posts, 2), [posts]);

  const toggleTech = (tag: string) => {
    onTechChange(
      selectedTech.includes(tag)
        ? selectedTech.filter((t) => t !== tag)
        : [...selectedTech, tag],
    );
  };

  const handleAddCustom = () => {
    const trimmed = draftTag.trim();
    if (!trimmed) return;
    const next = addCustomTag(customTags, trimmed);
    setCustomTags(next);
    saveCustomTags(next);
    setDraftTag("");
    // 新加的标签直接选中，否则「加了但没生效」是最容易让人放弃的交互
    if (next.includes(trimmed) && !selectedTech.includes(trimmed)) {
      onTechChange([...selectedTech, trimmed]);
    }
  };

  const handleRemoveCustom = (tag: string) => {
    const next = removeCustomTag(customTags, tag);
    setCustomTags(next);
    saveCustomTags(next);
    if (selectedTech.includes(tag)) {
      onTechChange(selectedTech.filter((t) => t !== tag));
    }
  };

  const hasFilter = selectedCategory !== null || selectedTech.length > 0;

  const clearAll = () => {
    onCategoryChange(null);
    onTechChange([]);
  };

  return (
    <div className="mb-10">
      {/* 主分类：横向 tab */}
      <div
        className="flex flex-wrap gap-2 mb-3"
        role="tablist"
        aria-label="文章分类"
      >
        <CategoryTab
          label="全部"
          count={posts.length}
          active={selectedCategory === null}
          onClick={() => onCategoryChange(null)}
        />
        {CATEGORY_TAGS.map((category) => {
          const count = categoryCounts[category] ?? 0;
          // 0 篇的分类不占位置
          if (count === 0) return null;
          return (
            <CategoryTab
              key={category}
              label={category}
              count={count}
              active={selectedCategory === category}
              onClick={() =>
                onCategoryChange(selectedCategory === category ? null : category)
              }
            />
          );
        })}
      </div>

      {/* 技术标签：可折叠的多选面板 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTechOpen((v) => !v)}
          aria-expanded={techOpen}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            selectedTech.length > 0
              ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
              : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          技术标签
          {selectedTech.length > 0 && ` (${selectedTech.length})`}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-300 ${
              techOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* 已选标签常驻显示，不用展开就能看到当前状态 */}
        {selectedTech.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTech(tag)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-white transition-colors"
          >
            {tag}
            <X className="w-3 h-3" />
          </button>
        ))}

        {hasFilter && (
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline underline-offset-4 transition-colors"
          >
            清空筛选
          </button>
        )}
      </div>

      {techOpen && (
        <div className="mt-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
          <div className="flex flex-wrap gap-2 mb-4">
            {techOptions.map(({ tag, count }) => {
              const active = selectedTech.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTech(tag)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                  {tag}
                  <span className={active ? "opacity-80" : "opacity-50"}>{count}</span>
                </button>
              );
            })}
            {techOptions.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                还没有出现两次以上的技术标签。
              </p>
            )}
          </div>

          {/* 自定义标签 */}
          <div className="pt-4 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              自动分类总有归错的时候。加一个你自己的标签，存在这台设备上。
            </p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={draftTag}
                onChange={(e) => setDraftTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="输入标签后回车"
                maxLength={20}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <button
                onClick={handleAddCustom}
                disabled={!draftTag.trim()}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Plus className="w-4 h-4" />
                添加
              </button>
            </div>

            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {customTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-[var(--bg-secondary)] border border-dashed border-[var(--accent)]/40 text-[var(--text-secondary)]"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveCustom(tag)}
                      aria-label={`删除标签 ${tag}`}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface CategoryTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const CategoryTab = ({ label, count, active, onClick }: CategoryTabProps) => (
  <button
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
      active
        ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
        : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
    }`}
  >
    {label}
    <span className={active ? "opacity-80" : "opacity-50"}>{count}</span>
  </button>
);