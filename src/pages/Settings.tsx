/*
 * @Author: hidari
 * @Date: 2026-05-13 16:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:17:31
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Github, Eye, EyeOff, Check, AlertCircle, ExternalLink } from "lucide-react";

export const SettingsPage = () => {
  const [githubToken, setGithubToken] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 加载现有配置
  useEffect(() => {
    const savedToken = localStorage.getItem("github_token") || "";
    setGithubToken(savedToken);
    setRepoOwner(import.meta.env.VITE_GITHUB_REPO_OWNER || "");
    setRepoName(import.meta.env.VITE_GITHUB_REPO_NAME || "");
  }, []);

  const handleSave = () => {
    setError(null);
    setSaved(false);

    // 保存 Token 到 localStorage
    if (githubToken.trim()) {
      localStorage.setItem("github_token", githubToken.trim());
    } else {
      localStorage.removeItem("github_token");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClearToken = () => {
    setGithubToken("");
    localStorage.removeItem("github_token");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTestConnection = async () => {
    if (!repoOwner.trim() || !repoName.trim()) {
      setTestResult({ success: false, message: "请先填写仓库信息" });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const token = githubToken.trim() || localStorage.getItem("github_token");
      const headers: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${repoOwner.trim()}/${repoName.trim()}`,
        { headers },
      );

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: `连接成功！仓库: ${data.full_name}`,
        });
      } else if (response.status === 404) {
        setTestResult({
          success: false,
          message: "仓库不存在，请检查 owner 和 repo 名称",
        });
      } else if (response.status === 401) {
        setTestResult({
          success: false,
          message: "Token 无效，请检查 Token 是否正确",
        });
      } else {
        setTestResult({
          success: false,
          message: `连接失败: ${response.status}`,
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `连接失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          {/* 标题 */}
          <div className="text-center mb-8">
            <Settings className="w-12 h-12 mx-auto mb-4 text-[var(--accent)]" />
            <h1 className="text-3xl font-bold mb-2">评论设置</h1>
            <p className="text-[var(--text-secondary)]">配置 GitHub 仓库以启用评论区功能</p>
          </div>

          {/* 说明卡片 */}
          <div className="p-4 bg-[var(--accent)]/10 rounded-xl mb-8 border border-[var(--accent)]/20">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Github className="w-5 h-5" />
              如何获取 GitHub Personal Access Token
            </h3>
            <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
              <li>
                登录 GitHub，进入{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  Settings / Developer settings
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>点击 "Personal access tokens" → "Tokens (classic)"</li>
              <li>点击 "Generate new token" → "Generate new token (classic)"</li>
              <li>设置 Token 名称，选择过期时间</li>
              <li>
                在 "Select scopes" 中勾选以下权限：
                <ul className="ml-4 list-disc list-inside">
                  <li>repo (所有仓库) 或 repo:comments (仅评论)</li>
                </ul>
              </li>
              <li>点击 "Generate token" 并复制生成的 Token</li>
            </ol>
          </div>

          {/* 配置表单 */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6 space-y-6">
            {/* GitHub Token */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                GitHub Personal Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-2.5 pr-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                Token 将保存在浏览器的 localStorage 中
              </p>
            </div>

            {/* 仓库配置 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  仓库 Owner <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.target.value)}
                  placeholder="your-username"
                  className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  仓库名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="blog-comments"
                  className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>

            {/* 说明 */}
            <div className="p-4 bg-[var(--bg-secondary)] rounded-lg">
              <h4 className="font-medium text-sm mb-2">💡 关于仓库</h4>
              <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                <li>• 每篇博客文章会自动创建一个 Issue 作为评论区</li>
                <li>• Issue 标题格式：[Blog] {`{文章slug}`}</li>
                <li>• 评论会作为 Issue 的评论存在</li>
                <li>• 推荐创建一个专门的仓库来存放评论</li>
              </ul>
            </div>

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

            {/* 测试结果 */}
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  testResult.success
                    ? "bg-green-500/10 text-green-500"
                    : "bg-red-500/10 text-red-500"
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {testResult.message}
              </motion.div>
            )}

            {/* 按钮组 */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    已保存
                  </>
                ) : (
                  "保存设置"
                )}
              </button>

              <button
                onClick={handleTestConnection}
                disabled={testing || !repoOwner.trim() || !repoName.trim()}
                className="px-6 py-2.5 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {testing ? (
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
                    测试中...
                  </>
                ) : (
                  "测试连接"
                )}
              </button>

              {githubToken.trim() && (
                <button
                  onClick={handleClearToken}
                  className="px-6 py-2.5 text-red-500 border border-red-500/50 rounded-lg font-medium hover:bg-red-500/10 transition-colors flex items-center gap-2"
                >
                  清除 Token
                </button>
              )}
            </div>

            {/* 当前状态 */}
            <div className="pt-4 border-t border-[var(--border)]">
              <h4 className="text-sm font-medium mb-3">当前配置状态</h4>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label="GitHub Token"
                  status={!!githubToken.trim() || !!localStorage.getItem("github_token")}
                />
                <StatusBadge label="仓库 Owner" status={!!repoOwner.trim()} />
                <StatusBadge label="仓库名称" status={!!repoName.trim()} />
              </div>
            </div>
          </div>

          {/* 注意事项 */}
          <div className="mt-6 p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
            <h4 className="text-sm font-medium mb-2">⚠️ 注意事项</h4>
            <ul className="text-sm text-[var(--text-secondary)] space-y-1">
              <li>• 请勿将 Token 提交到公共仓库</li>
              <li>• Token 仅存储在浏览器本地，不会发送到服务器</li>
              <li>• 如果 Token 泄露，请立即在 GitHub 上撤销</li>
              <li>• 推荐设置 Token 过期时间，定期更新</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// 状态徽章组件
const StatusBadge = ({ label, status }: { label: string; status: boolean }) => (
  <span
    className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
      status
        ? "bg-green-500/10 text-green-500 border border-green-500/20"
        : "bg-red-500/10 text-red-500 border border-red-500/20"
    }`}
  >
    {status ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
    {label}: {status ? "已配置" : "未配置"}
  </span>
);
