/**
 * 相关推荐
 *
 * 用现成的向量索引算余弦相似度，零新增成本：文章本身的向量已经算过了，
 * 这里只是把同一篇的所有块向量平均一下再比一遍。
 *
 * 两个关键设计：
 *
 * 1. 索引没就绪时整块不渲染。「相关阅读」下面空着很难看，
 *    静默不显示比显示一个空区块好——想用的人会自己去 /ai 页建索引。
 * 2. 相似度低于 0.35 的不显示。硬凑三条弱相关的文章，
 *    比没有推荐更伤阅读体验——读者会开始不信任这个功能。
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { findRelatedPosts, isRAGReady } from "@/services/ragService";

interface RelatedPostsProps {
  /** 当前文章的 slug，与 ragService 里 chunk.source 一致 */
  slug: string;
  /** 中文标题，用于展示 */
  title?: string;
}

/**
 * ragService 里的 chunk.source 形如 `/blogs/xxx.md`（因为正文是从这个 URL fetch 的），
 * 而路由用的是裸 slug。相关推荐的链接和语义搜索的结果都要转一次，
 * 否则生成的链接会变成 /blog//blogs/xxx.md。
 */
function sourceToSlug(source: string): string {
  const m = source.match(/\/blogs\/(.+)\.md$/);
  return m ? decodeURIComponent(m[1]) : source;
}

export const RelatedPosts = ({ slug }: RelatedPostsProps) => {
  const [related, setRelated] = useState<
    { source: string; title?: string; similarity: number }[]
  >([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 索引还没建好就到此为止，不做无谓的等待和错误提示
    if (!isRAGReady()) {
      setChecked(true);
      return;
    }

    // 索引里的 source 形如 /blogs/<slug>.md，这里转回路由用的裸 slug
    const source = `/blogs/${slug}.md`;

    findRelatedPosts(source, 3)
      .then((results) => {
        if (!cancelled) {
          setRelated(
            results.map((r) => ({
              ...r,
              source: sourceToSlug(r.source),
            })),
          );
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 三条都不到就整块不渲染
  if (!checked || related.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-12 pt-8 border-t border-[var(--border)]"
    >
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[var(--accent)]" />
        接着看
        <span className="text-xs font-normal text-[var(--text-secondary)]">
          按内容相似度算的
        </span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {related.map((item) => (
          <Link
            key={item.source}
            to={`/blog/${encodeURIComponent(item.source)}`}
            className="group p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/10 transition-all duration-300"
          >
            <div className="text-sm font-medium mb-2 line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
              {item.title ?? item.source}
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              {/* 相似度给个大概的感觉就行，不必精确到小数点后两位 */}
              <span className="opacity-60">相似度 {(item.similarity * 100).toFixed(0)}%</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
};