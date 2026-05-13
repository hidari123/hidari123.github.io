/*
 * @Author: hidari
 * @Date: 2026-05-13 16:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:47:20
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, AlertCircle, CheckCircle, Lock, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { createComment, getConfigStatus } from "@/services/commentService";
import { refreshComments } from "./Comments";

interface CommentFormProps {
  issueNumber: number;
}

export const CommentForm = ({ issueNumber }: CommentFormProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const configStatus = getConfigStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // 表单验证
    if (!name.trim()) {
      setError("请输入昵称");
      return;
    }
    if (!content.trim()) {
      setError("请输入评论内容");
      return;
    }

    // 检查配置
    if (!configStatus.isComplete) {
      setError("请先配置 GitHub Token 和仓库信息");
      return;
    }

    setLoading(true);
    try {
      await createComment(issueNumber, content.trim(), name.trim(), email.trim() || undefined);
      setSuccess(true);
      setContent("");
      // 刷新评论列表
      refreshComments();
      // 3秒后隐藏成功消息
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发表评论失败");
    } finally {
      setLoading(false);
    }
  };

  // 未配置 Token 或仓库时显示提示
  if (!configStatus.isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]"
      >
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">发表评论</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              需要配置 GitHub Token 才能发表评论。
              {!configStatus.hasRepo && " 请先配置仓库信息。"}
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm"
            >
              <Settings className="w-4 h-4" />
              前往设置
            </Link>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]"
    >
      <h3 className="text-lg font-semibold mb-4">发表评论</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 昵称和邮箱 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              昵称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入昵称"
              className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              邮箱 <span className="text-[var(--text-secondary)]">(可选)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="选填，用于接收回复通知"
              className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* 评论内容 */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            评论内容 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="支持 Markdown 格式..."
            rows={5}
            className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
          />
        </div>

        {/* 提示信息 */}
        <p className="text-xs text-[var(--text-secondary)]">
          支持 Markdown 格式，支持代码块、链接等常用语法
        </p>

        {/* 错误信息 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-red-500/10 text-red-500 rounded-lg text-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        {/* 成功信息 */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-green-500/10 text-green-500 rounded-lg text-sm"
          >
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            评论发表成功！
          </motion.div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              提交中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              发表评论
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
};
