/*
 * @Author: hidari
 * @Date: 2026-05-13 16:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:46:37
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Clock, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getArticleComments } from "@/services/commentService";

// 解析后的评论类型
interface CommentData {
  id: number;
  name: string;
  email?: string;
  body: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  created_at: string;
}

interface CommentsProps {
  issueNumber: number;
  onRefresh?: () => void;
}

// 格式化日期
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 单条评论组件
const CommentItem = ({ comment }: { comment: CommentData }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex gap-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]"
  >
    {/* 头像 */}
    <div className="flex-shrink-0">
      <img
        src={comment.user.avatar_url}
        alt={comment.name}
        className="w-10 h-10 rounded-full border-2 border-[var(--border)]"
      />
    </div>

    {/* 内容 */}
    <div className="flex-1 min-w-0">
      {/* 头部信息 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-[var(--text-primary)]">{comment.name}</span>
        {comment.user.login !== comment.name && (
          <a
            href={comment.user.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            @{comment.user.login}
          </a>
        )}
        <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(comment.created_at)}
        </span>
      </div>

      {/* 评论内容（支持 Markdown） */}
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
      </div>
    </div>
  </motion.div>
);

// 加载骨架屏
const CommentSkeleton = () => (
  <div className="flex gap-4 p-4 animate-pulse">
    <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)]"></div>
    <div className="flex-1">
      <div className="h-4 bg-[var(--bg-secondary)] rounded w-1/4 mb-2"></div>
      <div className="space-y-2">
        <div className="h-3 bg-[var(--bg-secondary)] rounded"></div>
        <div className="h-3 bg-[var(--bg-secondary)] rounded w-5/6"></div>
      </div>
    </div>
  </div>
);

// 空状态
const EmptyComments = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-center py-12 text-[var(--text-secondary)]"
  >
    <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
    <p className="text-lg mb-2">暂无评论</p>
    <p className="text-sm">成为第一个评论的人吧！</p>
  </motion.div>
);

// 错误状态
const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
    <AlertCircle className="w-10 h-10 mx-auto mb-4 text-red-500" />
    <p className="text-red-500 mb-4">{message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
    >
      重试
    </button>
  </motion.div>
);

export const Comments = ({ issueNumber, onRefresh }: CommentsProps) => {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArticleComments(issueNumber);
      // 按时间倒序排列
      setComments(
        data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载评论失败");
    } finally {
      setLoading(false);
    }
  }, [issueNumber]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // 监听刷新事件
  useEffect(() => {
    const handleRefresh = () => {
      loadComments();
    };
    window.addEventListener("refresh-comments", handleRefresh);
    return () => window.removeEventListener("refresh-comments", handleRefresh);
  }, [loadComments]);

  return (
    <div className="mt-12 pt-8 border-t border-[var(--border)]">
      {/* 标题 */}
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-[var(--accent)]" />
        评论
        {comments.length > 0 && (
          <span className="text-lg font-normal text-[var(--text-secondary)]">
            ({comments.length})
          </span>
        )}
      </h2>

      {/* 评论列表 */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <CommentSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadComments} />
      ) : comments.length === 0 ? (
        <EmptyComments />
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
};

// 导出刷新函数
export const refreshComments = () => {
  window.dispatchEvent(new CustomEvent("refresh-comments"));
};
